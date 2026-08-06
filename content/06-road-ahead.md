---
title: The Road Ahead
description: How the branching structure expands into chapters — the map of everything still to come.
nav_order: 60
part: "Part III — Synthesis"
summary: The full course map — each branch step by step, and the failure that hands off to the next chapter.
interactive: true
---

# The Road Ahead

The orientation gave you the whole argument in miniature. This page is the map:
how each branch expands into chapters, and — the device that makes the structure
a narrative rather than a taxonomy — the **"what breaks next"** hand-off that
carries you from one chapter to the one after it.

Each branch below is a skeleton, ready to be filled in. The intuition and the
failure chain are here; the proofs, demos, and running examples arrive as the
chapters are written.

---

## Branch A — semantically rich systems

*Running example: off-road autonomy — it makes the semantic difficulty vivid in a
way lane-keeping does not.*

**Why the branch looks the way it does.** The vehicle is the *easy* part. A car at
moderate speed is a bicycle model, open-loop stable, with low-level control solved
for decades. What is hard is **semantics and objective**: the action depends on
whether that blob is a pedestrian, whether the mud is passable; and "good driving"
is a trade-off surface over safety, progress, comfort, legality, and social norms.
Demonstrations, meanwhile, are nearly free. *So: don't learn dynamics — learn the
map from perception to behavior, and eventually the objective.*

**A.1 — Behavior cloning.** The right first move: stable, off-policy, reuses the
whole ML toolbox, scales with data you already have. Design choices worth a
section — action parameterization (steering/accel vs. trajectory vs. waypoints),
history conditioning, output distribution (regression vs. mixture vs. discretized
vs. diffusion). Establish early that offline metrics are *only weakly predictive*
of closed-loop performance — it motivates everything after.

**Where it breaks — four failures, kept separate:**

1. **Compounding error / covariate shift.** The headline. Demonstrations contain
   no recovery behavior; a small deviation reaches an unfamiliar state, which
   produces a larger deviation.
2. **Multimodality.** At a fork, both left and right are expert; least-squares
   averages them and drives into the divider. Motivates distributional action
   heads.
3. **Causal confusion / copycat.** With history in the input, the easiest
   predictor of $u_t$ is $u_{t-1}$; loss drops, competence does not.
4. **Long tail.** Rare events are rare by construction and catastrophic by cost;
   the bottleneck is *finding* the interesting states, not fitting them.

**A.2 — Interactive imitation (DAgger family).** The fix: collect labels on the
states *your policy* visits; aggregate, refit, repeat. The principle: this is a
reduction from imitation to **no-regret online learning** — the aggregation step
is Follow-the-Regularized-Leader in disguise. Deployment reality usually skipped:
labeling off-distribution states is unnatural for a human, rolling out an
undertrained policy on real hardware is unsafe (hence HG-/Ensemble-/Safe-/Lazy-
DAgger, trading regret for intervention budget), and interventions are cheap
*signal* but expensive *labels*.

**A.3 — Inverse RL / reward learning.** Motivated by what DAgger still cannot do:
it clones **actions**, not **intent**; it offers no counterfactual evaluation; it
requires the expert forever. A recovered cost $c_\psi$ lets you score plans nobody
demonstrated, *audit* the objective, and improve *beyond* the demonstrator.
Content: max-margin and max-entropy IRL, the adversarial/GAIL view as distribution
matching over $d^\pi$ vs. $d^{\pi^\star}$, and the honest caveat — reward is
**ill-posed** without regularization.

> **Closing beat.** BC → DAgger → IRL is a ladder of *what you are willing to pay
> for*: data, expert availability, and compute, respectively.

---

## Branch B — unstable, contact-rich systems

*Running example: a quadruped or dexterous in-hand reorientation. The
[cart-pole](/02-cartpole/) is the toy that carries the whole arc.*

**Why the branch looks the way it does.** Invert Branch A on every axis. The
**objective is easy** — track a velocity, stay upright, reach a pose — and nearly
the true objective rather than a proxy. **Demonstrations are unavailable**:
morphology mismatch, no state correspondence, and decisively the *bandwidth
argument* — these systems are open-loop unstable and must be stabilized on the
millisecond timescale, below human teleoperation bandwidth. **The dynamics are
hard**: contact is non-smooth and hybrid, friction is unknown and time-varying,
actuators have backlash and thermal droop, and small errors integrate fast in an
unstable system. *So: the leverage is in the model, and this branch is the story
of progressively giving up on writing it down.*

