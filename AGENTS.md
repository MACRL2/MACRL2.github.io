# Agent Onboarding

> One doc to get any coding agent (or human) productive in this repo fast:
> what it is, how to build it, how to author a chapter, how to add an
> interactive demo, how to verify a change, and **how the edit → deploy
> workflow behaves**. Read `build.py` (≈190 lines) once and you'll know the
> whole build.

This repo is a **no-build static-site interactive textbook** on next-generation
adaptive control + ML/RL, live at **https://macrl2.github.io/**. A small Python
static-site generator (`build.py`, using Jinja2 + Mistune + PyYAML) renders
`content/*.md` (Markdown + optional YAML front-matter) into
`dist/<slug>/index.html` with clean directory URLs, copies `static/` verbatim,
and cache-busts assets by content hash. The signature feature is a hand-written
vanilla-JS **demo kit**: a chapter drops `<div class="demo" data-demo="NAME">`
into its Markdown, and a lazy `IntersectionObserver` loader
(`static/demo-kit/kit.js`) mounts an interactive plot / sim / algorithm /
diagram when it scrolls into view. **No bundler, no npm runtime, no transpile
step** — demos are plain ES modules served as static files. Every push to `main`
auto-deploys via GitHub Actions.

## 60-second quickstart

```bash
# 1. Install the four Python build deps (this is the exact command CI runs).
pip install jinja2 pyyaml mistune markupsafe
# If your environment blocks system-wide installs (PEP 668):
#   pip install --user --break-system-packages jinja2 pyyaml mistune markupsafe
# No virtualenv is used or needed.

# 2. Build + serve. `make serve` builds into dist/ then serves it.
make serve
# -> http://127.0.0.1:8000  (clean URLs like /02-cartpole/ resolve correctly)
```

- Build without serving: `make site` (alias for `python3 build.py`; prints
  `built <N> page(s) -> dist/ (css v<hash>)`).
- Rebuild on change: `make watch` (needs the external `entr` binary).
- Run unit tests: `node --test tests/`.
- **Never edit `dist/`** — it is wiped and regenerated on every build.

## Repo map

Committed, project-relevant items:

| Path | Role |
|---|---|
| `build.py` | The entire generator (≈190 lines). Read this first. `render()` orchestrates the build. |
| `Makefile` | Command surface: `site`, `serve`, `watch`, `clean`. (Tabs required.) |
| `site.yaml` | Site-wide config (title, eyebrow, tagline, description, footer, emoji favicon pool). All keys optional — code has defaults. |
| `styles.css` | Single stylesheet. OKLCH design tokens in `:root` at top; light default + `:root[data-theme="dark"]`. Callout + `.demo*` styles further down. |
| `templates/_layout.html.j2` | Base layout every page extends: head, masthead, theme toggle, progress bar, footer; the `{% if page.interactive %}` KaTeX + demo-kit block (lines 39–58). |
| `templates/page.html.j2` | Per-page body. `index.md` renders the generated TOC (grouped by `part`, numbered by position); other pages get a back-link + prev/next nav. |
| `content/*.md` | Chapter sources. `index.md` → home page. Numbered chapters (`01-…`, `02-cartpole.md`) plus hidden pages (e.g. `cartpole.md`, `hide_from_toc: true`). See "Authoring a chapter". |
| `static/demo-kit/` | Reusable demo framework: `kit.js`, `theme.js`, `sim.js`, `plot.js`, `controls.js`, `diagram.js`, `linalg.js`. Rarely changes. |
| `static/demos/` | Individual demo modules (`cartpole-*.js`) + shared pure physics (`cartpole-dynamics.js`). **Where you add new demos.** |
| `static/vendor/katex/` | Vendored KaTeX (css/js + `contrib/auto-render.min.js` + fonts). No CDN. Loaded only on interactive pages. |
| `tests/*.test.mjs` | Committed Node unit tests (`integrate`, `linalg`, `plot`, `cartpole-dynamics`, `robot-learning-map-data`, `autonomy-radar-data`, `volume-math`, `capability-volume-spec`, …). `node --test tests/`. |
| `tests/manual/*.html` | Committed hand-open spot-check pages for `controls`, `diagram`, `plot`, `theme`, plus `kit.html` (the loader/mount check) plus the self-checking `autonomy-radar.html`, `capability-volume.html` and `robot-learning-map.html` (they drive the demo and print PASS/FAIL; each mounts into a plain div, **not** a `.demo` one, or `kit.js` would mount a second copy on top). No `sim.html`/`linalg.html`. |
| `tests/browser/*.mjs` | Committed puppeteer smoke/screenshot harnesses (`smoke`, `live`, `shot`, `shot-page`). Need a one-time `npm install`. See "Verifying a change". |
| `package.json`, `package-lock.json` | Declare + pin the puppeteer dev dependency for the browser harnesses. `npm test` → unit tests; `npm run smoke` → browser smoke. |
| `tools/bc-lab/` | PyTorch training for the driving-lab chapters (BC + DAgger): dataset exporter, `train_bc.py`, `run_dagger.mjs` + `train_round.py`; exports the committed `static/demos/{bc-weights,dagger-run}.json`. **Not** a site/CI dependency — see its README. |
| `tools/irl-lab/` | Small PyTorch MaxEnt IRL example for the inverse-RL chapter. Runs a heading-aware bicycle on an 8-connected terrain grid, learns reward weights from synthetic expert trajectories, and exports `static/demos/irl-maxent.json` for a browser visualization. **Not** a site/CI dependency — see its README. |
| `docs/superpowers/` | Design spec + implementation plan + task tracker (all tasks complete). |
| `.github/workflows/pages.yml` | CI deploy pipeline (build → Pages). |
| `README.md`, `.gitignore` | Human overview; hygiene manifest. |

