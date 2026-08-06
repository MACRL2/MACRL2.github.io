---
title: Two Questions, Two Branches
description: Route your own robot to an algorithm — and watch both branches walk into the same wall.
nav_order: 30
part: "Part I — Orientation"
summary: One decision tool, two tracks, and the single failure they share.
interactive: true
---

# Two Questions, Two Branches

In [Why Robot Learning](/01-why-robot-learning/) we reduced the whole design
problem to two questions:

1. **Can a human demonstrate on the target embodiment?**
2. **How hard is it to specify the objective?**

Answer them and the appropriate algorithm class falls out — along with the
failure mode you are about to buy. Try it on a system you care about.

<div class="demo" data-demo="branch-decision"></div>

The tool encodes a claim worth stating plainly: **the two branches hit the same
wall in the same place**, and both are rescued by the same move.

## Branch A — when demonstrations are cheap

If a human can demonstrate on the true embodiment, the objective is usually the
hard part ("what is *good* driving?"). Don't learn dynamics; learn the map from
perception to behavior, and eventually the objective itself:

$$
\text{behavior cloning} \;\to\; \text{DAgger} \;\to\; \text{inverse RL}.
$$

This is not a ladder of sophistication — it is a ladder of *what you are willing
to pay for*: data, then expert availability, then compute.

## Branch B — when demonstrations are impossible

If the system is unstable and contact-rich, no human can demonstrate (balance
lives below human bandwidth), but the objective is a one-liner. The leverage is in
the model, and the story is progressively giving up on writing it down:

$$
\text{MPC} \;\to\; \text{supervised system ID} \;\to\; \text{model-based RL} \;\to\; \text{end-to-end RL in sim}.
$$

Each step trades *structure* for *data*: analytic model = all structure, no data;
end-to-end RL in sim = little structure, enormous synthetic data. Most shipped
systems sit in the middle, and knowing *where* to sit is the skill.

## The same wall

Look at where each branch first breaks:

| | Branch A | Branch B |
| --- | --- | --- |
| Naive supervised step | behavior cloning | system identification |
| What it fits | $\pi_\theta$ under $d^{\pi^\star}$ | $f_\phi$ under $d^{\pi_0}$ |
| How it breaks | learner drifts off the expert's states | planner exploits model error off-distribution |

Both are a **supervised fit evaluated off its own distribution** — exactly the
recurring failure from [the previous chapter](/02-notation-setup/). And both are
fixed by the same move: **make the training distribution the one your own
policy/planner induces, by iterating.** The only difference is *who provides the
labels* — a human expert in Branch A, the world itself in Branch B.

<aside class="callout" data-kind="try">
  <span class="callout-label">what breaks next</span>
  <p>Enough overview. Pick up a real system: the <a href="/02-cartpole/">cart-pole</a>
  runs Branch B in miniature — design a controller from a model, watch it balance,
  then throw the model away and let it learn. After that, <a href="/06-road-ahead/">the
  road ahead</a> lays out every chapter this branching structure expands into.</p>
</aside>
