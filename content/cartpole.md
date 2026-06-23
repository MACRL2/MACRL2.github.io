---
title: Cart-Pole
description: A static illustration of the cart-pole system.
hide_from_toc: true
---

# Cart-Pole

A cart on a track with a pole hinged on top. Push the cart left or right; keep
the pole from falling.

<figure style="margin:1.75rem 0; text-align:center">
<svg viewBox="0 0 400 240" role="img" aria-label="A cart on a track with a pole balanced on top, leaning slightly to the right." style="width:100%; max-width:460px; color:var(--fg)">
  <!-- track -->
  <line x1="28" y1="180" x2="372" y2="180" stroke="currentColor" stroke-opacity="0.4" stroke-width="2"/>
  <!-- cart -->
  <rect x="160" y="154" width="80" height="26" rx="4" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <circle cx="178" cy="184" r="7" fill="currentColor"/>
  <circle cx="222" cy="184" r="7" fill="currentColor"/>
  <!-- pole (accent), hinged at the cart top, leaning ~15° right -->
  <line x1="200" y1="154" x2="228.5" y2="47.7" style="stroke:var(--accent)" stroke-width="5" stroke-linecap="round"/>
  <circle cx="228.5" cy="47.7" r="11" style="fill:var(--accent)"/>
  <!-- pivot -->
  <circle cx="200" cy="154" r="3.5" fill="currentColor"/>
</svg>
<figcaption style="font-size:0.85rem; color:var(--fg-muted); margin-top:0.5rem">The cart-pole system.</figcaption>
</figure>

See the [interactive version](/02-cartpole/) to control it, watch it balance,
and let an algorithm learn to keep it up.