**Not committed (gitignored — a fresh clone will *not* have these):**

- `dist/` — build output; destroyed and recreated every build. Never edit or commit.
- `node_modules/` — installed npm packages (puppeteer + its bundled Chromium). Run `npm install` to populate; never committed.
- `cartpole-*.png` — generated screenshots. Regenerate, don't commit.

## How the build works

`content/<slug>.md` → `dist/<slug>/index.html`, served at the clean URL
`/<slug>/`. `content/index.md` is special: it becomes `dist/index.html` served
at `/` (home page + generated TOC).

Pipeline inside `render()`: `load_site(site.yaml)` → `discover_pages(content/*.md)`
→ `build_toc` → compute hashes → **wipe & recreate `dist/`** (`shutil.rmtree`
then `mkdir`) → copy `styles.css` + `static/` → render each page through
`page.html.j2`.

**Front-matter** (YAML between `---` fences at the very start of the file; all
optional), read by `discover_pages()`:

| Field | Type | Default | Effect |
|---|---|---|---|
| `title` | str | slug with `-`→space, title-cased | `<title>` and TOC link text. |
| `description` | str | `""` | `<meta>` description / link previews. |
| `summary` | str | `""` | One-line blurb under the TOC link. |
| `part` | str | `""` | Grouping label; a divider row is emitted when `part` changes between consecutive TOC pages. |
| `nav_order` | int | `9999` | Sort key; smaller sorts earlier. Ties break on `title.lower()`. |
| `hide_from_toc` | bool | `false` | Build the page but keep it out of the TOC and prev/next nav. |
| `interactive` | bool | `false` | Load KaTeX auto-render **and** the demo kit on this page. |
| `ai_generated` | bool | `false` | Tint the whole page as AI-generated text and show the legend. See "Marking AI-generated text". |
| `volume` | mapping | none | This unit's capability-volume figure, drawn under the chapter's `# title`. Also turns on `interactive`. See "A capability volume per unit". |

Any other key is silently ignored. The chapter number shown in the TOC is a
build-time 1-based position among visible pages — **not** `nav_order` and **not**
the filename prefix.

