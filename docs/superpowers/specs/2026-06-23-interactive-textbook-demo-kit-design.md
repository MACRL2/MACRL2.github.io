# Interactive Textbook — Demo Kit + Cart-Pole Exemplar Chapter

- **Date:** 2026-06-23
- **Status:** Approved (design); ready for implementation planning
- **Builds on:** the static-site frame already in `/workspace` (Python + Jinja2 +
  Markdown SSG ported from the `~/PORTFOLIO` style).

## 1. Context & goals

We are building an online, book-like **interactive textbook** on *next-generation
adaptive control and ML/RL, with downstream applications to robotics in
simulation and the real world*. The reading surface and visual style are
already in place (OKLCH paper-warm palette, system serif, light/dark theme,
calm reading measure, reading-progress bar, callouts, TOC, prev/next nav).

The defining feature is **small embedded toy demos** the reader discovers in
context as they progress. Four demo categories are in scope:

1. **Interactive plots** — sliders/knobs reshaping curves in real time
   (gains, eigenvalues, step responses, loss/training curves, phase plots).
2. **Live simulations** — animated dynamical systems the reader can poke
   (pendulum, cart-pole, mass-spring, arm/quadrotor) with controllers running
   live.
3. **Runnable algorithms** — step/run a small algorithm in-browser (an
   adaptation law, gradient/policy-gradient step, MPC rollout) and watch state
   evolve.
4. **Tunable diagrams** — annotated block diagrams / state machines / graphs
   the reader can manipulate or reveal progressively.

**This deliverable:** a reusable **demo kit** (the shared interactive
infrastructure) plus **one fully-built exemplar chapter** that exercises all
four demo types end-to-end, giving a repeatable authoring template.

### Constraints (from brainstorming)

- **Lean, no-build now** — vanilla JS ES modules, no bundler; the site stays a
  pure static deploy (GitHub Pages compatible), faithful to the portfolio ethos.
- **Clean seams to go heavier later** — the architecture must let us add
  heavier capabilities (e.g. Pyodide for real Python, a bundler, richer charting
  libraries) *additively*, without rewriting existing demos.
- **Audience:** graduate / research level.

## 2. Non-goals (v1 — YAGNI)

Reachable later through the registry seam; **not** built now:

- Pyodide / in-browser Python execution.
- A JS bundler or any build step beyond `build.py`.
- Full-text search.
- Exercises/quizzes with grading or persistence.
- Accounts, progress sync, comments.
- A heavy charting/physics library (we hand-roll small helpers).

## 3. Architecture

### 3.1 Existing frame (recap, unchanged)

- `content/*.md` → `dist/<slug>/index.html` via `build.py`.
- Front-matter: `title`, `description`, `nav_order`, `part`, `summary`,
  `hide_from_toc`. **New:** `interactive: true` (see §3.5).
- Raw HTML is allowed in Markdown (so demo mount points embed inline).
- `static/` is copied verbatim into `dist/static/` — the demo kit ships free.
- Templates: `_layout.html.j2` (frame), `page.html.j2` (page/TOC).

### 3.2 Demo runtime model — declarative mount points + registry (Approach A)

**Authoring.** A chapter embeds a demo with a placeholder element:

```html
<div class="demo" data-demo="cartpole-sim" data-params='{"mass":1.0,"length":0.5}'></div>
```

**Runtime.** `static/demo-kit/kit.js` exposes a global registry and a loader:

```js
window.Demos = {
  // A demo module calls this at import time to register its mount function.
  register(name, mountFn) { /* store name -> mountFn */ },

  // Scan a root for [data-demo] placeholders, dynamically import the matching
  // module (which self-registers), then mount it. Lazy: mounting is deferred
  // until the placeholder scrolls near the viewport (IntersectionObserver).
  async mountAll(root = document) { /* ... */ },
};
```

- **Mount contract:** `mountFn(el, params, ctx) -> cleanup?`
  - `el` — the placeholder element (light DOM, so site CSS + dark mode apply).
  - `params` — parsed from `data-params` JSON (defaults merged in by the demo).
  - `ctx` — a context object exposing the kit helpers + theme:
    `{ Plot, Anim, Controls, Diagram, Theme, integrate }`.
  - Optional returned `cleanup()` lets the loader tear a demo down (e.g. stop
    its animation loop when it scrolls far offscreen).
- **Module location:** `static/demos/<name>.js`, loaded via dynamic
  `import('/static/demos/<name>.js')`. Each module self-registers via
  `Demos.register('<name>', mount)`.
- **Lazy mount:** an `IntersectionObserver` mounts a demo when it nears the
  viewport and (for sims) pauses its rAF loop when it leaves — sims are
  expensive and a chapter may hold several.

**Why this model:** content stays clean in Markdown; each demo is isolated,
reusable, lazy-loaded, and independently testable; light DOM means the careful
OKLCH/dark-mode theming "just works"; and the registry is the **extension
seam** — a future Pyodide-backed demo registers through the same
`Demos.register` path with zero changes to the loader or other demos.

### 3.3 The demo kit (shared modules)

