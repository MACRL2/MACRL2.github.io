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
| `tests/*.test.mjs` | Committed Node unit tests (11 tests: `integrate`, `linalg`, `plot`, `cartpole-dynamics`). `node --test tests/`. |
| `tests/manual/*.html` | Committed hand-open spot-check pages for `controls`, `diagram`, `plot`, `theme`, plus `kit.html` (the loader/mount check). No `sim.html`/`linalg.html`. |
| `tests/browser/*.mjs` | Committed puppeteer smoke/screenshot harnesses (`smoke`, `live`, `shot`, `shot-page`). Need a one-time `npm install`. See "Verifying a change". |
| `package.json`, `package-lock.json` | Declare + pin the puppeteer dev dependency for the browser harnesses. `npm test` → unit tests; `npm run smoke` → browser smoke. |
| `tools/bc-lab/` | PyTorch training for the driving-lab chapters (BC + DAgger): dataset exporter, `train_bc.py`, `run_dagger.mjs` + `train_round.py`; exports the committed `static/demos/{bc-weights,dagger-run}.json`. **Not** a site/CI dependency — see its README. |
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

## Verifying a change

**Unit tests (committed, always available):**

```bash
node --test tests/
```

11 tests across `integrate`, `linalg`, `plot`, `cartpole-dynamics`; ~70ms. A
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