**Clean-URL scheme:** `url` is `/` for index else `/<slug>/`; output is
`index.html` else `<slug>/index.html`. Every asset path is **absolute**
(`/styles.css`, `/static/…`) — the site must be served from a **domain root**
(see deploy section).

**Cache-busting** — two independent sha256 hashes (10 hex chars):

- `css_version = sha256(styles.css)` → on the stylesheet link `/styles.css?v=…`.
- `build_fp = sha256(styles.css + repr(all page slugs))` → on `<html data-build>`
  and the demo-kit URL `/static/demo-kit/kit.js?v=…`. Changes when pages are
  added/removed **or** css changes.

**`interactive: true`** makes `_layout.html.j2` load, in order:
`katex.min.css`, deferred `katex.min.js` + `contrib/auto-render.min.js`, a
`DOMContentLoaded` `renderMathInElement` call (delimiters `$$`/`$` and
`\[ \]`/`\( \)`, `throwOnError: false`), then
`<script type="module" src="/static/demo-kit/kit.js?v=…">`. **Without this flag,
`$…$` renders as literal dollar signs and `<div class="demo">` stays empty.**

Mistune runs with `escape=False` and plugins
`['strikethrough','table','footnotes','def_list']` — **raw inline HTML and
`<script>` pass through untouched** (a first-class authoring tool). Jinja uses
`StrictUndefined`, so a typo'd template variable breaks the build loudly.

**Math is shielded from Markdown.** `render_markdown()` (build.py) masks every
`$…$` and `$$…$$` span with an inert sentinel *before* Mistune runs, then restores
the raw LaTeX in the emitted HTML. Without this, Mistune's inline parser mangles
LaTeX: an underscore after a brace opens `<em>` (so `\mathbb{E}_{x_0}…\sum_`
becomes `\mathbb{E}<em>{x_0}…\sum</em>`, splitting the text node so KaTeX can't
match the `$$` delimiters and the equation renders as raw source), and
backslash-escapes like `\,` / `\|` get eaten. Thanks to the mask you can now write
`\,`, `\|`, `}_{`, etc. inside math freely. The masking is invisible to authors —
just remember math still needs `interactive: true` to load KaTeX at all.

## Authoring a chapter

Create `content/NN-slug.md`. The filename stem is the URL slug
(`content/03-lqr.md` → `/03-lqr/`). Copy-pasteable starting point:

```markdown
---
title: Linear-Quadratic Regulation
description: From cost functions to optimal feedback, with one thing to tune.
nav_order: 2
part: "Part I — Foundations"
summary: The optimal-control workhorse, built up from a quadratic cost.
interactive: true
---

# Linear-Quadratic Regulation

Prose in normal Markdown. Inline math like $\dot{x} = Ax + Bu$ and display math:

$$ J = \int_0^\infty \left(x^\top Q x + u^\top R u\right)\,dt $$

<aside class="callout" data-kind="try">
  <span class="callout-label">try this</span>
  <p>Drag the slider and watch the closed-loop poles move.</p>
</aside>

## An interactive demo

<div class="demo" data-demo="lqr-poles" data-params='{"q": 1.0}'></div>
```

Then `make site` and load `/` (to check ordering) or the chapter URL. Callout
kinds: `note` (default, no `data-kind`), `tip`, `try`, `warning` — `data-kind`
drives the left-border color; the `<span class="callout-label">` text is
free-form. The TOC is **generated** from all non-home, non-hidden pages — never
hand-maintained. `data-params` on a `.demo` div is parsed as JSON and passed to
the demo (see below); it is supported but not used by any current chapter, so
the reference is `kit.js`'s `parseParams()`.

### Marking AI-generated text

Text written by an AI model is tinted violet (`--ai-fg` in `styles.css`), and
any page with tinted text gets a one-line legend above the article. **Tag it
when you commit it.** If an agent drafted the prose, the tag goes in with the
prose. There are three granularities:

