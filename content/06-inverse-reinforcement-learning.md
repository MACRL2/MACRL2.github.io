---
title: Learning What the Driver Wants
description: Inverse reinforcement learning for autonomous driving — infer an objective from demonstrations, then plan with it.
nav_order: 37
part: "Part II — Branch A · Learning from Demonstrations"
summary: When the expert can leave demonstrations but cannot sit in the passenger seat, learn what made the driving good instead of cloning each steering command.
interactive: true
volume:
  from: DAgger
  to: Inverse RL
  axes:
    Expert independence: [0.4, 1.5]
    Unseen plans: [0.6, 1.6]
    Cheap training: [1.6, 0.45]
    Model-free: [1.4, 0.6]
---

# Learning What the Driver Wants

[DAgger](/05-interactive-imitation/) repaired behavior cloning by putting the
expert in the passenger seat. The learner drove; the expert labeled every state
it reached. That put corrections exactly where they were needed, but it also
made the expert part of the training loop forever.

Suppose instead that the driver has gone home. We still have their logged
trips, but cannot ask what they would do in a skid, at a new junction, or behind
a stopped truck. An action-cloning policy can only repeat the map it learned:

$$
\text{observation} \longmapsto \text{action}.
$$

**Inverse reinforcement learning** (IRL) asks a different question: *what
objective would make those trips look sensible?*

$$
\text{demonstrated trajectories} \longmapsto \text{reward} \longmapsto
\text{a new policy}.
$$

If the inferred reward values safety, progress, comfort, and lane discipline,
a planner can use it to compare routes the expert never drove. That is the
appeal: demonstrations communicate **intent**, not only steering labels.

<aside class="callout" data-kind="note">
  <span class="callout-label">what “no corrections” means</span>
  <p>IRL does not make interaction disappear. It removes the need for a human
  to label the learner's new states. Training still needs a dynamics model, a
  simulator, or an environment in which a policy can be planned and rolled
  out. We have traded expert availability for computation and assumptions.</p>
</aside>

## 1. Basic IRL: run reinforcement learning backward

Ordinary reinforcement learning starts with a reward $r$ and searches for a
policy that earns a high return. IRL starts with behavior from an expert
$\pi^\star$ and searches for a reward under which that behavior is good:

$$
\underbrace{r}_{\text{known}} \xrightarrow{\text{RL}}
\underbrace{\pi}_{\text{unknown}}
\qquad\Longrightarrow\qquad
\underbrace{\pi^\star\text{ demonstrations}}_{\text{known}}
\xrightarrow{\text{IRL}}
\underbrace{r}_{\text{unknown}}.
$$

The classical setup assumes we know the states, actions, and dynamics. We pick
a reward class—often a linear reward over hand-designed features,
$r_w(s,a)=w^\top\phi(s,a)$—then find weights $w$ for which the demonstrated
policy is optimal or better than alternatives. Early algorithms expressed
that condition as constraints or a margin between expert and non-expert
behavior. This is the problem formalized by
<a href="https://ai.stanford.edu/~ang/papers/icml00-irl.pdf">Ng and Russell
(2000)</a>.

There is an immediate catch: **the reward is not identifiable from behavior
alone**. A driver who stays centered may value lane discipline, fear the road
edge, or simply follow a route whose shortest path happens to be centered. The
all-zero reward makes every policy optimal; adding certain shaping terms can
change the numbers without changing the best policy. IRL therefore cannot
promise the one true human utility. Its practical target is a *useful reward
that explains the demonstrations and generalizes to the decisions we care
about*.

## 2. Maximum-entropy IRL: explain the data without inventing certainty

Declaring every demonstration exactly optimal is brittle. Humans take several
reasonable routes, make small mistakes, and optimize things our feature vector
does not contain. **Maximum-entropy IRL** turns reward learning into a
probabilistic model of whole trajectories:

$$
p_w(\tau) = \frac{\exp\!\left(w^\top\Phi(\tau)\right)}{Z(w)},
\qquad
\Phi(\tau)=\sum_t\phi(s_t,a_t),
$$

where $Z(w)$ sums over possible trajectories. High-reward trajectories are
more likely, but lower-reward ones are not forbidden. Among distributions that
match what the expert does, the maximum-entropy principle avoids asserting
preferences unsupported by the data. This was introduced in the driving and
route-choice setting by
<a href="https://www.cs.cmu.edu/~bziebart/publications/maximum-entropy-inverse-reinforcement-learning.html">Ziebart et al. (2008)</a>.

Fitting $w$ is maximum likelihood. The gradient has a particularly useful
interpretation:

$$
\nabla_w \mathcal{L}
= \mathbb{E}_{\tau\sim p_w}\!\left[\Phi(\tau)\right]
- \mathbb{E}_{\tau\sim \mathcal{D}}\!\left[\Phi(\tau)\right].
$$

The first expectation is what the current reward produces; the second is what
the driver demonstrated. If the current reward crosses water more often than
the demonstrations, push the water weight downward. If it steers too sharply,
make steering more costly. IRL is matching the **consequences** of motion, not
each action in isolation.

## A bicycle in a terrain grid

The repo contains a complete PyTorch example at
[`tools/irl-lab/maxent_irl.py`](https://github.com/MACRL2/MACRL2.github.io/blob/main/tools/irl-lab/maxent_irl.py).
The world is a 13×11 grid of grass. A pond fills the middle and stands of trees
flank it, leaving several plausible ways to reach the goal at the top.

The agent is a small **heading-aware bicycle**. Its state is $(x,y,h)$, where
$h$ is one of eight compass headings. At each step it chooses
$\delta\in\{-1,0,+1\}$—steer left 45°, hold the current heading, or steer right
45°—and then advances to that neighboring cell. The planner therefore moves on
an 8-connected grid, but it cannot teleport from north-facing to south-facing:
heading and steering continuity remain part of the state.

Water and trees are costly terrain rather than hard walls. That distinction is
important: if the planner were forbidden from entering them, demonstrations
could not teach us that the expert dislikes them. Each transition has four
features:

$$
\Phi(\tau) =
[\,\text{water cells},\;\text{tree cells},\;\text{time at goal},\;\text{steering}\,].
$$

The visualization below replays checkpoints exported by the real PyTorch run.
The dashed route is one noisy expert demonstration; the solid accent route is
the best bicycle plan under the reward learned so far. The two bar charts show
the mechanism: reward weights move until the model's terrain visits and motion
statistics match the driver's.

<div class="demo" data-demo="irl-maxent" data-wide></div>

<aside class="callout" data-kind="try">
  <span class="callout-label">watch reward become behavior</span>
  <p>Press <strong>replay reward learning</strong>. At step 0 every route has
  the same score. As water and trees acquire negative weights and reaching the
  goal becomes valuable, the route bends around the pond and tree stands.
  Press <strong>ride learned route</strong> to see the bicycle's heading change,
  then cycle through expert trips: some go left and some right, because MaxEnt
  IRL explains a distribution rather than copying one exact path. Reveal the
  hidden reward only after watching the fit.</p>
</aside>

For this synthetic experiment only, a hidden reward generates 1,000 noisy
expert paths. The learner receives their feature counts—not the hidden weights.
There are roughly $3^{16}$ possible steering sequences, so enumerating paths is
already wasteful. Instead, a soft Bellman backup computes $\log Z(w)$ exactly
over the finite grid:

```python
import torch

# Precomputed from the 8-connected bicycle model:
# next_state[state, steer], valid_action[state, steer],
# and phi[state, steer] = [water, trees, at_goal, steering].
def log_partition(w):
    value = torch.zeros(num_states)            # terminal value
    reward = phi @ w
    for _ in range(horizon):
        q = reward + value[next_state]
        q = q.masked_fill(~valid_action, -torch.inf)
        value = torch.logsumexp(q, dim=1)       # soft Bellman backup
    return value[start_state]

# MaxEnt IRL: make the demonstrated paths likely.
w = torch.zeros(4, requires_grad=True)
optimizer = torch.optim.Adam([w], lr=0.08)

for _ in range(1_200):
    loss = log_partition(w) - demo_feature_mean @ w
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
```

Run it from the repository root:

```bash
.venv/bin/python tools/irl-lab/maxent_irl.py
```

The deterministic run produces:

```text
feature          hidden expert    learned
water              -24.00         -18.79
trees              -12.00          -9.90
at goal              4.00           3.48
steering            -0.25          -0.24

mean feature counts: demonstrations -> learned model
water               0.000 ->    0.008
trees               0.002 ->    0.006
at goal             2.926 ->    2.925
steering            8.549 ->    8.549
```

The weights need not match perfectly—the demonstrations are finite, a small
prior regularizes the fit, and rewards are ambiguous. What matters is that the
learned model reproduces the driver's feature counts. Its highest-scoring
bicycle route stays on grass, curves around the pond and trees, and reaches the
goal along the same route as the expert optimum.

<aside class="callout" data-kind="tip">
  <span class="callout-label">break the assumption</span>
  <p>Run the script, then remove <code>"water"</code> from the feature
  vector. No optimizer can recover a preference the reward representation
  cannot express. Then reduce the number of demonstrations and watch the
  inferred weights move while the best route often stays unchanged. Both are
  central IRL lessons: representation matters, and behavior identifies rewards
  only partially.</p>
</aside>

Exact grid dynamic programming is the toy part. On a real road, $Z(w)$ ranges
over an astronomical number of continuous futures, so feature expectations
come from trajectory optimization, sampling, or an RL policy trained under the
current reward. This creates IRL's characteristic **inner loop**: propose a
reward, solve a forward control problem, compare its behavior with the expert,
update the reward, and repeat.

## 3. Deep IRL: learn the features too

The tiny example assumes that a human already chose the right concepts:
water, trees, time at the goal, and steering. Real driving reward depends on road
geometry, pedestrians, traffic lights, social context, and interactions among
them. A linear combination of three counters cannot express that.

**Deep IRL** replaces the linear map with a neural reward
$r_\psi(s,a)$—for example, a convolutional network that maps a semantic road
map to a dense driving-cost map. The outer loss still asks the learned reward
to explain expert feature occupancy; the forward planner still asks what a
policy would do under that reward. What changes is the representation: the
network can learn nonlinear reward features rather than requiring all of them
by hand. The early deep MaxEnt formulation is
<a href="https://arxiv.org/abs/1507.04888">Wulfmeier, Ondruska, and Posner
(2015)</a>.

Deep IRL is not “behavior cloning with a deeper network.” A deep clone maps an
image directly to steering. A deep reward model maps a situation to a scalar
score, and a planner or RL algorithm still chooses actions by reasoning about
future scores. That extra solve is expensive, but it is also what makes the
reward reusable for counterfactual plans.

## 4. Adversarial imitation: match occupancy without naming the reward

```volume
from: Deep IRL
to: Adversarial imitation
axes:
  Auditable reward: [1.6, 0.4]
  Training stability: [1.3, 0.6]
  Cheap training: [0.5, 1.2]
  Direct policy: [0.6, 1.5]
```

Often we want the final policy but do not need to inspect or transfer an
explicit reward. **Adversarial imitation learning** (AIL) compresses the IRL
and RL loops into a game. In GAIL, the canonical example, a discriminator
learns to tell expert state-action pairs from learner state-action pairs. The
policy receives a learned signal for fooling it:

$$
\max_D\;
\mathbb{E}_{(s,a)\sim d^{\pi^\star}}[\log D(s,a)]
+
\mathbb{E}_{(s,a)\sim d^\pi}[\log(1-D(s,a))],
$$

while the policy updates in the opposite direction, usually with an entropy
bonus. At equilibrium the learner's **occupancy measure**—which states and
actions it visits—matches the expert's. The discriminator supplies a training
signal, but not necessarily an interpretable, reusable human objective. This
IRL-to-occupancy-matching reduction is the core of
<a href="https://arxiv.org/abs/1606.03476">Ho and Ermon's GAIL (2016)</a>.

The progression is now visible:

| method | what is learned | human needed during training? | environment work |
| --- | --- | --- | --- |
| behavior cloning | action predictor | demonstrations only | none after collection |
| DAgger | action predictor on learner states | **yes**, repeated corrections | learner rollouts |
| IRL / deep IRL | explicit reward, then policy | demonstrations only | repeated planning or RL |
| adversarial imitation | policy via occupancy matching | demonstrations only | repeated policy rollouts |

## What IRL buys—and what it does not

IRL is the right move when the objective is hard to write down, logged expert
behavior exists, and scoring unseen plans is worth an expensive training loop.
It is especially attractive when a reward must be inspected, transferred to a
new vehicle, or combined with hard safety constraints.

It is not a free upgrade over cloning:

- **Ambiguity remains.** Many rewards explain the same demonstrations; a learned
  reward can encode accidental correlations in the routes or simulator.
- **The world model matters.** Classical IRL assumes known dynamics; modern
  variants still need planning, simulation, or environment rollouts. Model
  errors can become reward errors.
- **Optimization is nested.** Each reward update asks how a policy behaves, so
  training is far more expensive than supervised behavior cloning.
- **AIL trades interpretation for directness.** It may imitate successfully
  without producing the auditable objective that motivated IRL in the first
  place, and adversarial training introduces its own instability.

The clean lesson is not that IRL discovers what a human “really wants.” It is
that trajectories contain information about **why actions fit together over
time**. Reward learning gives us a language for extracting that information;
MaxEnt handles uncertainty, deep models expand the language, and AIL skips
writing the language down when matching behavior is enough.

---

*Run the example with `.venv/bin/python tools/irl-lab/maxent_irl.py`; setup and
assumptions are documented in `tools/irl-lab/README.md`.*