Small vanilla ES modules in `static/demo-kit/`. Each is independently
understandable, has a documented API, and depends only on the browser + the
other named kit modules.

| Module | Purpose | Public API (sketch) | Depends on |
|---|---|---|---|
| `kit.js` | Registry + lazy auto-mount loader; assembles `ctx` | `Demos.register`, `Demos.mountAll` | `theme.js`, helpers |
| `theme.js` | Read CSS design tokens; notify demos on light↔dark | `Theme.tokens()`, `Theme.onChange(cb)` | — |
| `plot.js` | Canvas line/phase/live plots matching the theme | `Plot(canvas, opts)` → `{setData, push, render, resize, onTheme}` | `theme.js` |
| `sim.js` | rAF loop, fixed-timestep ODE integration, 2D draw helper | `Anim(opts)` → `{play, pause, reset, step1, on}`; `integrate(deriv, state, dt, method)` | `theme.js` |
| `controls.js` | Declarative sliders/toggles/buttons bound to state | `Controls(container, spec, state, onChange)` | — |
| `diagram.js` | Progressive-reveal / hover-highlight for inline SVG | `Diagram(svg, opts)` | `theme.js` |

**Interfaces (contracts, stable for v1):**

```js
// plot.js
const plot = Plot(canvasEl, {
  xLabel, yLabel, xlim:[a,b], ylim:[a,b],
  series: [{ color: 'accent', label, width }],   // color resolves theme tokens
});
plot.setData(i, xs, ys);   // replace series i
plot.push(i, x, y);        // append a point (live/streaming plots)
plot.render();             // draw
plot.onTheme();            // re-read tokens + redraw (called on themechange)

// sim.js
const anim = Anim({
  state,                        // mutable plain object
  deriv(state) -> dstate,       // continuous dynamics (for integrate)
  step(state, dt),              // optional discrete step (overrides deriv path)
  draw(g, state),              // g: a thin canvas wrapper (world->pixel helpers)
  dt: 0.01, speed: 1, integrator: 'rk4',  // 'euler' | 'rk4'
  autoplay: false,              // forced false under prefers-reduced-motion
});
anim.play(); anim.pause(); anim.reset(); anim.step1();
anim.on('tick', (state) => {}); // hook for syncing a plot to the sim

// controls.js
Controls(containerEl, [
  { type:'slider', key:'mass', min:0.1, max:2, step:0.01, value:1, label:'pole mass', unit:'kg' },
  { type:'toggle', key:'disturb', value:false, label:'disturbance' },
  { type:'button', label:'reset', onClick },
], state, (key, value) => { /* state already updated; react */ });

// theme.js
Theme.tokens();              // {accent, fg, bg, muted, faint, rule, surface}
Theme.onChange(cb);          // cb() on every themechange event
```

### 3.4 Math rendering — KaTeX (vendored)

- **KaTeX**, version-pinned, **vendored** into `static/vendor/katex/`
  (`katex.min.css`, `katex.min.js`, the `auto-render` extension, and the
  `fonts/` directory). No CDN dependency → self-contained and offline-capable,
  matching the portfolio's no-external-deps ethos.
- A small init renders `$…$` (inline) and `$$…$$` (display) after load via the
  auto-render extension.
- **Fallback:** if vendoring the dist fails inside this container (network),
  fall back to a pinned `jsdelivr` `<link>`/`<script>` with SRI hashes, and note
  the fallback in the chapter/README so it can be vendored later. Functionality
  is identical either way.

### 3.5 Loading & gating

- Heavy assets (demo kit + KaTeX) load **only on pages that opt in** via
  front-matter `interactive: true`. The home page and prose-only pages stay
  feather-light.
- `build.py` passes an `interactive` flag to the template; `_layout.html.j2`
  conditionally includes the KaTeX CSS/JS + init and the demo-kit loader.
- The kit modules are loaded as `<script type="module">`; demo modules are
  dynamically imported on demand by the loader.

### 3.6 Theming integration

- The existing theme-toggle handler in `_layout.html.j2` additionally dispatches
  `window.dispatchEvent(new CustomEvent('themechange'))` after flipping
  `data-theme`.
- `theme.js` listens once and fans out to subscribers; every canvas-based demo
  subscribes via `Theme.onChange` and calls its `onTheme()`/re-render so plots
  and sims recolor instantly on light↔dark.

### 3.7 Accessibility & performance

- `prefers-reduced-motion`: sims do **not** autoplay; the reader uses
  play/step. (Honored in `sim.js`, overriding `autoplay`.)
- Controls are native `<input>`/`<button>` — keyboard accessible, focus rings
  inherited from the existing CSS.
- Canvases set `width/height` to the device pixel ratio for crisp rendering and
  resize with the container.
- Lazy mount + offscreen pause keeps a multi-demo chapter cheap.

## 4. The exemplar chapter — cart-pole: control → learning

`content/02-cartpole.md`, front-matter `interactive: true`, part "Part I". One
vertical slice spanning the book's arc (classical control → adaptive → learned),
exercising all four demo types. Dynamics: standard cart-pole (cart mass `M`,
pole mass `m`, length `l`, gravity `g`); state `[x, ẋ, θ, θ̇]`, control `F`.

