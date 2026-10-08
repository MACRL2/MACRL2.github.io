---
title: Home
description: Task Complexity and System Autonomy — open-ended axes, one fixed volume of capability, and how every system we build only moves it around.
interactive: true
---

# Preface: A Roboticist Buys Lunch from a Simplex

<div class="by" data-author="than">

Robotics, or "physical Artificial Intelligence (AI)", is perhaps the oldest field of AI research. Its history goes as far as [4th century BC](https://en.wikipedia.org/wiki/Automaton). As we experience inherent wonder about the world and beyond, so too do we experience wonder about the internal gears which drive us and others we know.

While this field's markets try to convince you that its resolution is near, we implore readers to think deeply about its history and where we are now. What has _truly_ changed? What were the catalysts of flight? of vaccines? of space exploration?

Familiar to those in Machine Learning (ML), the <strong>No Free Lunch</strong> theorem contends: 

> Any two optimization algorithms are equivalent when their performance is averaged across all possible problems.

In other words, there are always trade-offs. Roboticists, or engineers in general, are highly adept at balancing these trade-offs. As authors of this course, we believe our personal insight into robot learning is derived from our experience on robot systems, forming a holistic perspective which helps ground and map recent developments. We hope that this perspective can be useful to you as well.   

</div>

<div class="ai">
<div class="demo" data-demo="autonomy-radar"></div>

<aside class="callout" data-kind="try">
  <span class="callout-label">try this</span>
  <p>Left alone, the wheel tours four systems, and the shaded volume changes
  shape but never size. Pick a system and drag a handle outward: every other
  axis gives ground to pay for it. Click a spoke to split that axis into the two
  it stood for, or click the small arc at the hub to fold a family back.
  <em>All at once</em> lays the systems over one another.</p>
</aside>

## A fixed volume

The shaded shape is a volume of capability, and it is the same size for every
system on the wheel: each one is rescaled to the same area. Systems differ in
*where* their capability sits, never in *how much* of it there is. That is the
claim this course keeps making. Most of what counts as progress in robotics
moves the volume from one axis to another, buying autonomy with observability or
horizon with an expert on call, rather than making it bigger.

The axes have no rim. Nothing caps *Dynamics* or *Observability*, so a system
can push as far along one as it likes, but only by spending the volume it holds
everywhere else. Hover a handle for the limit: how far that system would reach
if it gave up every other axis.

## Systems, not methods

Only a system gets a volume: one robot, one dataset, one budget, actually built.
A method has no edges. Give RL an unlimited reward, simulator and compute and it
encloses the whole wheel, which says nothing. The bound appears once a method is
built into something.

**π0** and **ANYmal parkour** are close to mirror images. π0 reads a cluttered
home from pixels and a sentence, but every hour of its data was teleoperated.
ANYmal supplies its own experience in simulation, but sees only geometry.
**Atlas parkour** puts most of its volume into dynamics, and the **Waymo
Driver** puts most of its into observability and horizon. None of them is
bigger than the others.

A reading is a relative weight: a claim about where a system's volume sits on
one axis, made at whatever depth the wheel is split to. Readings have no units,
since the wheel only uses the shape. Drag a handle and the axes underneath it
inherit the new value. Nothing is saved: **copy readings** exports the whole set,
ready to paste over the scores in `SYSTEMS` in `autonomy-radar-data.js`.

## The axes so far

Two levels are named. Anything deeper still carries a handle — `TC.1.1.2`,
`SA.2.1` — shown on the spoke and listed under the wheel as it appears, so the
structure stays arguable before the vocabulary is fixed.

- **Task Complexity**
  - **Actor Capability** — Observability · Decision Authority
  - **Environment Complexity** — Horizon · Dynamics
- **System Autonomy**
  - **Data Availability**
  - **Self-supervising**

Names attach to position, so renaming one never disturbs the rest, and an
unnamed axis keeps working underneath a named parent.

## Every unit carries one

Each chapter opens with a small version of the same figure, drawn on just the
axes its new approach moves along. The approach it starts from is dashed, the one
it introduces is filled, and both have the same volume. Here is the choice
between the course's two branches:

```volume
from: Branch A · demonstrations
to: Branch B · simulator + reward
axes:
  Observability: [1.7, 0.6]
  Dynamics: [0.5, 1.8]
  Data Availability: [0.5, 1.5]
  Unwritten objectives: [1.6, 0.5]
```

Watch for them as you read. Behavior cloning, DAgger, inverse RL and learning
from a reward each move the volume somewhere new, and none of them make it
bigger.

Problems (loco-manipulation) come next, on the same wheel.

<aside class="callout">
  <span class="callout-label">also here</span>
  <p>An earlier framing of the same question — the field as a plane, with
  <em>Manual Supervision</em> against <em>Task Complexity</em> — lives on
  <a href="/projection-map/">the projection map</a>.</p>
</aside>

</div>
