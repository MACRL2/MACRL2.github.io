---
title: Notation and the (loss, distribution) Framing
description: One page of symbols, three templates, and the single failure that recurs across the whole course.
nav_order: 20
part: "Part I — Orientation"
summary: Every method is a (loss, distribution) pair; every pathology is those two disagreeing.
interactive: true
---

# Notation and the (loss, distribution) Framing

We want consistent notation across both branches. We use control-theoretic
symbols, since half our audience comes from there — states $x$ and inputs $u$
rather than $s$ and $a$.

## Objects

| Symbol | Meaning |
| --- | --- |
| $x_t \in \mathcal{X}$ | state at time $t$ |
| $o_t \in \mathcal{O}$ | observation, $o_t = h(x_t, e_t)$, sensor noise $e_t$ |
| $u_t \in \mathcal{U}$ | action / control input |
| $f$ | true dynamics, $x_{t+1} = f(x_t, u_t, w_t)$, or stochastically $x_{t+1} \sim P(\cdot \mid x_t, u_t)$ |
| $f_\phi$ | *learned* dynamics model, parameters $\phi$ |
| $\pi_\theta$ | policy, $u_t = \pi_\theta(o_t)$ or $u_t \sim \pi_\theta(\cdot \mid o_t)$; may condition on history $\tau_{:t}$ |
| $c(x,u)$ / $r(x,u)$ | cost / reward; $c_\psi$ denotes a *learned* cost, parameters $\psi$ |
| $T$, $\gamma$ | horizon, discount |
| $\pi^\star$ | expert / demonstrator policy |
| $\mathcal{D}$ | dataset, $\{(o_i, u_i)\}$ for imitation, $\{(x_i,u_i,x_i')\}$ for system ID |

**The one piece of notation that carries the whole course.** Let $d^\pi_t$ be the
distribution over states at time $t$ induced by rolling out $\pi$ from the
initial-state distribution, and

$$
d^\pi = \frac{1}{T}\sum_{t=0}^{T-1} d^\pi_t
$$

the (average) state-visitation distribution, a.k.a. the occupancy measure. The
performance of a policy is

$$
J(\pi) = \mathbb{E}_{x_0}\Big[\textstyle\sum_{t=0}^{T-1} \gamma^t\, c(x_t, \pi(x_t))\Big] = T \cdot \mathbb{E}_{x \sim d^\pi}\big[c(x, \pi(x))\big]
$$

<aside class="callout" data-kind="tip">
  <span class="callout-label">read this twice</span>
  <p>Every method in this course is a choice of a <strong>(loss, distribution)</strong>
  pair. The pathologies all come from evaluating a loss under one distribution and
  then deploying under another.</p>
</aside>

## The three templates

**(a) Imitation / behavior cloning.** Supervised learning with a surrogate loss
$\ell$ (NLL, MSE, or a discretized cross-entropy):

$$
\hat\theta = \arg\min_\theta \mathbb{E}_{x \sim d^{\pi^\star}}\big[\ell\big(\pi_\theta(x),\, \pi^\star(x)\big)\big].
$$

Note the subscript: the expectation is under the **expert's** distribution, but at
test time the learner induces $d^{\pi_\theta}$. That gap is the entire Branch A.

**(b) Model learning (system identification) + planning.** Fit the model on data
from some behavior/exploration policy $\pi_0$:

$$
\hat\phi = \arg\min_\phi \mathbb{E}_{(x,u,x') \sim d^{\pi_0}}\big[\,\|f_\phi(x,u) - x'\|^2\,\big],
$$

then plan against it, e.g. receding-horizon (MPC):

$$
u_{t:t+H}^\star = \arg\min_{u_{t:t+H}} \sum_{k=t}^{t+H} c(\hat x_k, u_k) \quad \text{s.t. } \hat x_{k+1} = f_{\hat\phi}(\hat x_k, u_k),\ \hat x_t = x_t .
$$

Same structural bug: the model was fit under $d^{\pi_0}$, and the planner induces
$d^{\pi_{\hat\phi}}$.

**(c) Reinforcement learning.** No supervisor, no model (or a model used only
internally):

$$
\theta^\star = \arg\min_\theta J(\pi_\theta) \quad\text{with } J \text{ evaluated under } d^{\pi_\theta}.
$$

Self-consistent by construction — the loss and the distribution finally agree.
That is why it is the terminus of both branches, and the price is sample
complexity, exploration, and reward specification.

## The recurring failure, stated once

**Covariate shift under closed-loop execution.** Suppose the learned policy has
per-state error $\epsilon$ under the training distribution. In supervised learning,
that is the whole story. In a closed loop, an error moves the system to a state
that is *itself* less represented in training, which raises the error, which moves
it further. Worst-case cost degradation scales like $O(\epsilon T^2)$ for one-shot
cloning versus $O(\epsilon T)$ for methods that train on their own induced
distribution.

<aside class="callout" data-kind="note">
  <span class="callout-label">deferred to the theory chapter</span>
  <p>The reduction of imitation to no-regret online learning, the
  $\epsilon T^2$ vs. $\epsilon T$ statements, and the simulation lemma /
  performance-difference lemma as the model-based analogue — stated as theorems
  later, motivated here.</p>
</aside>

The fix, in both branches, has the same shape: **make the training distribution
the one your own policy/planner induces, by iterating.** Everything else is
engineering detail about *who or what provides the labels* during that iteration.

<aside class="callout" data-kind="try">
  <span class="callout-label">what breaks next</span>
  <p>Two questions, two branches. Next you'll answer the questions for a real
  system and watch the framework route it — and watch both branches walk into the
  same wall.</p>
</aside>