```markdown
---
ai_generated: true        # the whole page
---

<div class="ai">

A run of **Markdown**: headings, lists, callouts, math. The blank lines
inside the div are required, or Mistune treats the contents as raw HTML.

</div>

A human sentence with <span class="ai">an AI-written phrase</span> in it.
```

Raw-HTML blocks take the class directly (`<p class="ai">` inside a callout).
Blocks on an otherwise human page also get a violet margin rule, so the mark
doesn't depend on color alone. Demos inside tagged text keep their normal ink.
The build (`_AI_CLASS_RE` in `build.py`) detects any `ai` class token to decide
whether a page shows the legend.

The initial tags came from git: text in commits with a Claude
`Co-Authored-By` trailer. Commits without that trailer were left untagged, so
the absence of a tint is not a guarantee.

## Adding an interactive demo

**Registry pattern:** `kit.js` loads once per interactive page (as an ES
module). On `DOMContentLoaded` it calls `Demos.mountAll()`, which sets an
`IntersectionObserver` (`rootMargin: '200px 0px'`) over every `.demo[data-demo]`.
When a placeholder nears the viewport it lazily `import()`s
`/static/demos/NAME.js?v=<data-build>`; that module calls
`window.Demos.register(NAME, mountFn)`, and the loader invokes
`mountFn(el, params, ctx)`.

**The `ctx` object is EXACTLY these 8 keys** (`kit.js` line 13):

```js
const ctx = { Theme, Plot, Anim, CanvasDraw, integrate, Controls, Diagram, linalg };
```

- `Theme` — `Theme.tokens()` reads CSS vars (`accent, fg, bg, muted, faint, rule, surface`); `Theme.onChange(cb)` subscribes to the `themechange` event and returns an unsubscribe fn.
- `Plot(canvas, {xLabel, yLabel, xlim, ylim, series})` — Canvas2D line plotter; `setData/push/clear/render/resize/onTheme`.
- `Anim({state, deriv|step, dt, integrator:'rk4', canvas, draw, autoplay})` — rAF loop; `play/pause/reset/step1`. If you pass `canvas`, `Anim` builds its own `CanvasDraw` and hands it to your `draw(g, state)`.
- `CanvasDraw(canvas)` — world→pixel Canvas2D wrapper.
- `integrate(deriv, state, dt, method)` — pure RK4/Euler step.
- `Controls(container, spec, state, onChange)` — sliders/toggles/buttons bound to `state`.
- `Diagram(svg, opts)` — hover tooltips (`[data-tip]`) + click reveals.
- `linalg` — the whole namespace: `ctx.linalg.linearize`, `ctx.linalg.charpoly`, `ctx.linalg.polyroots`, etc.

**Minimal recipe** to add a demo `phase-portrait`:

1. Embed in a chapter (`interactive: true`):
   `<div class="demo" data-demo="phase-portrait"></div>` (optionally `data-params='{…}'`).
2. Create `static/demos/phase-portrait.js`. **The filename stem, the
   `data-demo` value, and the register name must be identical** — a mismatch
   is a 404 or an unmounted demo.
3. Write the mount fn and register at the bottom:

```js
// static/demos/phase-portrait.js
// Optionally share pure logic from a sibling by ABSOLUTE path:
// import { deriv } from '/static/demos/cartpole-dynamics.js';

function mount(el, params, ctx) {
  const { Theme, Plot } = ctx;                  // destructure only what you need
  el.innerHTML = '<canvas></canvas>';
  const plot = Plot(el.querySelector('canvas'), { series: [/* … */] });
  const off = Theme.onChange(() => plot.onTheme());   // recolor on light/dark toggle
  plot.render();
  return () => { off(); };                      // cleanup: runs when scrolled fully out
}

window.Demos.register('phase-portrait', mount); // do NOT import kit.js
```

**Rules:**

- **Never `import` `kit.js`** from a demo — `window.Demos` is already global.
- **Never hardcode colors** — resolve via `Theme.tokens()` at draw time and
  re-render on `Theme.onChange`.