| # | Demo type | Module | What it shows |
|---|---|---|---|
| 1 | Tunable diagram | `cartpole-diagram` | The cart-pole + closed control loop; reveal state variables, forces, and the plant→controller→actuator signal path on hover/click. |
| 2 | Interactive plot | `cartpole-linearized` | Linearized-about-upright dynamics: sliders for `m`, `l` (and pole-placement / LQR weight); live plot of closed-loop poles (eigenvalues) and the step response. |
| 3 | Live simulation | `cartpole-sim` | Animated cart-pole the reader controls: choose PID/LQR, drag the cart, inject a disturbance impulse; watch it balance or fall. Uses `Anim` + RK4. |
| 4 | Runnable algorithm | `cartpole-learn` | Step a simple learning/adaptation update across episodes (e.g. policy-gradient on a linear policy, or an adaptive gain law); a live training-curve `Plot` shows return/error improving; "run 10 episodes" / "step" buttons. |

Prose threads the four together: define the system (1), analyze the linearization
(2), watch a hand-designed controller act (3), then let the controller *improve
itself* (4) — motivating the move from classical to adaptive/learned control
that the rest of the book develops. Math (equations of motion, the LQR cost, the
update rule) rendered with KaTeX.

## 5. Build / layout changes

- `build.py`: add `interactive` (bool from front-matter) to the page dict and
  pass it to the template; otherwise unchanged (static copy already ships the
  kit).
- `_layout.html.j2`: (a) conditional KaTeX + demo-kit includes gated on
  `page.interactive`; (b) `themechange` dispatch in the toggle handler.
- No change to `page.html.j2` (demos live in the Markdown body).

## 6. File structure (additions)

```
static/
  demo-kit/
    kit.js          # registry + lazy auto-mount loader, assembles ctx
    theme.js        # design-token reader + themechange fan-out
    plot.js         # canvas plots
    sim.js          # rAF loop + integrators (euler, rk4) + 2D draw helper
    controls.js     # sliders/toggles/buttons bound to state
    diagram.js      # progressive-reveal / hover-highlight SVG
  vendor/
    katex/          # vendored KaTeX dist (css, js, auto-render, fonts/)
  demos/
    cartpole-diagram.js
    cartpole-linearized.js
    cartpole-sim.js
    cartpole-learn.js
content/
  02-cartpole.md    # the exemplar chapter
docs/superpowers/specs/
  2026-06-23-interactive-textbook-demo-kit-design.md   # this file
```

The existing `content/01-sample-chapter.md` is kept as a style reference (or can
be demoted to `hide_from_toc`); the cart-pole chapter is the real exemplar.

## 7. Testing strategy

No-build vanilla JS, so testing is lightweight and pragmatic:

- **Build test:** `python3 build.py` succeeds; `dist/02-cartpole/index.html`
  exists and includes the KaTeX + demo-kit script tags (since `interactive:
  true`) while the home page does not.
- **Smoke test (served):** each of the four `.demo` mount points resolves to a
  registered module and mounts without console errors; KaTeX renders the
  equations; the theme toggle recolors a canvas demo (themechange wiring).
- **Unit-ish checks (pure functions):** the integrators (`integrate` with
  `euler`/`rk4`) are pure and get a tiny Node test — integrate a known ODE
  (e.g. `ẋ = -x`, harmonic oscillator) and assert error bounds; RK4 beats Euler.
- **Manual review checklist** in the chapter PR: reduced-motion (no autoplay),
  keyboard focus on controls, light/dark parity, mobile width.

(If a browser binary becomes available, a Playwright smoke test can be added
later — explicitly deferred, not required for v1.)

## 8. Extension seams (future, not built now)

- **Pyodide demo** — a demo module that loads Pyodide and runs real Python;
  registers via the same `Demos.register` path. The `ctx` can later carry a
  shared Pyodide instance.
- **Bundler** — if module count grows, an optional esbuild step can pre-bundle
  `static/demo-kit/` without changing authoring.
- **Richer charts** — `plot.js` can be swapped for a vendored uPlot behind the
  same `Plot(...)` interface.

## 9. Acceptance criteria

- [ ] `static/demo-kit/` exists with `kit.js`, `theme.js`, `plot.js`, `sim.js`,
      `controls.js`, `diagram.js`, each with the documented API and a header
      comment describing purpose/usage/deps.
- [ ] KaTeX vendored under `static/vendor/katex/` (or pinned-CDN fallback,
      noted), rendering inline and display math.
- [ ] `build.py` + `_layout.html.j2` gate kit+KaTeX on `interactive: true` and
      dispatch `themechange` on toggle.
- [ ] `content/02-cartpole.md` builds and embeds all four demo types, each
      mounting without console errors.
- [ ] Theme toggle recolors canvas demos live; sims honor reduced-motion;
      controls are keyboard accessible.
- [ ] Integrator unit test passes (RK4 error < Euler error on a known ODE).
- [ ] `make serve` shows the chapter working at `127.0.0.1:8000/02-cartpole/`.
