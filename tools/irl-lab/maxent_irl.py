#!/usr/bin/env python3
"""Maximum-entropy IRL for a heading-aware bicycle on an 8-connected grid.

The bicycle starts below a pond and must reach a goal above it. Grass covers
the map, a pond blocks the middle, and trees narrow the corridors to either
side. The bicycle has one of eight headings. It may steer left, go straight,
or steer right by 45 degrees, then advances one neighboring cell.

We observe expert paths but not the reward that produced them. MaxEnt IRL fits
weights for water, trees, reaching the goal, and steering by maximizing paths'
likelihood. Dynamic programming computes the partition function exactly; the
browser only visualizes checkpoints exported by this PyTorch script.

Run from the repository root:
    .venv/bin/python tools/irl-lab/maxent_irl.py
"""

import json
from pathlib import Path

import torch


WIDTH, HEIGHT = 13, 11
HORIZON = 16
START = (6, 10, 0)  # x, y, heading; heading 0 points north
GOAL = (6, 0)
DIRECTIONS = (
    (0, -1), (1, -1), (1, 0), (1, 1),
    (0, 1), (-1, 1), (-1, 0), (-1, -1),
)
STEERS = (-1, 0, 1)

# The pond occupies the middle. Tree stands on both sides leave two grass
# corridors, so good demonstrations naturally split left and right.
WATER = {
    (5, 4), (6, 4), (7, 4),
    (4, 5), (5, 5), (6, 5), (7, 5), (8, 5),
    (5, 6), (6, 6), (7, 6),
}
TREES = {
    (2, 3), (3, 3), (9, 3), (10, 3),
    (2, 4), (3, 4), (9, 4), (10, 4),
    (2, 5), (3, 5), (9, 5), (10, 5),
    (2, 6), (3, 6), (9, 6), (10, 6),
    (2, 7), (3, 7), (9, 7), (10, 7),
}

FEATURE_NAMES = ("water", "trees", "at goal", "steering")
TRUE_WEIGHTS = torch.tensor([-24.0, -12.0, 4.0, -0.25])
DEMONSTRATIONS = 1_000
SEED = 7
HERE = Path(__file__).resolve().parent
SITE_DATA = HERE.parent.parent / "static" / "demos" / "irl-maxent.json"


def state_id(x, y, heading):
    return ((y * WIDTH + x) * len(DIRECTIONS)) + heading


def decode_state(index):
    heading = index % len(DIRECTIONS)
    cell = index // len(DIRECTIONS)
    return cell % WIDTH, cell // WIDTH, heading


N_STATES = WIDTH * HEIGHT * len(DIRECTIONS)
START_STATE = state_id(*START)


def build_transitions():
    """Build deterministic heading-aware moves and their reward features."""
    next_state = torch.zeros((N_STATES, len(STEERS)), dtype=torch.long)
    valid = torch.zeros((N_STATES, len(STEERS)), dtype=torch.bool)
    features = torch.zeros((N_STATES, len(STEERS), len(FEATURE_NAMES)))

    for state in range(N_STATES):
        x, y, heading = decode_state(state)
        if (x, y) == GOAL:
            # Reaching the goal ends planning; one zero-reward self-loop keeps
            # the finite-horizon dynamic program rectangular.
            next_state[state, 1] = state
            valid[state, 1] = True
            features[state, 1, 2] = 1.0
            continue

        for action_index, steer in enumerate(STEERS):
            next_heading = (heading + steer) % len(DIRECTIONS)
            dx, dy = DIRECTIONS[next_heading]
            nx, ny = x + dx, y + dy
            if not (0 <= nx < WIDTH and 0 <= ny < HEIGHT):
                continue
            destination = (nx, ny)
            next_state[state, action_index] = state_id(nx, ny, next_heading)
            valid[state, action_index] = True
            features[state, action_index] = torch.tensor([
                float(destination in WATER),
                float(destination in TREES),
                float(destination == GOAL),
                float(abs(steer)),
            ])
        # A bicycle pointed out of a corner can have all three forward moves
        # outside the map. Let it rotate in place once so every DP state has a
        # finite continuation; ordinary interior motion still always advances.
        if not valid[state].any():
            next_state[state, 1] = state_id(x, y, (heading + 1) % len(DIRECTIONS))
            valid[state, 1] = True
            features[state, 1, 3] = 1.0
    return next_state, valid, features


NEXT_STATE, VALID_ACTION, TRANSITION_FEATURES = build_transitions()


def soft_values(weights):
    """Backward MaxEnt values; V[0,start] is log Z(weights)."""
    values = [None] * (HORIZON + 1)
    values[HORIZON] = torch.zeros(N_STATES)
    transition_rewards = TRANSITION_FEATURES @ weights
    for time in range(HORIZON - 1, -1, -1):
        q = transition_rewards + values[time + 1][NEXT_STATE]
        q = q.masked_fill(~VALID_ACTION, -torch.inf)
        values[time] = torch.logsumexp(q, dim=1)
    return values


def path_record(states):
    """JSON-friendly path, trimmed after the first arrival at the goal."""
    path = []
    for state in states:
        x, y, heading = decode_state(state)
        point = [x, y, heading]
        if not path or point[:2] != path[-1][:2]:
            path.append(point)
        if (x, y) == GOAL:
            break
    return path


