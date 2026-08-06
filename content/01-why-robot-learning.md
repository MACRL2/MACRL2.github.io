---
title: Why Robot Learning
description: Where engineered pipelines break, and why the design variable is the human interface.
nav_order: 10
part: "Part I — Orientation"
summary: The classical stack works until it doesn't — and where it breaks tells you exactly what to learn.
interactive: true
---

# Why Robot Learning

Building a robot that works is an act of interdisciplinary bookkeeping. To move a
physical system through the world with intent, an engineer has to simultaneously:

- **model** the system — rigid-body dynamics, actuator and transmission behavior,
  contact, friction, compliance, latency;
- **control** it — stabilize it, respect constraints, and do so with guarantees
  that survive contact with reality;
- **perceive** the scene — recover the geometry and, increasingly, the *semantics*
  that determine what an action means;
- **specify the objective** — encode, as a cost or a constraint or a rule, what
  the engineers and the end users actually wanted.

Each of these is a field. The classical response is to make each of them a module
and compose them: **perception → state estimation → planning → control**. This is
good engineering. It is testable, interpretable, and it is how most robots that
currently earn money are built. We should be honest about why it works before we
explain why it breaks.

## Where engineered pipelines break

The failure mode of the classical stack is not usually a failure of any module. It
is a failure *at the seams*.

- **Non-differentiable, lossy interfaces.** The perception module hands the planner
  an object list, an occupancy grid, a cost map. That interface was designed by a
  human, and it throws away exactly the information the human did not anticipate
  needing. There is no gradient from task failure back to the representation that
  caused it, so the representation never learns that it was the problem.
- **Proxy objectives per module.** Detection mAP, tracking MOTA, localization RMSE.
  Each module is optimized against a metric that is a *proxy* for downstream task
  success, and the correlation between the proxy and the outcome is weak precisely
  in the tail cases that matter.
- **Credit assignment by human.** When the robot fails, a person has to decide
  which module was at fault. This is the real cost of modularity, and it scales
  linearly with the number of failure modes — which is to say, badly.
- **The tuning burden.** Cost-function weights, gains, thresholds, hysteresis,
  hand-written rules for the fifteen situations someone remembered. This is a
  manual descent on a loss surface nobody wrote down.

None of this argues for replacing the stack with one large network. It argues for
something narrower:

<aside class="callout" data-kind="tip">
  <span class="callout-label">the organizing principle</span>
  <p>The parts of the stack that are <em>hard to write down</em> should be learned,
  and the interfaces around them should be differentiable or at least
  closed-loop-corrigible. Which parts are hard to write down is a property of the
  <em>system</em>, not a matter of taste.</p>
</aside>

## The design variable is the human interface

Here is the reframing we want you to leave this chapter with.

Learning does not remove the need for human knowledge. It changes **the channel
through which humans supply it**. And the cheapest, highest-bandwidth channel is
different for different robots:

| System | Cheapest human channel | Why |
| --- | --- | --- |
| Self-driving car (on-road, off-road) | **Demonstration by doing** | Humans already drive. Data is collected on the true embodiment, in the true observation distribution, at scale, essentially as a byproduct of operation. |
| Table-top / mobile manipulator | **Demonstration by showing** | Teleoperating a 7-DoF arm through a contact-rich task is awkward and slow; the human would rather just *do the task* (kinesthetic teaching, handheld gripper, video). Cheap, but now there is an embodiment gap. |
| Dexterous hand, legged robot, humanoid | **Simulator + reward** | The human cannot demonstrate: there is no correspondence between a human hand and a 16-DoF tendon-driven hand, and the stabilization timescale (~ms) is below human bandwidth. But the *objective* is easy to write: track this velocity, don't fall, get the object to this pose. |

Read the table the other way and two questions fall out — and they are the only
two questions that matter for choosing an algorithm:

1. **How hard is it to specify the objective?** ("What is good driving?" is hard.
   "Don't fall over" is easy.)
2. **How hard is it to model the system, and can a human demonstrate on the right
   embodiment?** (A car at 30 km/h is a bicycle model. A hand rolling a cube is
   not anything.)

$$
\text{cheap demos} + \text{hard objective} \;\Longrightarrow\; \text{imitation, then inverse RL}
$$
$$
\text{no demos} + \text{easy objective} + \text{hard dynamics} \;\Longrightarrow\; \text{models and planning, then RL}
$$

The rest of the course walks both implications, and shows that the *same*
underlying failure — a mismatch between the distribution you trained on and the
distribution your own policy induces — shows up on both paths and is fixed by the
same principle.

## What this course does differently

We take a **deployment-first** view. Each chapter starts from a thing that breaks
in the field, then reaches for the concept that explains it. The concepts come
from machine learning, **online learning**, reinforcement learning, and control
theory, and we treat them as one framework rather than four literatures:

- **statistical learning** gives us generalization on a fixed distribution;
- **online learning** gives us the right language for the fact that in robotics the
  distribution is *chosen by the learner*, and gives us no-regret as the design
  target;
- **reinforcement learning** gives us the objective when there is no supervisor;
- **control theory** gives us stability, constraint satisfaction, and the models we
  should not throw away.

The intended takeaway is not a list of algorithms. It is the ability to look at a
new robot, answer the two questions above, and predict which algorithm class is
appropriate and — more usefully — *which failure mode you have just bought*.

<aside class="callout" data-kind="try">
  <span class="callout-label">what breaks next</span>
  <p>We keep saying "the two questions." Next we build the shared vocabulary — a
  handful of symbols — that lets us state both branches, and their common failure,
  in one line. Then you'll answer the two questions for your own robot, with a tool
  that routes it to an algorithm.</p>
</aside>
