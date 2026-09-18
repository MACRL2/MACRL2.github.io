---
title: The projection map
description: An earlier framing — robot learning as a space, and the axes that project it away.
hide_from_toc: true
interactive: true
---

<p class="backlink"><a href="/">← the radar</a></p>

Most arguments about robot learning are arguments about coordinates. *Model-based
or learned? Sim or real? RL or imitation?* Those are labels on a list, and lists
don't compose — they can't tell you what a method costs, what it buys, or which
methods are really neighbors.

So start with a space instead. Two axes carry almost every claim anyone makes
about a robot-learning system:

- **Manual Supervision** — how much human effort the method consumes before it works.
- **Task Complexity** — how hard the problem is once that supervision is set aside.

Every method promises the same thing in these coordinates: move *up* without
moving *right*. Harder tasks, less human effort. Plot the field that way and
you get the map below.

<div class="demo" data-demo="robot-learning-map"></div>

<aside class="callout" data-kind="try">
  <span class="callout-label">try this</span>
  <p>Click either axis name. It unfolds into the two things it was hiding, and a
  slider rotates the projection between them — watch the systems slide along
  their whiskers. Keep unfolding <em>Task Complexity</em> until you hit the
  atomic axes.</p>
</aside>

## The axes are projections

Neither headline axis is a real quantity. Each is a weighted blend — a
one-dimensional shadow of two things that vary independently:

$$
\text{Manual Supervision} = (1-w)\cdot\text{Modeling} + w\cdot\text{Reference Data}
$$

**Modeling** is structure written down by hand: dynamics, rewards, resets,
calibration, the plan. **Reference Data** is behavior collected from humans:
demonstrations, teleop, labels. Both cost a person's time, so both land on the
same axis — and then the axis tells you nothing about which one you spent, even
though they fail in opposite ways. Modeling is effort that transfers and does
not scale; reference data is effort that scales and does not transfer.

Task Complexity hides a sharper split still:

$$
\text{Task Complexity} = (1-w)\cdot\underbrace{\big[(1-v)\cdot|\text{Observation}| + v\cdot|\text{Action}|\big]}_{\text{Embodiment Complexity}} + w\cdot\text{Task Dynamics}
$$

**Embodiment Complexity** is how much robot there is — how wide the observation
is to read, how many degrees of freedom there are to command. **Task Dynamics**
is contact, underactuation, horizon, stochasticity: the part of the problem the
robot cannot slow down. Sweep that slider and the map reorganizes. A generalist
policy reading open-world video and a hopping robot recovering from a shove sit
near each other on the projected axis and at opposite corners underneath it. The
field's loudest recent progress is almost all on one child; the problems that
strand a robot in the field are on the other.

<aside class="callout">
  <span class="callout-label">the claim</span>
  <p>Progress that looks like movement on the headline axes is usually movement
  along one hidden child while the other stays put. You can only see which by
  unfolding the axis — which is what this map is for.</p>
</aside>

## Why this vantage point

This map comes out of the Robot Learning Lab at the University of Washington,
from three people who have spent time on both sides of it — building learning
methods, and taking robots into the field where the modeling assumptions and the
demonstration distributions both run out.

## Placing a system

Every dot is scored on the five atomic axes only; the headline positions are
computed. Turn on **place mode** to drag a method to where you think it belongs
(or double-click empty space to add one), then **copy coordinates** to export the
whole set. Disagreement about a placement is the useful kind of disagreement:
it is a disagreement about what a method actually costs.