def best_path(weights):
    """Finite-horizon maximum-reward path under weights."""
    values = [None] * (HORIZON + 1)
    values[HORIZON] = torch.zeros(N_STATES)
    rewards = TRANSITION_FEATURES @ weights
    for time in range(HORIZON - 1, -1, -1):
        q = (rewards + values[time + 1][NEXT_STATE]).masked_fill(
            ~VALID_ACTION, -torch.inf
        )
        values[time] = q.max(dim=1).values

    state = START_STATE
    states = [state]
    for time in range(HORIZON):
        q = (rewards[state] + values[time + 1][NEXT_STATE[state]]).masked_fill(
            ~VALID_ACTION[state], -torch.inf
        )
        action = int(torch.argmax(q))
        state = int(NEXT_STATE[state, action])
        states.append(state)
        if decode_state(state)[:2] == GOAL:
            break
    return path_record(states)


def sample_demonstrations(count=DEMONSTRATIONS, seed=SEED):
    """Generate synthetic logged expert paths from the hidden reward."""
    values = soft_values(TRUE_WEIGHTS)
    rewards = TRANSITION_FEATURES @ TRUE_WEIGHTS
    generator = torch.Generator().manual_seed(seed)
    feature_counts = []
    paths = []

    for _ in range(count):
        state = START_STATE
        states = [state]
        total = torch.zeros(len(FEATURE_NAMES))
        for time in range(HORIZON):
            logits = (rewards[state] + values[time + 1][NEXT_STATE[state]]).masked_fill(
                ~VALID_ACTION[state], -torch.inf
            )
            action = int(torch.multinomial(
                torch.softmax(logits, dim=0), 1, generator=generator
            ))
            total += TRANSITION_FEATURES[state, action]
            state = int(NEXT_STATE[state, action])
            states.append(state)
        feature_counts.append(total)
        paths.append(path_record(states))
    return torch.stack(feature_counts), paths


def learn_reward(demonstration_features, steps=1_200, record_every=30):
    """Maximum-likelihood MaxEnt IRL with a small Gaussian weight prior."""
    demo_mean = demonstration_features.mean(dim=0)
    weights = torch.zeros(len(FEATURE_NAMES), requires_grad=True)
    optimizer = torch.optim.Adam([weights], lr=0.08)
    history = []

    def record(step):
        log_partition = soft_values(weights)[0][START_STATE]
        model_mean = torch.autograd.grad(log_partition, weights)[0]
        history.append({
            "step": step,
            "weights": weights.detach().tolist(),
            "modelFeatureMean": model_mean.detach().tolist(),
            "bestPath": best_path(weights.detach()),
        })

    record(0)
    for step in range(1, steps + 1):
        log_partition = soft_values(weights)[0][START_STATE]
        negative_log_likelihood = log_partition - demo_mean @ weights
        loss = negative_log_likelihood + 0.00001 * weights.square().sum()
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        if step % record_every == 0 or step == steps:
            record(step)
    return weights.detach(), demo_mean, history


def draw_grid(path):
    path_cells = {tuple(point[:2]) for point in path}
    rows = []
    for y in range(HEIGHT):
        row = []
        for x in range(WIDTH):
            cell = (x, y)
            mark = "·"
            if cell in WATER:
                mark = "~"
            elif cell in TREES:
                mark = "T"
            if cell in path_cells:
                mark = "*"
            if cell == START[:2]:
                mark = "B"
            elif cell == GOAL:
                mark = "G"
            row.append(mark)
        rows.append(" ".join(row))
    return "\n".join(rows)


def export_visualization(demo_paths, demo_mean, history):
    samples = []
    seen = set()
    for path in demo_paths:
        signature = tuple((point[0], point[1]) for point in path)
        if signature in seen:
            continue
        seen.add(signature)
        samples.append(path)
        if len(samples) == 16:
            break

    data = {
        "source": "tools/irl-lab/maxent_irl.py · PyTorch",
        "config": {
            "width": WIDTH,
            "height": HEIGHT,
            "horizon": HORIZON,
            "start": list(START),
            "goal": list(GOAL),
            "directions": [list(direction) for direction in DIRECTIONS],
            "water": [list(cell) for cell in sorted(WATER)],
            "trees": [list(cell) for cell in sorted(TREES)],
            "featureNames": list(FEATURE_NAMES),
            "trueWeights": [round(float(value), 6) for value in TRUE_WEIGHTS],
            "demonstrations": DEMONSTRATIONS,
            "seed": SEED,
        },
        "demonstrationFeatureMean": demo_mean.tolist(),
        "expertBestPath": best_path(TRUE_WEIGHTS),
        "sampleDemonstrations": samples,
        "checkpoints": history,
    }
    SITE_DATA.write_text(json.dumps(data, indent=2) + "\n")
    return SITE_DATA


def main():
    demonstration_features, demo_paths = sample_demonstrations()
    learned, demo_mean, history = learn_reward(demonstration_features)
    learned_path = best_path(learned)
    expert_path = best_path(TRUE_WEIGHTS)

    print("reward weights (higher means more desirable)")
    print("feature          hidden expert    learned")
    for name, true, fit in zip(FEATURE_NAMES, TRUE_WEIGHTS, learned):
        print(f"{name:<16} {true:>8.2f}       {fit:>8.2f}")
    print("\nmean feature counts: demonstrations -> learned model")
    final_model_mean = history[-1]["modelFeatureMean"]
    for name, demo, model in zip(FEATURE_NAMES, demo_mean, final_model_mean):
        print(f"{name:<16} {demo:>8.3f} -> {model:>8.3f}")
    print("\nbest path under the learned reward (B=start, G=goal, ~=water, T=tree)")
    print(draw_grid(learned_path))
    print(f"\nlearned best path matches expert: {learned_path == expert_path}")
    path = export_visualization(demo_paths, demo_mean, history)
    print(f"wrote browser visualization data: {path.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