**B.1 — Planning with a model.** Start from strength: with a good $f$ you need
almost no data. Trajectory optimization / DDP-iLQR / MPC, whole-body control, and
the reduced-order tradition (ZMP, LIP, centroidal dynamics) that walked robots
before learning did. The honest baseline: model-based control is very strong when
the model is right.

**B.2 — Supervised system ID, then plan.** Fit $f_\phi$ from logged transitions.
The practical winner is **residual / hybrid modeling** — learn the correction on
top of rigid-body physics so the prior does the heavy lifting. Say it plainly:
**this is behavior cloning with the object swapped** — a supervised fit on a
distribution you did not choose. One-step vs. multi-step prediction loss is the
first hint of trouble.

**Where it breaks — the planner exploits the model:**

> The optimizer is an adversary against your model's error. The model is accurate
> where you have data; the planner searches for the *lowest-cost* trajectory, and
> low predicted cost is exactly what model error looks like where data is absent.
> The plan finds the region where the model is optimistically wrong and goes there
> — that is what optimization *does*.

Keep two effects separate: (i) open-loop prediction error compounding over the
horizon $H$; (ii) distribution shift, $f_\phi$ fit under $d^{\pi_0}$ but evaluated
under $d^{\pi_\phi}$ induced by the planner.

**B.3 — Interactive system ID ("DAgger for dynamics").** Structurally identical to
DAgger: alternate {fit $f_\phi$ on aggregated data} ↔ {plan, execute on the real
system, aggregate the transitions you observed}. The requirement is not a globally
accurate model but one accurate **on the distribution its own planner induces** —
self-consistency, not fidelity. No human is needed: **the world provides the
labels.** This *is* model-based RL (PILCO → PETS/probabilistic ensembles → latent
world models). Add **epistemic uncertainty** here — pessimism for safe control,
optimism for exploration — which is where the exploration/exploitation vocabulary
enters.

**B.4 — End-to-end RL in sim.** Motivated by what the model-based loop still cannot
do: **stiff/discontinuous contact** makes long-horizon prediction unreliable;
**latent state** (terrain friction, payload, actuator state) is unobservable; and
the **real-time budget** forbids online optimization at kHz on embedded hardware.
RL policies are **amortized planning** — pay the optimization offline, deploy a
feed-forward pass. So: massively parallel sim + domain randomization,
teacher–student / privileged-information distillation, and sim-to-real as the
central engineering discipline. Deployment reality: reward hacking, safety filters
/ CBFs / shielding, hardware wear and reset cost, robustness vs. performance as an
explicit dial.

> **Closing beat.** Each step trades *structure* for *data*. Analytic model = all
> structure, no data; end-to-end RL in sim = little structure, enormous synthetic
> data. Most shipped systems sit in the middle, and knowing *where* to sit is the
> skill.

---

## The full chapter map

The branching structure above expands into this sequence. Chapters marked
*(live)* are written; the rest are scaffolded and coming.

| # | Chapter | Status |
| --- | --- | --- |
| 0 | Introduction and motivation — [Why Robot Learning](/01-why-robot-learning/) | *(live)* |
| 1 | [Notation and the (loss, distribution) framing](/02-notation-setup/) | *(live)* |
| 2 | Statistical & online learning primer — regret as a design target | planned |
| 3 | Branch A.1 — behavior cloning and its four failure modes | planned |
| 4 | Branch A.2 — interactive imitation; DAgger and safe variants | planned |
| 5 | Branch A.3 — inverse RL and reward learning | planned |
| 6 | Branch B.1 — models, trajectory optimization, MPC | planned |
| 7 | Branch B.2 — learning dynamics; residual models; model exploitation | planned |
| 8 | Branch B.3 — iterative system ID and model-based RL; uncertainty | planned |
| 9 | Branch B.4 — model-free RL, sim-to-real, distillation | planned |
| 10 | Safety as a layer: filters, shields, constraints | planned |
| 11 | Evaluation and deployment: closed-loop metrics, data engines, the long tail | planned |
| 12 | Synthesis: choosing a method for a system you have never seen | planned |

<aside class="callout" data-kind="note">
  <span class="callout-label">an open design question</span>
  <p>Where do manipulators go? They are the interesting middle — demonstrations
  exist but with an embodiment gap, <em>and</em> contact dynamics are hard. The
  current plan is a synthesis chapter after both branches that combines the two
  toolkits, rather than a third parallel track.</p>
</aside>