- **Always return a cleanup fn** that pauses any `Anim`, calls the
  `Theme.onChange` unsubscribe, and removes window listeners. The observer
  unmounts demos at `intersectionRatio === 0` and re-mounts on scroll-back, so
  you leak loops/listeners otherwise.
- **Underscore prefix = dev fixture:** files like `static/demos/_kittest.js`
  are stripped from production by `shutil.ignore_patterns('_*')` (`build.py`
  line 159). Name real demos without a leading underscore.

Templates to copy from: `cartpole-diagram.js` (simplest, SVG), `cartpole-sim.js`
(`Anim` + `CanvasDraw` + `Controls`), `cartpole-linearized.js` (`Plot` +
`linalg` pipeline), `cartpole-learn.js` (`Plot` + button-driven stepping).

## The landing-page radar

`content/index.md` is a framing page, not a chapter. It opens on two qualities,
**Task Complexity** and **System Autonomy**, and mounts `autonomy-radar`: a wheel
of **open-ended** axes (no rim and no outer ring; each spoke fades off the
canvas) with one **fixed volume of capability** laid over them. The point it
makes, and that every unit's figure repeats: systems move capability between
axes, they do not grow it.

- **Only systems get a volume** — π0, ANYmal parkour, Atlas parkour, Waymo
  Driver: built robots, not methods. (A method as an idea is unbounded; "RL"
  encloses everything given an unlimited budget.)
- **Every system encloses the same area.** `volume-math.js` rescales each shape
  to one area, so readings only say *where* a system's volume sits. Dragging a
  handle outward solves, in closed form, for how much every other spoke must
  give up; an axis can only be pushed as far as giving up everything else
  allows (`reachOf`, shown in the handle tooltip).
- Left alone it **tours** the systems, morphing one volume into the next at
  constant area, with the previous one left dashed. *All at once* overlays them.
  Click a spoke to split that axis; click the small lineage arc at the hub to
  fold a family back. It opens on the named axes (`namedFrontier()`).

Files:

- `static/demos/volume-math.js` — **pure**, no imports. The shape is a closed
  curve through one radius per spoke, smoothstep-blended between spokes, so its
  area is an exact quadratic form in the radii: `areaOf`, `fitTo` (rescale to an
  area), `solveSpoke` (the drag), `reachOf`, `morph` (constant area at every
  step), `curveOf` (points to draw). Shared with the per-unit figures.
- `static/demos/autonomy-radar-data.js` — **pure** (Node-importable). An axis id
  *is* its path (`sa` → `sa.1` → `sa.1.2`), so any axis not listed in `AXES` is
  synthesized on demand and shows as its code (`SA.1.2`). **To name an axis, add
  one line to `AXES` keyed by its id** — nothing else changes, and the codes stay
  valid. Also holds `visibleAxes` / `openGroups`, `angleFor` / `angleDelta`,
  `hueOf` / `colorOf` (lineage color), `axisFor(nameOrId)` (how unit figures
  find a wheel axis), and `SYSTEMS` — see below.
- `static/demos/autonomy-radar.js` — the mount fn: canvas wheel, split/fold
  tween, hub lineage arcs, the volume and its handles, the tour, hover tooltip,
  the inventory under the chart (each axis's share of the focused system's
  volume, ×even spread). `TWEEN` / `MORPH` / `HOLD` pace it. Params:
  `{"autoplay": false}` (no tour), `{"systems": ["pi0", "anymal"]}`,
  `{"focus": "atlas"}`, `{"expanded": ["tc", "sa"]}`, `{"compare": true}`.

**Systems on the wheel.** `SYSTEMS` holds one entry per system — `label`,
`full`, `method`, `hue` (swatch and compare-mode outline only; the volume itself
is drawn in plain ink), `blurb`, and `scores`: **relative weights**, positive
and unbounded, keyed by axis id at whatever depth the claim was made. Only the
shape matters; doubling every reading changes nothing. Every other axis is
derived by three rules:

1. an axis with a stored reading uses it;
2. an axis with readings *below* it averages its two children;
3. anything else inherits the nearest scored ancestor.

