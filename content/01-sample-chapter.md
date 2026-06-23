---
title: A Sample Chapter
description: Demonstrates the prose style, a callout, and a first interactive element.
nav_order: 9
part: "Appendix"
summary: How a chapter reads, and what an interactive element feels like in context.
hide_from_toc: true
---

# A Sample Chapter

This chapter exists to show the *texture* of the book: how prose sits on the
page, how asides interrupt without shouting, and how an interactive element
appears right where a concept needs one.

Good explanatory writing keeps a calm measure and a steady rhythm. Numbers line
up — 1,024 and 65,536 share the same column — and emphasis is reserved for words
that earn it. Links to [related ideas](/) stay quiet until you reach for them.

## A concept, then a thing to try

Suppose we're learning how a single parameter reshapes a curve. Reading the
definition helps; *moving* the parameter and watching the curve respond is what
makes it stick. So the textbook puts the control next to the prose:

<aside class="callout" data-kind="try">
  <span class="callout-label">try this</span>
  <p>Drag the slider. The value updates live — imagine the curve below it
  redrawing as you move.</p>
  <p style="margin-bottom:0">
    <label for="demo-slider">amplitude</label>
    <input id="demo-slider" type="range" min="0" max="100" value="42" style="vertical-align:middle">
    <output id="demo-out" style="font-variant-numeric:tabular-nums">42</output>
  </p>
</aside>

<script>
  (function () {
    var s = document.getElementById('demo-slider');
    var o = document.getElementById('demo-out');
    if (s && o) s.addEventListener('input', function () { o.textContent = s.value; });
  })();
</script>

That little slider is a placeholder, but it shows the pattern: an interactive
element is just HTML (and a sprinkle of script) embedded directly in the
chapter's Markdown. The build system passes it through untouched, so any widget
— from a one-line slider to a full simulation — drops in the same way.

## Asides come in a few flavors

<aside class="callout">
  <span class="callout-label">note</span>
  <p>A plain note, for context that's useful but not essential.</p>
</aside>

<aside class="callout" data-kind="tip">
  <span class="callout-label">tip</span>
  <p>A tip, for a shortcut or a better way to think about something.</p>
</aside>

<aside class="callout" data-kind="warning">
  <span class="callout-label">heads up</span>
  <p>A warning, for a common mistake worth steering around.</p>
</aside>

## Code, when it helps

```python
def amplitude(x, a):
    """Scale x by a — the parameter the slider above controls."""
    return a * x
```

And a quick table, because some ideas are clearest as a grid:

| input | a = 1 | a = 2 |
| ----- | ----- | ----- |
| 1     | 1     | 2     |
| 2     | 2     | 4     |
| 4     | 4     | 8     |

That's the frame. The next step is deciding *what* the book teaches and *which*
interactive elements carry the weight of the learning.
