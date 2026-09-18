---
title: Home
description: Task Complexity and System Autonomy — the two qualities, the axes hiding inside them, and where VLA and RL sit on each.
interactive: true
---

<!-- Working draft. The axes below the first level are unnamed on purpose: the
     radar animates the structure so the names can be chosen against it. -->

Humanity's search for artificial intelligence has been in service of these two qualities.

<div class="demo" data-demo="autonomy-radar"></div>

<aside class="callout" data-kind="try">
  <span class="callout-label">try this</span>
  <p>Left alone it splits and folds on its own, endlessly. Click any axis to take
  over: click a spoke to split it, click the arc outside a family to fold it back.
  Then drag a method's handle along a spoke to move that reading — the two
  silhouettes are opinions, and they are meant to be argued with.</p>
</aside>

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

## Two methods on it

**VLA** takes pixels and words to motor commands, learned from human
demonstrations. **RL** takes a reward and a rollout budget and finds the
behavior by trying. They are close to opposites on this wheel: VLA reads a rich,
partially observed world far better than RL does, and RL supplies its own
experience where VLA has to be handed every hour of it.

A reading is a claim about how much of one axis a method absorbs, and it is made
at whatever depth the wheel is split to — *Observability* is a sharper claim than
*Task Complexity*. Drag a handle and the axes underneath it inherit the new
value; split further and you can disagree with yourself in more detail. Nothing
is saved: **copy readings** exports the whole set, ready to paste back over
`METHODS` in `autonomy-radar-data.js`.

Problems (loco-manipulation) come next, on the same wheel.

<aside class="callout">
  <span class="callout-label">also here</span>
  <p>An earlier framing of the same question — the field as a plane, with
  <em>Manual Supervision</em> against <em>Task Complexity</em> — lives on
  <a href="/projection-map/">the projection map</a>.</p>
</aside>
