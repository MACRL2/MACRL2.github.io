# irl-lab — a minimal reward-learning example

`maxent_irl.py` supports the inverse-reinforcement-learning chapter with one
small, complete experiment. A heading-aware bicycle plans on a 13×11,
8-connected grid containing grass, a central pond, and tree stands. The script
sees expert trajectories, not the expert's reward, and uses maximum-entropy IRL
to recover weights for water, trees, reaching the goal, and steering. It writes
`static/demos/irl-maxent.json`, the recorded checkpoints rendered by the
chapter's browser visualization. The browser does not train a model.

From the repository root:

```bash
# The repository's existing environment already has PyTorch.
.venv/bin/python tools/irl-lab/maxent_irl.py
```

If the environment is being created from scratch:

```bash
python3 -m venv .venv
.venv/bin/pip install torch
.venv/bin/python tools/irl-lab/maxent_irl.py
```

The agent's state is `(x, y, heading)` with eight headings. Each action turns
left 45°, holds course, or turns right 45°, then advances one neighboring cell.
A finite-horizon soft dynamic program sums over roughly `3**16` steering
sequences without enumerating them, so the MaxEnt partition function is exact.
This remains a teaching convenience: larger continuous problems use trajectory
optimization, sampling, or an RL solver for the inner planning problem.
