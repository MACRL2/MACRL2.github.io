---
title: Microduck
description: An in-browser microduck balancing simulation, embedded from the microduck-viewer.
interactive: true
hide_from_toc: true
---

# Microduck

A **microduck** — a small articulated robot that must balance on two legs while
its feet make and break contact with the ground. The physics runs in your
browser (MuJoCo compiled to WebAssembly), and a trained reinforcement-learning
policy runs the joints at 50 Hz to keep it upright. Give it a shove and watch the
learned controller catch itself.

This page is a sandbox: the same simulation is embedded two ways so we can feel
out which fits the course. The heavy machinery lives in a
[separate viewer](https://macrl2.github.io/microduck-viewer/) — this page only
embeds it, and only loads it when you scroll it into view.

<div class="demo" data-demo="value-fn"></div>

On a wide screen, a small animated **value function** sits in the right margin — a
placeholder for now, but the intended teaching aid for *what the robot knows*.

## Borderless, in the flow

No box — the simulation sits directly in the text column on the page's own
background, with just a soft shadow "hovering" under the feet that fades away.
It carries its own **Push** and **Reset** controls.

<div class="demo" data-demo="microduck" data-params='{"route":"balance","frame":false,"ground":"circle"}'></div>

## Wide panel, host controls

The same simulation, bled wider than the prose, with **Push** and **Reset**
rendered by the page itself (driving the sim over `postMessage`) so they match
the site's styling. The ground is the same local fading circle under the feet.

<div class="demo" data-demo="microduck" data-wide data-params='{"route":"balance","controls":"host","ground":"circle"}'></div>

Both embeds take on the page's exact background and mirror the light/dark
toggle, and neither adds a single byte of physics code to this repo.
