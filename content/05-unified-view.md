---
title: The Unified View
description: One table and one sentence that hold both branches together.
nav_order: 50
part: "Part III — Synthesis"
summary: Two branches, one principle — a loss and a distribution, made to agree by interaction.
interactive: true
---

# The Unified View

We can now put both branches on one page. Read the columns as mirror images of
each other — the same story told about the objective on the left and about the
dynamics on the right.

| | Branch A: semantic | Branch B: dynamic |
| --- | --- | --- |
| Hard part | objective & semantics | dynamics & stability |
| Cheap human channel | demonstrations | reward + simulator |
| Naive supervised step | [behavior cloning](/04-behavior-cloning/) | system identification |
| What it fits | $\pi_\theta$ under $d^{\pi^\star}$ | $f_\phi$ under $d^{\pi_0}$ |
| How it breaks | learner drifts off expert states | planner exploits model error |
| Interactive fix | DAgger + expert labels | iterative sysID; world provides labels |
| Terminus | inverse RL → plan/RL on $c_\psi$ | end-to-end RL → sim-to-real |
| What you pay | expert availability | simulation fidelity & compute |

<aside class="callout" data-kind="tip">
  <span class="callout-label">the whole course in one sentence</span>
  <p>Every method here is a choice of a loss and a distribution to evaluate it
  under, and every failure is those two disagreeing; interaction is how you make
  them agree.</p>
</aside>

The single cleanest contrast between the branches is *who provides the labels*
during that interaction. In Branch A a human has to sit in the loop and say what
they would have done in a state they would never have gotten into — expensive,
unnatural, safety-gated. In Branch B **the world provides the labels**: roll out
the planner, observe the transitions you actually caused, aggregate, refit. That
is why the two branches scale so differently.

## What is still owed

This chapter states the table; it does not yet prove it. The theory chapter
formalizes every row:

<aside class="callout" data-kind="note">
  <span class="callout-label">deferred to the theory chapter</span>
  <p>The reduction to no-regret online learning; the $\epsilon T^2$ vs. $\epsilon T$
  bounds; the simulation lemma and performance-difference lemma; and the sample
  complexity for linear system ID / LQR — the one case where we can say
  everything.</p>
</aside>

<aside class="callout" data-kind="try">
  <span class="callout-label">what breaks next</span>
  <p>The table is the destination. <a href="/06-road-ahead/">The road ahead</a>
  lays out the chapters that build up to it — each branch, step by step, and the
  synthesis chapters that sit on top.</p>
</aside>