`readingOf(scores, id)` applies them; `setReading(scores, id, v)` is the drag —
pure, and it drops the readings underneath `id`. After a drag the readings are
rescaled to average 1 on screen (`rescaleReadings`), which changes no shape.
Handles take the pointer before the axis does (within `GRAB` px).

The loop for re-arguing a placement mirrors the projection map's: open the page,
drag handles, hit **copy readings**, paste the exported block over `scores` in
`SYSTEMS`. To add a system, add an entry to `SYSTEMS` and its id to
`SYSTEM_IDS`. Problems (loco-manipulation) come next, on the same wheel.

## A capability volume per unit

Every unit carries a small, quiet version of the landing figure, drawn on **just
the axes its new approach moves along**: the approach it starts from dashed, the
one it introduces filled, both at the same volume. The caption is generated
("same volume, moved toward *X* · away from *Y*"). Configure it in the chapter's
front-matter, and it is drawn under the `# title`:

```yaml
volume:
  from: Behavior cloning          # optional: the approach the unit starts from
  to: DAgger                      # optional: the approach it introduces
  axes:                           # clockwise from the top, 2 or more
    Distribution shift: [0.45, 1.7]   # [before, after], relative weights
    Horizon: [0.6, 1.35]              # a wheel axis by name → its name and color
    Expert independence: [1.7, 0.4]
    Compute: 1                        # one number = unchanged
  note: optional line that replaces the generated caption
```

For a section, put the same YAML in a fenced block where the figure should go:

````markdown
## 4. Adversarial imitation

```volume
from: Deep IRL
to: Adversarial imitation
axes:
  Auditable reward: [1.6, 0.4]
  Direct policy: [0.6, 1.5]
```
````

- Values are relative weights. Both shapes are rescaled to the same area, so a
  figure **cannot** show capability growing: scaling every axis up does nothing,
  and only the proportions count.
- An axis named like a wheel axis (`Horizon`, any case) or given by id
  (`tc.2.1`) borrows the wheel's name and lineage color. Anything else is a
  free-standing unit axis.
- `build.py` (`place_volumes` / `volume_div`) validates each spec and **fails
  the build** on a malformed one, naming the file. Either form makes the page
  `interactive`. Both become
  `<div class="demo" data-demo="capability-volume" data-params='…'>`, which can
  also be written by hand.
- `static/demos/capability-volume-spec.js` (**pure**) parses the spec and
  works out the caption (`unitVolume`, `movesOf`).
  `static/demos/capability-volume.js` draws the SVG and morphs dashed → filled as
  it scrolls into view (click to replay).
- The current per-unit readings are first drafts: cart-pole, two branches,
  behavior cloning, DAgger, inverse RL, plus the adversarial-imitation section.

## The projection map

`content/projection-map.md` (hidden from the TOC, linked from the landing page)
keeps the earlier framing: robot learning as a plane, Manual Supervision against
Task Complexity, with `robot-learning-map`. Three files, and only the first is
ever edited to move a dot:

- `static/demos/robot-learning-map-data.js` — **pure** (no browser globals, no
  absolute imports, so Node can import it). Holds `AXIS_TREE`, the five leaf
  axes, and `SYSTEMS`. Every system is scored **only** on the leaves
  (`modeling`, `reference`, `obs`, `act`, `dynamics`, each in `[0,1]`); the
  headline positions are computed. Also holds the projection math: `coeffs`
  (a node's convex weights over the leaves), `project`, `spread` (the interval
  a projection hides), `backProject` (minimum-norm drag).
- `static/demos/robot-learning-map.js` — the mount fn: canvas scatter, axis
  unfolding, mix sliders, hover tooltip, legend filter, place mode, export.
- `tests/robot-learning-map-data.test.mjs` + `tests/manual/robot-learning-map.html`
  — the math, and a self-checking browser page for the interactions.

