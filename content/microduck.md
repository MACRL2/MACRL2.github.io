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

## Framed inline panel

A modest panel in the text column. The simulation carries its own **Push** and
**Reset** controls inside the frame.

<div class="demo" data-demo="microduck" data-params='{"route":"balance"}'></div>

## Wide panel, host controls

The same simulation, bled wider than the prose, with **Push** and **Reset**
rendered by the page itself (driving the sim over `postMessage`) so they match
the site's styling.

<div class="demo" data-demo="microduck" data-wide data-params='{"route":"balance","controls":"host"}'></div>

Both embeds mirror the site's light/dark toggle, and neither adds a single byte
of physics code to this repo.