Placements are opinions and are meant to be re-argued. The fastest loop: open
the page, turn on **place mode**, drag, hit **copy coordinates**, paste the
exported `SYSTEMS` block over the one in the data file.

## Verifying a change

**Unit tests (committed, always available):**

```bash
node --test tests/
```

Tests across `integrate`, `linalg`, `plot`, `cartpole-dynamics`,
`robot-learning-map-data` (projection math), `autonomy-radar-data`
(the radar's axis tree, angles, lineage color, and the system readings),
`volume-math` (the fixed-volume geometry) and `capability-volume-spec` (the
per-unit figure's spec and caption), among others;
~70ms. A
harmless `MODULE_TYPELESS_PACKAGE_JSON` warning prints. **Do NOT run `npm test`**
— it is a stub that errors.

A module is Node-testable only if it uses **relative** imports (`./theme.js`) —
all of `static/demo-kit/*` and the pure `static/demos/cartpole-dynamics.js`
qualify. Demo modules that import siblings by **browser-absolute** path
(`/static/demos/…`) cannot run in Node (`ERR_MODULE_NOT_FOUND`); `node --check
<file>` validates their *syntax* only (it does not resolve imports). Keep new
shared logic pure (no `window`/`document`/`getComputedStyle` at module top
level) so it stays testable — refactor it into a `demo-kit` module and unit-test
that.

**Browser smoke (committed).** Real-browser checks (do demos mount and render?)
live in `tests/browser/`. They need puppeteer (+ its bundled headless Chromium);
on Linux you may also need the usual Chromium shared libraries
(`libnss3`, `libatk-1.0`, `libgbm1`, `libasound2`, …).

```bash
npm install                              # puppeteer, pinned in package-lock.json (+ Chromium)
python3 build.py                         # dist/ must exist for the chapter/screenshot checks
node tests/browser/smoke.mjs kit         # kit.js lazily mounts a demo; ctx has all 8 keys; 0 console errors
node tests/browser/smoke.mjs chapter     # dist/02-cartpole: 4 demos, >=3 canvases, >=1 KaTeX span, 0 errors
node tests/browser/live.mjs              # smoke the deployed prod chapter -> LIVE_OK / LIVE_FAIL
node tests/browser/shot.mjs              # light+dark screenshots of the cart-pole chapter -> cartpole-*.png
node tests/browser/shot-page.mjs <dist-path> <out-prefix>   # light+dark shots of any dist page
```

**No npm on this machine?** `tests/manual/robot-learning-map.html` is a
self-checking page that needs no install: serve the repo root
(`python3 -m http.server`), open it, and read the PASS/FAIL list. Headless
Chrome produces no frames, so `requestAnimationFrame` never fires there — add
`?headless` to drive it from timers and `--dump-dom` the result:

```bash
google-chrome --headless=new --no-sandbox --virtual-time-budget=30000 \
  --dump-dom 'http://127.0.0.1:8000/tests/manual/robot-learning-map.html?headless'
```

All harnesses launch headless Chromium with `--no-sandbox`. Shortcuts:
`npm test` runs the unit tests, `npm run smoke` runs `smoke.mjs`.
`tests/manual/*.html` (committed) are hand-open spot-check pages for individual
kit modules.

## How the workflow behaves (edit → deploy)

The full loop, run from the repo root:

1. **Edit** — change `content/*.md` (chapter), `static/demos/*.js` /
   `static/demo-kit/*.js` (demo), `styles.css`, `site.yaml`, or
   `templates/*.j2`. Never edit `dist/`.
2. **Build** — `make site` (alias `python3 build.py`). Wipes and regenerates
   `dist/`; prints `built <N> page(s) -> dist/ (css v…)`.
3. **Preview** — `make serve` (builds + serves `dist/` at
   `http://127.0.0.1:8000`, bound to loopback via `--bind 127.0.0.1`). Clean
   URLs resolve exactly as on Pages. Scroll to any demo; toggle light/dark.
4. **Verify** — `node --test tests/`. Confirm the change looks right in the
   preview (and, if you set up browser smoke, zero console errors).
5. **Stage + commit** — `git add <files>` then commit. `dist/` and all local
   tooling are gitignored, so nothing generated gets committed.
6. **Push** — `git push origin main`. **The push IS the deploy.**
7. **CI rebuilds + publishes** — `.github/workflows/pages.yml` fires on push to
   `main` (or manual `workflow_dispatch`). Build job (`ubuntu-latest`):
   `checkout@v7` → `setup-python@v6` (3.12) → `pip install jinja2 pyyaml mistune
   markupsafe` → `python3 build.py` → `touch dist/.nojekyll` →
   `upload-pages-artifact@v5` (path `dist`). Deploy job (`needs: build`):
   `deploy-pages@v5` to the `github-pages` environment. Permissions
   `contents:read, pages:write, id-token:write`; concurrency
   `group: pages, cancel-in-progress: true` — **a newer push cancels an
   in-flight run; last push wins.**
8. **Confirm live** — watch the Actions run (`gh run watch`) to confirm
   build + deploy succeeded (the push→CI→Pages path can fail at the build step
   before the site would change), then check **https://macrl2.github.io/**.

**Deploy-when-done convention.** When a change is **complete AND verified**, the
right next step is to deploy it — don't leave finished work only local, and
never deploy half-finished or unverified work (the push auto-deploys
immediately). Precedence: per the global instruction *commit/push only when the
user asks*, you actually run commit/push on the user's request — a standing
"deploy when you're done" request satisfies that. In practice: keep the change
deploy-ready, and deploy it as the closing step.

**Root-site constraint.** Every generated asset path is absolute
(`/styles.css`, `/static/…`), so the site must be served from a **domain
root** — the org/user `*.github.io` root repo `MACRL2/MACRL2.github.io`
(`origin`), Pages **Source: GitHub Actions**. A project subpath
(`user.github.io/project/`) would break every asset link. Keep the
`touch dist/.nojekyll` step (so `_`-prefixed paths survive) and keep
`id-token:write` (required by the OIDC deploy action).

## Gotchas

- **Cart-pole `K_DEFAULT` sign convention** — `static/demos/cartpole-dynamics.js`
  line 23: `K_DEFAULT = [-1.0, -2.0, -28.0, -6.0]` (all four gains negative,
  including the angle gain). `feedback()` computes `u = -(K·state)` — it
  *negates* the dot product (comment on line 22: `u = -K·s`). If you refactor
  the controller, preserve both the negative gains and the negation, or the pole
  goes unstable.
- **Demo modules can't run directly in Node** — `static/demos/*.js` import
  siblings by browser-absolute path (`/static/demos/…`), which Node can't
  resolve. Only `cartpole-dynamics.js` (no such imports) is Node-importable.
  `node --check` passing means syntax-OK, not runnable.
- **`interactive: true` gates everything** — a page with `$…$` math or a
  `.demo` div but no `interactive: true` silently renders neither.
- **`dist/` is destroyed every build** — never store anything precious there;
  never hand-edit or commit it.
- **Browser tests need a one-time install** — `tests/browser/` and
  `package.json`/`package-lock.json` are committed, but `node_modules/` is not;
  run `npm install` once (pulls puppeteer + Chromium) before the browser smokes.
  The `node --test tests/` unit tests need no install.
- **`make watch`** needs the external `entr` binary (not a Python dep).

## Where to look next

- **Design spec (architecture / API contracts):**
  `docs/superpowers/specs/2026-06-23-interactive-textbook-demo-kit-design.md` —
  registry/mount contract, demo-kit module table, KaTeX vendoring, gating,
  theming, a11y, acceptance criteria.
- **Implementation plan (step-by-step, with code):**
  `docs/superpowers/plans/2026-06-23-demo-kit-cartpole.md` (~1400 lines);
  tracker `…demo-kit-cartpole.md.tasks.json` (all 15 tasks complete).
- **The generator itself:** `build.py` — the whole build is in this one file.
  Read it end to end before extending.
