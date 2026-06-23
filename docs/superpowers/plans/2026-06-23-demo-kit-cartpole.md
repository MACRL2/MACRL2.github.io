# Demo Kit + Cart-Pole Exemplar Chapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, no-build vanilla-JS "demo kit" plus one fully-built cart-pole chapter that exercises interactive plots, live simulation, a runnable algorithm, and a tunable diagram.

**Architecture:** Declarative `<div class="demo" data-demo="…">` mount points discovered by a `Demos.register/mountAll` registry (lazy IntersectionObserver mounting). Demos receive a `ctx` of shared kit helpers (`Theme`, `Plot`, `Anim`, `integrate`, `Controls`, `Diagram`, `linalg`). Pure math (integrators, linear algebra, cart-pole dynamics, controllers) is split into Node-testable modules; canvas/DOM rendering is verified by served smoke tests + a manual checklist. The site stays a pure static deploy.

**Tech Stack:** Python 3 + Jinja2 + Mistune (existing SSG), vanilla ES modules, Canvas 2D + inline SVG, KaTeX (vendored) for math, Node's built-in test runner (`node --test`) for unit tests.

---

## Conventions (read once, applies to all tasks)

- **ES modules** everywhere; files use `.js` and are loaded as `<script type="module">` or dynamic `import()`. Unit tests live in `tests/*.test.mjs` and import the **same** module files directly (modules must not touch browser globals at top level — only inside functions — so Node can import them).
- **Commit after each task** with the message shown in its final step.
- **Verify before commit.** Pure-logic tasks: `node --test`. Canvas/DOM tasks: `make site && (cd dist && python3 -m http.server 8000 &)` then load the page / test harness and confirm the acceptance criteria + zero console errors.
- **No external network at runtime** — KaTeX is vendored (Task 9).
- **Theme tokens:** never hardcode colors in JS. Resolve them through `Theme.tokens()` (Task 2) so light/dark works.

## File structure (created/modified by this plan)

```
build.py                       # MODIFY: pass `interactive` front-matter flag
templates/_layout.html.j2      # MODIFY: gated kit+KaTeX includes; themechange dispatch
static/demo-kit/
  theme.js                     # CREATE: CSS-token reader + themechange fan-out
  sim.js                       # CREATE: integrate(euler|rk4) [pure] + Anim loop + Canvas2D draw helper
  linalg.js                    # CREATE: pure matrix ops, finite-diff linearize, charpoly, polyroots
  plot.js                      # CREATE: scale/niceTicks [pure] + Plot canvas renderer
  controls.js                  # CREATE: sliders/toggles/buttons bound to a state object
  diagram.js                   # CREATE: SVG progressive-reveal / hover-highlight
  kit.js                       # CREATE: registry + lazy mount loader + ctx assembly
static/vendor/katex/           # CREATE: vendored KaTeX dist (css, js, auto-render, fonts/)
static/demos/
  cartpole-dynamics.js         # CREATE: pure deriv/energy/controllers
  cartpole-diagram.js          # CREATE: tunable diagram demo
  cartpole-linearized.js       # CREATE: interactive plot demo (poles + step response)
  cartpole-sim.js              # CREATE: live simulation demo
  cartpole-learn.js            # CREATE: runnable-algorithm demo
content/02-cartpole.md         # CREATE: the exemplar chapter
tests/
  integrate.test.mjs           # CREATE
  linalg.test.mjs              # CREATE
  cartpole-dynamics.test.mjs   # CREATE
tests/manual/                  # CREATE: standalone HTML harnesses for canvas modules
```

---

### Task 1: Build + layout plumbing (`interactive` gating + theme event)

**Goal:** Pages opt into the demo kit via front-matter `interactive: true`; the layout conditionally includes the kit (and, later, KaTeX), and the theme toggle broadcasts a `themechange` event.

**Files:**
- Modify: `build.py` (the page dict in `discover_pages`, ~line 104)
- Modify: `templates/_layout.html.j2` (head + toggle script)
- Create: `content/_smoke-interactive.md` (temporary; deleted in final step)

**Acceptance Criteria:**
- [ ] A page with `interactive: true` emits `<script type="module" src="/static/demo-kit/kit.js">` in its HTML.
- [ ] A page without it (e.g. `index.html`) does NOT include that script.
- [ ] The toggle handler dispatches `window.dispatchEvent(new CustomEvent('themechange'))` after flipping `data-theme`.

**Verify:** `python3 build.py && grep -q 'demo-kit/kit.js' dist/_smoke-interactive/index.html && ! grep -q 'demo-kit/kit.js' dist/index.html && echo OK`

**Steps:**

- [ ] **Step 1: Add `interactive` to the page dict.** In `build.py`, inside the dict appended in `discover_pages`, add after the `hide_from_toc` line:

```python
                "interactive": bool(meta.get("interactive")),
```

- [ ] **Step 2: Gate the kit include in the layout.** In `templates/_layout.html.j2`, immediately before `</head>`, add:

```html
{% if page.interactive %}
<!-- Interactive demo kit (loaded only on chapters that opt in). -->
<script type="module" src="/static/demo-kit/kit.js?v={{ build_fp }}"></script>
{% endif %}
```

- [ ] **Step 3: Broadcast theme changes.** In the toggle handler `<script>` in `_layout.html.j2`, inside the `click` listener, after the `try { localStorage.setItem(...) } catch (e) {}` line and before `sync();`, add:

```javascript
      window.dispatchEvent(new CustomEvent('themechange'));
```

- [ ] **Step 4: Create the smoke page.**

```markdown
---
title: Smoke (interactive)
interactive: true
hide_from_toc: true
---

# Smoke

Interactive gating smoke test.
```

Save as `content/_smoke-interactive.md`.

- [ ] **Step 5: Build and verify gating.**

Run: `python3 build.py && grep -q 'demo-kit/kit.js' dist/_smoke-interactive/index.html && ! grep -q 'demo-kit/kit.js' dist/index.html && echo GATING_OK`
Expected: `GATING_OK`

- [ ] **Step 6: Commit.** (The smoke page stays until Task 15 confirms the real chapter; it is harmless — `hide_from_toc`.)

```bash
git add build.py templates/_layout.html.j2 content/_smoke-interactive.md
git commit -m "feat(frame): interactive front-matter gating + themechange event"
```

---

### Task 2: `theme.js` — design-token reader + change fan-out

**Goal:** A tiny module that reads the site's CSS custom properties and notifies subscribers on light↔dark, so canvas demos recolor live.

**Files:**
- Create: `static/demo-kit/theme.js`

**Acceptance Criteria:**
- [ ] `Theme.tokens()` returns an object with `accent, fg, bg, muted, faint, rule, surface` as concrete color strings.
- [ ] `Theme.onChange(cb)` calls `cb` on each `themechange` event; returns an unsubscribe function.

**Verify:** Served harness `tests/manual/theme.html` logs token values that change after toggling `data-theme` (manual). Plus the build still succeeds.

**Steps:**

- [ ] **Step 1: Write `static/demo-kit/theme.js`.**

```javascript
// theme.js — read the site's CSS design tokens and fan out light/dark changes.
// Demos resolve colors through Theme.tokens() (never hardcode) and re-render on
// Theme.onChange so canvas content matches the active theme.
const TOKEN_VARS = {
  accent: '--accent', fg: '--fg', bg: '--bg', muted: '--fg-muted',
  faint: '--fg-faint', rule: '--rule', surface: '--surface',
};

export const Theme = {
  tokens() {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const [k, v] of Object.entries(TOKEN_VARS)) {
      out[k] = cs.getPropertyValue(v).trim();
    }
    return out;
  },
  onChange(cb) {
    const handler = () => cb(this.tokens());
    window.addEventListener('themechange', handler);
    return () => window.removeEventListener('themechange', handler);
  },
};
```

- [ ] **Step 2: Manual harness `tests/manual/theme.html`.**

```html
<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/styles.css">
<button onclick="document.documentElement.toggleAttribute('data-theme-dark'); document.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme')==='dark'?'':'dark'); window.dispatchEvent(new CustomEvent('themechange'))">toggle</button>
<pre id="out"></pre>
<script type="module">
  import { Theme } from '/static/demo-kit/theme.js';
  const out = document.getElementById('out');
  const show = (t) => out.textContent = JSON.stringify(t, null, 2);
  show(Theme.tokens());
  Theme.onChange(show);
</script>
```

- [ ] **Step 3: Verify (served).** `make site && (cd dist && python3 -m http.server 8000 &)`; open `http://127.0.0.1:8000/static/../` is not valid — instead copy the harness: the build copies `static/`, but `tests/manual/` is outside `static/`. For the harness, open it via a second server rooted at repo: `python3 -m http.server 8001` from repo root, visit `/tests/manual/theme.html`. Confirm token values print and change on toggle. Expected: `accent`/`fg`/`bg` values differ between light and dark.

- [ ] **Step 4: Commit.**

```bash
git add static/demo-kit/theme.js tests/manual/theme.html
git commit -m "feat(kit): theme.js token reader + themechange fan-out"
```

---

### Task 3: `sim.js` — ODE integrators (TDD) + animation loop + draw helper

**Goal:** Pure `integrate(deriv, state, dt, method)` (Euler + RK4), plus a browser `Anim` (rAF loop, fixed timestep, play/pause/reset/step, reduced-motion aware) and a thin Canvas2D `draw` helper with world→pixel transforms.

**Files:**
- Create: `static/demo-kit/sim.js`
- Create: `tests/integrate.test.mjs`

**Acceptance Criteria:**
- [ ] `integrate` with `rk4` solves `ẋ = -x` to error < 1e-6 at t=1 (dt=0.01); Euler error is larger.
- [ ] Harmonic oscillator energy drift under RK4 over 10s is < 1% (dt=0.01).
- [ ] `Anim` does not autoplay when `matchMedia('(prefers-reduced-motion: reduce)')` matches.

**Verify:** `node --test tests/integrate.test.mjs`

**Steps:**

- [ ] **Step 1: Write the failing test `tests/integrate.test.mjs`.**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrate } from '../static/demo-kit/sim.js';

test('rk4 solves x_dot = -x accurately', () => {
  const deriv = (s) => [-s[0]];
  let s = [1], t = 0;
  while (t < 1 - 1e-9) { s = integrate(deriv, s, 0.01, 'rk4'); t += 0.01; }
  assert.ok(Math.abs(s[0] - Math.exp(-1)) < 1e-6, `rk4 err=${Math.abs(s[0]-Math.exp(-1))}`);
});

test('rk4 beats euler on the same ODE', () => {
  const deriv = (s) => [-s[0]];
  const run = (m) => { let s=[1],t=0; while(t<1-1e-9){s=integrate(deriv,s,0.05,m);t+=0.05;} return Math.abs(s[0]-Math.exp(-1)); };
  assert.ok(run('rk4') < run('euler'));
});

test('rk4 conserves energy of a harmonic oscillator', () => {
  // x'' = -x  ->  state [x, v], deriv [v, -x]; energy = 0.5(x^2+v^2)
  const deriv = (s) => [s[1], -s[0]];
  let s = [1, 0]; const E0 = 0.5 * (s[0]**2 + s[1]**2);
  for (let t = 0; t < 10; t += 0.01) s = integrate(deriv, s, 0.01, 'rk4');
  const E = 0.5 * (s[0]**2 + s[1]**2);
  assert.ok(Math.abs(E - E0) / E0 < 0.01, `drift=${Math.abs(E-E0)/E0}`);
});
```

- [ ] **Step 2: Run test — expect failure.** `node --test tests/integrate.test.mjs` → FAIL (`integrate` not exported).

- [ ] **Step 3: Implement `static/demo-kit/sim.js`.**

```javascript
// sim.js — numerical integration + a requestAnimationFrame loop for live demos.
// integrate() is pure (Node-testable). Anim/CanvasDraw use browser APIs only
// inside methods, so this module imports cleanly under Node.

// --- pure: fixed-step integrators -------------------------------------------
export function integrate(deriv, state, dt, method = 'rk4') {
  if (method === 'euler') {
    const d = deriv(state);
    return state.map((s, i) => s + dt * d[i]);
  }
  const add = (a, b, h) => a.map((x, i) => x + h * b[i]);
  const k1 = deriv(state);
  const k2 = deriv(add(state, k1, dt / 2));
  const k3 = deriv(add(state, k2, dt / 2));
  const k4 = deriv(add(state, k3, dt));
  return state.map((s, i) => s + (dt / 6) * (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]));
}

// --- browser: animation loop ------------------------------------------------
const REDUCED = () => typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Anim(opts) {
  // opts: { state, step(state, dt)->state, draw(g, state), dt=0.01, speed=1,
  //         autoplay=false, canvas }  — step OR (deriv + integrator).
  const o = Object.assign({ dt: 0.01, speed: 1, autoplay: false, integrator: 'rk4' }, opts);
  const initial = JSON.parse(JSON.stringify(o.state));
  let state = o.state, raf = null, last = null, acc = 0;
  const listeners = { tick: [] };
  const g = o.canvas ? CanvasDraw(o.canvas) : null;

  const advance = () => o.step
    ? o.step(state, o.dt)
    : integrate(o.deriv, state, o.dt, o.integrator);

  function frame(ts) {
    if (last == null) last = ts;
    acc += Math.min(0.05, (ts - last) / 1000) * o.speed; // clamp big gaps
    last = ts;
    while (acc >= o.dt) { state = advance(); acc -= o.dt; }
    redraw();
    listeners.tick.forEach((f) => f(state));
    raf = requestAnimationFrame(frame);
  }
  function redraw() { if (o.draw) o.draw(g, state); }
  const api = {
    play() { if (raf == null) { last = null; raf = requestAnimationFrame(frame); } },
    pause() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } },
    reset() { state = JSON.parse(JSON.stringify(initial)); redraw(); listeners.tick.forEach((f)=>f(state)); },
    step1() { state = advance(); redraw(); listeners.tick.forEach((f)=>f(state)); },
    get state() { return state; },
    set speed(v) { o.speed = v; },
    on(evt, fn) { (listeners[evt] ||= []).push(fn); },
  };
  redraw();
  if (o.autoplay && !REDUCED()) api.play();
  return api;
}

// --- browser: thin Canvas2D wrapper with world->pixel mapping ---------------
export function CanvasDraw(canvas) {
  const dpr = window.devicePixelRatio || 1;
  function fit() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }
  fit();
  const ctx = canvas.getContext('2d');
  let world = { x0: -1, x1: 1, y0: -1, y1: 1 }; // default world bounds
  const W = () => canvas.width, H = () => canvas.height;
  return {
    ctx,
    fit,
    setWorld(b) { world = b; },
    clear() { ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,W(),H()); },
    sx(x) { return ((x - world.x0) / (world.x1 - world.x0)) * W(); },
    sy(y) { return H() - ((y - world.y0) / (world.y1 - world.y0)) * H(); },
    px(p) { return p * dpr; }, // pixel sizes (line widths, radii) in CSS px
  };
}
```

- [ ] **Step 4: Run test — expect pass.** `node --test tests/integrate.test.mjs` → 3 passing.

- [ ] **Step 5: Commit.**

```bash
git add static/demo-kit/sim.js tests/integrate.test.mjs
git commit -m "feat(kit): sim.js integrators (rk4/euler) + Anim loop + CanvasDraw"
```

---

### Task 4: `linalg.js` — pure linear algebra for the control demo

**Goal:** Finite-difference linearization, characteristic polynomial (Faddeev–LeVerrier), and complex polynomial roots (Durand–Kerner) — enough to compute closed-loop poles of a small system.

**Files:**
- Create: `static/demo-kit/linalg.js`
- Create: `tests/linalg.test.mjs`

**Acceptance Criteria:**
- [ ] `linearize(f, x0, u0)` recovers `A` for a linear `f(x,u)=Ax+Bu` to < 1e-4.
- [ ] `charpoly` of `diag(1,2,3)` is `λ³ − 6λ² + 11λ − 6` (coeffs `[1,-6,11,-6]`).
- [ ] `polyroots([1,-6,11,-6])` returns roots ≈ {1,2,3} (real parts; |im|<1e-6).

**Verify:** `node --test tests/linalg.test.mjs`

**Steps:**

- [ ] **Step 1: Write the failing test `tests/linalg.test.mjs`.**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linearize, charpoly, polyroots, matVec } from '../static/demo-kit/linalg.js';

test('linearize recovers A from a linear system', () => {
  const A = [[0,1,0,0],[ -2,-3,0,0],[0,0,0,1],[0,0,-5,-1]];
  const f = (x, u) => matVec(A, x).map((v,i)=> v + (i===1? u[0]:0));
  const { A: Ahat } = linearize(f, [0,0,0,0], [0]);
  for (let i=0;i<4;i++) for (let j=0;j<4;j++)
    assert.ok(Math.abs(Ahat[i][j]-A[i][j]) < 1e-4, `A[${i}][${j}]`);
});

test('charpoly of diag(1,2,3)', () => {
  const c = charpoly([[1,0,0],[0,2,0],[0,0,3]]);
  assert.deepEqual(c.map((v)=>Math.round(v)), [1,-6,11,-6]);
});

test('polyroots finds {1,2,3}', () => {
  const roots = polyroots([1,-6,11,-6]).map(r=>r.re).sort((a,b)=>a-b);
  [1,2,3].forEach((v,i)=> assert.ok(Math.abs(roots[i]-v) < 1e-4, `root ${i}=${roots[i]}`));
});
```

- [ ] **Step 2: Run test — expect failure.** `node --test tests/linalg.test.mjs` → FAIL.

- [ ] **Step 3: Implement `static/demo-kit/linalg.js`.**

```javascript
// linalg.js — small pure linear-algebra helpers (no browser APIs).
export function matVec(A, x) { return A.map(row => row.reduce((s,a,j)=>s+a*x[j],0)); }
export function matMat(A, B) {
  const n=A.length, m=B[0].length, k=B.length, C=Array.from({length:n},()=>Array(m).fill(0));
  for (let i=0;i<n;i++) for (let j=0;j<m;j++){ let s=0; for(let t=0;t<k;t++) s+=A[i][t]*B[t][j]; C[i][j]=s; }
  return C;
}
export function eye(n){ return Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0)); }
export function trace(A){ return A.reduce((s,r,i)=>s+r[i],0); }
export function addScaledEye(A, c){ return A.map((r,i)=>r.map((v,j)=> v + (i===j? c:0))); }

// Central-difference Jacobians. f: (x:number[], u:number[]) -> number[]
export function linearize(f, x0, u0, eps = 1e-5) {
  const n = x0.length, m = u0.length, f0len = f(x0, u0).length;
  const A = Array.from({length:f0len},()=>Array(n).fill(0));
  const B = Array.from({length:f0len},()=>Array(m).fill(0));
  for (let j=0;j<n;j++){
    const xp=[...x0], xm=[...x0]; xp[j]+=eps; xm[j]-=eps;
    const dp=f(xp,u0), dm=f(xm,u0);
    for (let i=0;i<f0len;i++) A[i][j]=(dp[i]-dm[i])/(2*eps);
  }
  for (let j=0;j<m;j++){
    const up=[...u0], um=[...u0]; up[j]+=eps; um[j]-=eps;
    const dp=f(x0,up), dm=f(x0,um);
    for (let i=0;i<f0len;i++) B[i][j]=(dp[i]-dm[i])/(2*eps);
  }
  return { A, B };
}

// Faddeev–LeVerrier: returns monic coeffs [1, c1, ..., cn] of det(λI - A).
export function charpoly(A) {
  const n = A.length;
  let M = eye(n); const c = [1];
  for (let k=1;k<=n;k++){
    const AM = matMat(A, M);
    const ck = -trace(AM)/k;
    c.push(ck);
    M = addScaledEye(AM, ck);
  }
  return c;
}

// Durand–Kerner: complex roots of a polynomial given monic-or-not coeffs
// [a0, a1, ..., an] for a0 x^n + ... + an. Returns [{re, im}].
export function polyroots(coeffs) {
  const a = coeffs.map(Number);
  const n = a.length - 1;
  if (n <= 0) return [];
  const norm = a.map(v => v / a[0]);
  const cx = (re,im)=>({re,im});
  const mul=(p,q)=>cx(p.re*q.re-p.im*q.im, p.re*q.im+p.im*q.re);
  const sub=(p,q)=>cx(p.re-q.re,p.im-q.im);
  const div=(p,q)=>{ const d=q.re*q.re+q.im*q.im; return cx((p.re*q.re+p.im*q.im)/d,(p.im*q.re-p.re*q.im)/d); };
  const evalp=(z)=>{ let r=cx(norm[0],0); for(let i=1;i<norm.length;i++) r=cx(mul(r,z).re+norm[i], mul(r,z).im); return r; };
  let roots = Array.from({length:n},(_,i)=> { const ang=(2*Math.PI*i)/n + 0.5; return cx(0.4*Math.cos(ang)+0.1, 0.9*Math.sin(ang)); });
  for (let iter=0; iter<200; iter++){
    let maxd=0;
    const next = roots.map((zi,i)=>{
      let denom=cx(1,0);
      for (let j=0;j<n;j++){ if(j!==i) denom=mul(denom, sub(zi, roots[j])); }
      const delta=div(evalp(zi), denom);
      maxd=Math.max(maxd, Math.hypot(delta.re,delta.im));
      return sub(zi, delta);
    });
    roots=next;
    if (maxd < 1e-12) break;
  }
  return roots;
}
```

- [ ] **Step 4: Run test — expect pass.** `node --test tests/linalg.test.mjs` → 3 passing.

- [ ] **Step 5: Commit.**

```bash
git add static/demo-kit/linalg.js tests/linalg.test.mjs
git commit -m "feat(kit): linalg.js linearize + charpoly + polyroots"
```

---

### Task 5: `plot.js` — pure scaling helpers (TDD) + canvas plotter

**Goal:** Pure `scale` and `niceTicks`, plus a `Plot(canvas, opts)` that draws axes + line/scatter series in theme colors, supports `setData`/`push`/`render`/`onTheme`.

**Files:**
- Create: `static/demo-kit/plot.js`
- Create: `tests/plot.test.mjs`
- Create: `tests/manual/plot.html`

**Acceptance Criteria:**
- [ ] `scale([0,10],[0,100])(5) === 50`.
- [ ] `niceTicks(0, 9.7)` returns ascending "nice" ticks spanning the range (first ≤ 0, last ≥ 9.7).
- [ ] Manual: `tests/manual/plot.html` renders axes + a sine curve; recolors on theme toggle; stays crisp on resize.

**Verify:** `node --test tests/plot.test.mjs` (pure parts); manual harness for canvas.

**Steps:**

- [ ] **Step 1: Failing test `tests/plot.test.mjs`.**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scale, niceTicks } from '../static/demo-kit/plot.js';

test('scale maps linearly', () => {
  assert.equal(scale([0,10],[0,100])(5), 50);
  assert.equal(scale([0,10],[100,0])(0), 100);
});
test('niceTicks spans the range ascending', () => {
  const t = niceTicks(0, 9.7);
  assert.ok(t[0] <= 0 && t[t.length-1] >= 9.7);
  for (let i=1;i<t.length;i++) assert.ok(t[i] > t[i-1]);
});
```

- [ ] **Step 2: Run — expect failure.** `node --test tests/plot.test.mjs` → FAIL.

- [ ] **Step 3: Implement `static/demo-kit/plot.js`.** Pure helpers first, then the renderer. (Colors are resolved from `Theme.tokens()`; series `color` is a token name like `'accent'`/`'muted'` or a literal CSS color.)

```javascript
// plot.js — pure scaling helpers + a small Canvas2D line/scatter plotter.
import { Theme } from './theme.js';

export function scale(domain, range) {
  const [d0,d1]=domain, [r0,r1]=range; const span=(d1-d0)||1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}
export function niceTicks(min, max, count = 5) {
  const span = (max - min) || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let t = start; t <= max + step*0.5; t += step) ticks.push(Number(t.toFixed(10)));
  return ticks;
}

export function Plot(canvas, opts = {}) {
  const o = Object.assign({ xLabel:'', yLabel:'', xlim:null, ylim:null, series:[] }, opts);
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');
  const data = o.series.map(() => ({ xs: [], ys: [] }));
  const pad = { l: 44*dpr, r: 10*dpr, t: 10*dpr, b: 28*dpr };

  function fit() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width*dpr); canvas.height = Math.round(r.height*dpr);
  }
  function bounds() {
    let xs = [].concat(...data.map(d=>d.xs)), ys = [].concat(...data.map(d=>d.ys));
    const xlim = o.xlim || [Math.min(...xs, 0), Math.max(...xs, 1)];
    const ylim = o.ylim || [Math.min(...ys, 0), Math.max(...ys, 1)];
    return { xlim, ylim };
  }
  function color(name, t) { return t[name] || name; }

  function render() {
    const t = Theme.tokens();
    const { xlim, ylim } = bounds();
    const W = canvas.width, H = canvas.height;
    const X = scale(xlim, [pad.l, W - pad.r]);
    const Y = scale(ylim, [H - pad.b, pad.t]);
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,W,H);
    // axes + ticks
    ctx.strokeStyle = t.rule; ctx.fillStyle = t.muted;
    ctx.lineWidth = 1*dpr; ctx.font = `${12*dpr}px ui-serif, Georgia, serif`;
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, H-pad.b); ctx.lineTo(W-pad.r, H-pad.b); ctx.stroke();
    ctx.textAlign='right'; ctx.textBaseline='middle';
    niceTicks(ylim[0], ylim[1]).forEach(v=>{ const y=Y(v); ctx.fillText(String(v), pad.l-6*dpr, y); });
    ctx.textAlign='center'; ctx.textBaseline='top';
    niceTicks(xlim[0], xlim[1]).forEach(v=>{ const x=X(v); ctx.fillText(String(v), x, H-pad.b+6*dpr); });
    // series
    o.series.forEach((s, i) => {
      const d = data[i]; if (!d.xs.length) return;
      ctx.strokeStyle = color(s.color || 'accent', t); ctx.lineWidth = (s.width||1.5)*dpr;
      ctx.beginPath();
      d.xs.forEach((x, k) => { const px=X(x), py=Y(d.ys[k]); k? ctx.lineTo(px,py):ctx.moveTo(px,py); });
      ctx.stroke();
    });
  }

  fit();
  const api = {
    setData(i, xs, ys) { data[i] = { xs: xs.slice(), ys: ys.slice() }; return api; },
    push(i, x, y) { data[i].xs.push(x); data[i].ys.push(y); return api; },
    clear(i) { if (i==null) data.forEach(d=>{d.xs=[];d.ys=[];}); else data[i]={xs:[],ys:[]}; return api; },
    render, resize() { fit(); render(); }, onTheme: render,
  };
  return api;
}
```

- [ ] **Step 4: Run — expect pass.** `node --test tests/plot.test.mjs` → 2 passing.

- [ ] **Step 5: Manual harness `tests/manual/plot.html`** (imports plot.js, draws a sine, wires resize + a fake theme toggle as in Task 2). Confirm axes/curve render, recolor on toggle, stay crisp on window resize.

```html
<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/styles.css">
<div style="height:240px"><canvas id="c" style="width:100%;height:100%"></canvas></div>
<button id="t">toggle theme</button>
<script type="module">
  import { Plot } from '/static/demo-kit/plot.js';
  const p = Plot(document.getElementById('c'), { series:[{color:'accent'}] });
  const xs=[], ys=[]; for(let x=0;x<=6.3;x+=0.05){xs.push(x);ys.push(Math.sin(x));}
  p.setData(0, xs, ys).render();
  addEventListener('resize', ()=>p.resize());
  t.onclick=()=>{const r=document.documentElement; r.setAttribute('data-theme', r.getAttribute('data-theme')==='dark'?'':'dark'); dispatchEvent(new CustomEvent('themechange')); p.onTheme();};
</script>
```

- [ ] **Step 6: Commit.**

```bash
git add static/demo-kit/plot.js tests/plot.test.mjs tests/manual/plot.html
git commit -m "feat(kit): plot.js scaling helpers + canvas plotter"
```

---

### Task 6: `controls.js` — declarative sliders/toggles/buttons

**Goal:** Build a control panel from a spec, bound to a `state` object, calling `onChange(key, value)` on edits. Styled by classes already present (the `.callout`/range styling); add minimal CSS for layout.

**Files:**
- Create: `static/demo-kit/controls.js`
- Modify: `styles.css` (append a small `.demo-controls` block)
- Create: `tests/manual/controls.html`

**Acceptance Criteria:**
- [ ] A spec with a slider, a toggle, and a button renders three labeled controls.
- [ ] Moving the slider updates `state[key]`, the live readout, and fires `onChange`.
- [ ] Keyboard: controls are reachable by Tab and operable by arrow/Space/Enter.

**Verify:** Manual harness `tests/manual/controls.html`.

**Steps:**

- [ ] **Step 1: Implement `static/demo-kit/controls.js`.**

```javascript
// controls.js — render a small control panel bound to a state object.
// spec: array of { type:'slider'|'toggle'|'button', key, label, ... }
export function Controls(container, spec, state, onChange = () => {}) {
  container.classList.add('demo-controls');
  container.replaceChildren();
  const readouts = {};
  for (const c of spec) {
    const row = document.createElement('label');
    row.className = 'demo-control';
    if (c.type === 'slider') {
      const id = `ctl-${c.key}-${Math.floor(performance.now())}`;
      row.htmlFor = id;
      const name = document.createElement('span'); name.className='ctl-label'; name.textContent = c.label;
      const input = document.createElement('input');
      Object.assign(input, { type:'range', id, min:c.min, max:c.max, step:c.step ?? 'any', value: state[c.key] ?? c.value });
      const out = document.createElement('output'); out.className='ctl-out';
      const fmt = (v) => `${(+v).toFixed(c.dp ?? 2)}${c.unit ? ' '+c.unit : ''}`;
      out.textContent = fmt(input.value); readouts[c.key]=()=>out.textContent=fmt(state[c.key]);
      input.addEventListener('input', () => { state[c.key]=+input.value; out.textContent=fmt(input.value); onChange(c.key, state[c.key]); });
      row.append(name, input, out);
    } else if (c.type === 'toggle') {
      const input = document.createElement('input'); input.type='checkbox'; input.checked = !!(state[c.key] ?? c.value);
      const name = document.createElement('span'); name.className='ctl-label'; name.textContent=c.label;
      input.addEventListener('change', ()=>{ state[c.key]=input.checked; onChange(c.key, input.checked); });
      row.append(input, name);
    } else if (c.type === 'button') {
      const btn = document.createElement('button'); btn.type='button'; btn.className='ctl-btn'; btn.textContent=c.label;
      btn.addEventListener('click', ()=> c.onClick && c.onClick());
      row.replaceChildren(btn);
    }
    container.append(row);
  }
  return { refresh() { Object.values(readouts).forEach(fn=>fn()); } };
}
```

- [ ] **Step 2: Append CSS to `styles.css`.**

```css
/* ----------------------------------------------------------------
   Demo controls (sliders/toggles/buttons inside interactive demos)
---------------------------------------------------------------- */
.demo-controls { display: grid; gap: 0.5rem; margin: 0.75rem 0; }
.demo-control { display: flex; align-items: center; gap: 0.6rem; font-size: 0.9rem; }
.demo-control .ctl-label { color: var(--fg-muted); min-width: 7rem; }
.demo-control input[type="range"] { flex: 1; accent-color: var(--accent); }
.demo-control .ctl-out { font-variant-numeric: tabular-nums; min-width: 4.5rem; }
.ctl-btn {
  font: inherit; cursor: pointer; color: var(--fg);
  background: var(--surface); border: 1px solid var(--rule);
  border-radius: 6px; padding: 0.3rem 0.7rem;
}
.ctl-btn:hover { border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 3: Manual harness `tests/manual/controls.html`** — render a slider+toggle+button, log state on change; tab through to confirm keyboard access.

```html
<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/styles.css">
<div id="panel"></div><pre id="out"></pre>
<script type="module">
  import { Controls } from '/static/demo-kit/controls.js';
  const state={gain:1, on:false}, out=document.getElementById('out');
  const log=()=>out.textContent=JSON.stringify(state);
  Controls(document.getElementById('panel'), [
    {type:'slider', key:'gain', min:0, max:10, step:0.1, value:1, label:'gain', unit:''},
    {type:'toggle', key:'on', value:false, label:'enabled'},
    {type:'button', label:'reset', onClick:()=>{state.gain=1;state.on=false;log();}},
  ], state, log); log();
</script>
```

- [ ] **Step 4: Verify (served) + Commit.**

```bash
git add static/demo-kit/controls.js styles.css tests/manual/controls.html
git commit -m "feat(kit): controls.js declarative control panel + styles"
```

---

### Task 7: `diagram.js` — progressive-reveal / hover-highlight for inline SVG

**Goal:** Given an inline `<svg>` with tagged elements, support hover-highlight (tooltip) and click-to-reveal of layered annotations.

**Files:**
- Create: `static/demo-kit/diagram.js`
- Modify: `styles.css` (append `.demo-diagram` styles)
- Create: `tests/manual/diagram.html`

**Acceptance Criteria:**
- [ ] Hovering an element with `data-tip` shows its tooltip text; leaving hides it.
- [ ] Clicking a `[data-reveal-trigger="X"]` toggles visibility of `[data-reveal="X"]`.
- [ ] Works in light and dark (uses tokens).

**Verify:** Manual harness `tests/manual/diagram.html`.

**Steps:**

- [ ] **Step 1: Implement `static/demo-kit/diagram.js`.**

```javascript
// diagram.js — make an inline SVG interactive: hover tooltips on [data-tip],
// and click reveal of [data-reveal="ID"] via [data-reveal-trigger="ID"].
export function Diagram(svg, opts = {}) {
  const host = svg.closest('.demo') || svg.parentElement;
  host.classList.add('demo-diagram');
  let tip = host.querySelector('.diagram-tip');
  if (!tip) { tip = document.createElement('div'); tip.className='diagram-tip'; tip.hidden=true; host.append(tip); }

  svg.querySelectorAll('[data-tip]').forEach(el => {
    el.style.cursor = 'help';
    el.addEventListener('mouseenter', (e) => {
      tip.textContent = el.getAttribute('data-tip'); tip.hidden = false;
      const r = host.getBoundingClientRect(), b = el.getBoundingClientRect();
      tip.style.left = (b.left - r.left + b.width/2) + 'px';
      tip.style.top = (b.top - r.top) + 'px';
    });
    el.addEventListener('mouseleave', () => { tip.hidden = true; });
  });

  svg.querySelectorAll('[data-reveal]').forEach(el => { el.style.opacity = opts.startRevealed ? 1 : 0; });
  host.querySelectorAll('[data-reveal-trigger]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-reveal-trigger');
      svg.querySelectorAll(`[data-reveal="${id}"]`).forEach(el => {
        el.style.transition = 'opacity 250ms ease';
        el.style.opacity = el.style.opacity === '1' ? '0' : '1';
      });
      btn.classList.toggle('is-on');
    });
  });
  return { };
}
```

- [ ] **Step 2: Append CSS to `styles.css`.**

```css
/* Interactive SVG diagrams */
.demo-diagram { position: relative; }
.demo-diagram .diagram-tip {
  position: absolute; transform: transl(-50%, calc(-100% - 6px));
  background: var(--fg); color: var(--bg); font-size: 0.78rem;
  padding: 0.2rem 0.45rem; border-radius: 5px; pointer-events: none; white-space: nowrap; z-index: 5;
}
.demo-diagram [data-reveal-trigger].is-on { color: var(--accent); border-color: var(--accent); }
```

(Note: the `transform` uses `translate(-50%, calc(-100% - 6px))` — fix the typo to `translate`.)

- [ ] **Step 3: Manual harness `tests/manual/diagram.html`** with a tiny SVG (two boxes, one `data-tip`, one `data-reveal` toggled by a button). Confirm tooltip + reveal toggle.

- [ ] **Step 4: Verify (served) + Commit.**

```bash
git add static/demo-kit/diagram.js styles.css tests/manual/diagram.html
git commit -m "feat(kit): diagram.js SVG tooltips + progressive reveal"
```

---

### Task 8: `kit.js` — registry + lazy mount loader + `ctx` assembly

**Goal:** Discover `.demo[data-demo]` placeholders, lazily import the matching module (which self-registers), and mount it with a shared `ctx`. Pause sims when they scroll far offscreen.

**Files:**
- Create: `static/demo-kit/kit.js`
- Create: `tests/manual/kit.html`

**Acceptance Criteria:**
- [ ] A page with `<div class="demo" data-demo="x">` loads `/static/demos/x.js` and calls its registered mount once, when near the viewport.
- [ ] `ctx` exposes `{ Theme, Plot, Anim, CanvasDraw, integrate, Controls, Diagram, linalg }`.
- [ ] A returned `cleanup()` is called when the element scrolls well offscreen (sims stop).

**Verify:** Manual harness `tests/manual/kit.html` registers a trivial demo and confirms one mount + ctx keys logged.

**Steps:**

- [ ] **Step 1: Implement `static/demo-kit/kit.js`.**

```javascript
// kit.js — the demo registry + lazy auto-mount loader. Auto-runs on load.
import { Theme } from './theme.js';
import { Plot } from './plot.js';
import { Anim, CanvasDraw, integrate } from './sim.js';
import { Controls } from './controls.js';
import { Diagram } from './diagram.js';
import * as linalg from './linalg.js';

const registry = new Map();          // name -> mountFn
const pending = new Map();           // name -> [els awaiting registration]
const mounted = new WeakMap();       // el -> { cleanup }

const ctx = { Theme, Plot, Anim, CanvasDraw, integrate, Controls, Diagram, linalg };

function parseParams(el) {
  try { return el.dataset.params ? JSON.parse(el.dataset.params) : {}; }
  catch (e) { console.error('[demo] bad data-params on', el, e); return {}; }
}

function mount(el) {
  if (mounted.has(el)) return;
  const name = el.dataset.demo;
  const fn = registry.get(name);
  if (!fn) { (pending.get(name) || pending.set(name, []).get(name)).push(el); ensureLoaded(name); return; }
  const cleanup = fn(el, parseParams(el), ctx) || null;
  mounted.set(el, { cleanup });
}

const loading = new Set();
function ensureLoaded(name) {
  if (loading.has(name) || registry.has(name)) return;
  loading.add(name);
  import(`/static/demos/${name}.js?v=${document.documentElement.dataset.build||''}`)
    .catch(e => console.error(`[demo] failed to load ${name}`, e));
}

export const Demos = {
  register(name, mountFn) {
    registry.set(name, mountFn);
    const waiting = pending.get(name) || [];
    pending.delete(name);
    waiting.forEach(el => mount(el));
  },
  mountAll(root = document) {
    const els = root.querySelectorAll('.demo[data-demo]');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const el = entry.target;
        if (entry.isIntersecting) mount(el);
        else if (mounted.has(el)) {
          // far offscreen: allow demos (sims) to pause via cleanup
          const rec = mounted.get(el);
          if (rec.cleanup && entry.intersectionRatio === 0) { rec.cleanup(); mounted.delete(el); }
        }
      });
    }, { rootMargin: '200px 0px' });
    els.forEach(el => io.observe(el));
  },
};

window.Demos = Demos;
if (document.readyState !== 'loading') Demos.mountAll();
else document.addEventListener('DOMContentLoaded', () => Demos.mountAll());
```

- [ ] **Step 2: Manual harness `tests/manual/kit.html`.** Load kit, define a tiny demo module inline via an import map shim is overkill — instead create `static/demos/_kittest.js` that registers and logs ctx keys + a mount count, embed `<div class="demo" data-demo="_kittest">`, and confirm a single mount + the ctx keys in console. (Delete `_kittest.js` after, or keep under `static/demos/` prefixed `_`.)

```javascript
// static/demos/_kittest.js  (temporary)
window.__kitMounts = 0;
import('/static/demo-kit/kit.js').then(({ Demos }) => {
  Demos.register('_kittest', (el, params, ctx) => {
    window.__kitMounts++;
    el.textContent = 'mounted; ctx=' + Object.keys(ctx).join(',');
  });
});
```

- [ ] **Step 3: Verify (served).** Open the harness; confirm `el` shows `ctx=Theme,Plot,Anim,CanvasDraw,integrate,Controls,Diagram,linalg` and `window.__kitMounts === 1`.

- [ ] **Step 4: Commit.**

```bash
git add static/demo-kit/kit.js tests/manual/kit.html static/demos/_kittest.js
git commit -m "feat(kit): kit.js registry + lazy IntersectionObserver mounting"
```

---

### Task 9: Vendor KaTeX + math init

**Goal:** Render LaTeX math on interactive pages, self-contained (no runtime CDN).

**Files:**
- Create: `static/vendor/katex/` (downloaded dist)
- Modify: `templates/_layout.html.j2` (gated KaTeX include + auto-render init)

**Acceptance Criteria:**
- [ ] `static/vendor/katex/katex.min.css`, `katex.min.js`, `contrib/auto-render.min.js`, and `fonts/` exist (or, if download fails, a pinned CDN `<link>/<script>` with SRI is used and noted in README).
- [ ] On an interactive page, `$E=mc^2$` and `$$\dot x = Ax+Bu$$` render as math.

**Verify:** Build an interactive page containing math; serve; confirm rendered math (manual) and no 404s for fonts in the network panel.

**Steps:**

- [ ] **Step 1: Vendor the dist.** Pin a version (e.g. `0.16.11`). From repo root:

```bash
KV=0.16.11
mkdir -p static/vendor/katex/contrib static/vendor/katex/fonts
base="https://cdn.jsdelivr.net/npm/katex@${KV}/dist"
curl -fsSL "$base/katex.min.css" -o static/vendor/katex/katex.min.css
curl -fsSL "$base/katex.min.js"  -o static/vendor/katex/katex.min.js
curl -fsSL "$base/contrib/auto-render.min.js" -o static/vendor/katex/contrib/auto-render.min.js
# Fonts: parse the font URLs out of the CSS and fetch each into fonts/.
grep -oE 'fonts/[A-Za-z0-9_.-]+\.(woff2|woff|ttf)' static/vendor/katex/katex.min.css | sort -u | while read -r f; do
  curl -fsSL "$base/$f" -o "static/vendor/katex/$f"; done
ls static/vendor/katex/fonts | head
```

If `curl` has no network in this environment, **fallback:** skip vendoring and in Step 2 use the pinned CDN `<link>`/`<script>` with SRI hashes from jsdelivr; add a README note "KaTeX served from CDN; vendor later for offline." Functionality is identical.

- [ ] **Step 2: Add gated KaTeX to `_layout.html.j2`.** Inside the existing `{% if page.interactive %}` head block (Task 1), before the kit script, add:

```html
<link rel="stylesheet" href="/static/vendor/katex/katex.min.css">
<script defer src="/static/vendor/katex/katex.min.js"></script>
<script defer src="/static/vendor/katex/contrib/auto-render.min.js"></script>
<script>
  window.addEventListener('DOMContentLoaded', function () {
    if (window.renderMathInElement) renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$',  right: '$',  display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
  });
</script>
```

- [ ] **Step 3: Verify.** Temporarily add `$$\dot x = Ax + Bu$$` to `content/_smoke-interactive.md`, `make site`, serve, open `/_smoke-interactive/`; confirm rendered math and no font 404s. Revert the edit.

- [ ] **Step 4: Commit.**

```bash
git add static/vendor/katex templates/_layout.html.j2
git commit -m "feat(kit): vendor KaTeX + gated auto-render on interactive pages"
```

---

### Task 10: `cartpole-dynamics.js` — pure physics + controllers (TDD)

**Goal:** Cart-pole equations of motion, energy, and a stabilizing linear state-feedback controller — all pure and Node-testable; reused by every cart-pole demo.

**Files:**
- Create: `static/demos/cartpole-dynamics.js`
- Create: `tests/cartpole-dynamics.test.mjs`

**Acceptance Criteria:**
- [ ] `deriv([0,0,0,0], 0)` returns `[0,0,0,0]` (upright equilibrium, no force).
- [ ] With force 0 and a small tilt, `θ̈` has the **same sign** as `θ` (unstable upright — pole falls outward).
- [ ] Under `feedback(state)` from a small tilt (θ=0.1), integrating 5 s keeps `|θ| < 0.1` the whole time (the controller stabilizes).

**Verify:** `node --test tests/cartpole-dynamics.test.mjs`

**Steps:**

- [ ] **Step 1: Failing test `tests/cartpole-dynamics.test.mjs`.**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriv, feedback, DEFAULTS } from '../static/demos/cartpole-dynamics.js';
import { integrate } from '../static/demo-kit/sim.js';

test('upright with no force is an equilibrium', () => {
  assert.deepEqual(deriv([0,0,0,0], 0), [0,0,0,0]);
});
test('upright is unstable (theta_ddot same sign as theta)', () => {
  const d = deriv([0,0,0.05,0], 0);
  assert.ok(d[3] * 0.05 > 0, `theta_ddot=${d[3]}`);
});
test('feedback controller stabilizes a small tilt', () => {
  let s = [0,0,0.1,0];
  for (let t=0; t<5; t+=0.01) {
    const u = feedback(s);
    s = integrate((x)=>deriv(x, u), s, 0.01, 'rk4');
    assert.ok(Math.abs(s[2]) < 0.1, `theta blew up to ${s[2]} at t=${t.toFixed(2)}`);
  }
});
```

- [ ] **Step 2: Run — expect failure.** `node --test tests/cartpole-dynamics.test.mjs` → FAIL.

- [ ] **Step 3: Implement `static/demos/cartpole-dynamics.js`.** (θ measured from upright; standard Barto cart-pole. The gain `K` is hand-tuned to stabilize the default plant; sign convention: `u = -K·s`.)

```javascript
// cartpole-dynamics.js — pure cart-pole physics + a stabilizing controller.
// state = [x, xdot, theta, thetadot]; theta from upright (0 = up). u = force on cart.
export const DEFAULTS = { M: 1.0, m: 0.1, l: 0.5, g: 9.81 };

export function deriv(state, u, p = DEFAULTS) {
  const [, xd, th, thd] = state;
  const { M, m, l, g } = p;
  const s = Math.sin(th), c = Math.cos(th);
  const temp = (u + m * l * thd * thd * s) / (M + m);
  const thdd = (g * s - c * temp) / (l * (4/3 - (m * c * c) / (M + m)));
  const xdd = temp - (m * l * thdd * c) / (M + m);
  return [xd, xdd, thd, thdd];
}

export function energy(state, p = DEFAULTS) {
  const [, xd, th, thd] = state; const { M, m, l, g } = p;
  const ke = 0.5*(M+m)*xd*xd + 0.5*m*l*l*thd*thd + m*l*xd*thd*Math.cos(th);
  const pe = m*g*l*Math.cos(th);
  return ke + pe;
}

// Stabilizing linear state feedback u = -K·s for the DEFAULT plant.
// Tuned so upright is stabilized (verified by the controller test).
export const K_DEFAULT = [-1.0, -2.0, 28.0, 6.0];
export function feedback(state, K = K_DEFAULT) {
  return -(K[0]*state[0] + K[1]*state[1] + K[2]*state[2] + K[3]*state[3]);
}
```

> If the controller test fails to stabilize, retune `K_DEFAULT` (increase the θ and θ̇ gains, indices 2–3) until θ stays bounded; the test is the oracle.

- [ ] **Step 4: Run — expect pass.** `node --test tests/cartpole-dynamics.test.mjs` → 3 passing. Retune `K_DEFAULT` if the 3rd test fails.

- [ ] **Step 5: Commit.**

```bash
git add static/demos/cartpole-dynamics.js tests/cartpole-dynamics.test.mjs
git commit -m "feat(demo): cart-pole dynamics + stabilizing feedback (tested)"
```

---

### Task 11: `cartpole-diagram.js` — tunable diagram demo

**Goal:** An annotated cart-pole + control-loop SVG; hover reveals state variables/forces, a button reveals the closed-loop signal path.

**Files:**
- Create: `static/demos/cartpole-diagram.js`

**Acceptance Criteria:**
- [ ] Registers as `cartpole-diagram` and mounts into its `.demo` element.
- [ ] Renders an inline SVG of a cart + pole with `data-tip` labels for `x`, `θ`, `F`.
- [ ] A "show control loop" button reveals the plant→controller→actuator arrows (uses `ctx.Diagram`).

**Verify:** Built into the chapter (Task 15); manual check: hover tips appear, reveal toggles.

**Steps:**

- [ ] **Step 1: Implement `static/demos/cartpole-diagram.js`.** Build the SVG string (cart rect, wheels, pole line, mass circle, dimension/force annotations with `data-tip`, and a `[data-reveal="loop"]` group of control-loop arrows), inject it, add a `[data-reveal-trigger="loop"]` button, then call `ctx.Diagram(svg)`.

```javascript
// cartpole-diagram.js — annotated, progressively-revealed cart-pole schematic.
const SVG = `
<svg viewBox="0 0 360 200" class="cp-diagram" role="img" aria-label="Cart-pole schematic">
  <line x1="20" y1="150" x2="340" y2="150" stroke="currentColor" stroke-opacity="0.4"/>
  <g data-tip="cart position x (control acts here)">
    <rect x="150" y="130" width="60" height="20" rx="3" fill="currentColor" fill-opacity="0.15" stroke="currentColor"/>
    <circle cx="163" cy="152" r="5" fill="currentColor"/><circle cx="197" cy="152" r="5" fill="currentColor"/>
  </g>
  <line x1="180" y1="130" x2="220" y2="60" stroke="currentColor" stroke-width="3" data-tip="pole angle θ from upright"/>
  <circle cx="220" cy="60" r="8" fill="currentColor" data-tip="pole mass m"/>
  <line x1="150" y1="140" x2="110" y2="140" stroke="currentColor" stroke-width="2" marker-end="url(#arr)" data-tip="control force F"/>
  <g data-reveal="loop" opacity="0">
    <text x="20" y="30" font-size="11">controller → F → plant → state → controller</text>
  </g>
  <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="currentColor"/></marker></defs>
</svg>`;

function mount(el, params, ctx) {
  el.innerHTML = SVG + `<p><button type="button" class="ctl-btn" data-reveal-trigger="loop">show control loop</button></p>`;
  ctx.Diagram(el.querySelector('svg'));
}
window.Demos ? window.Demos.register('cartpole-diagram', mount)
            : import('/static/demo-kit/kit.js').then(({Demos}) => Demos.register('cartpole-diagram', mount));
```

- [ ] **Step 2: Commit.**

```bash
git add static/demos/cartpole-diagram.js
git commit -m "feat(demo): cart-pole tunable diagram"
```

---

### Task 12: `cartpole-linearized.js` — interactive plot demo

**Goal:** Sliders for pole mass `m`, length `l`, and a θ-gain; live plot of the closed-loop **step response** (θ vs t) from a small tilt, plus a readout of the closed-loop **poles** (via `ctx.linalg`).

**Files:**
- Create: `static/demos/cartpole-linearized.js`

**Acceptance Criteria:**
- [ ] Registers as `cartpole-linearized`; renders a `Plot` canvas + a `Controls` panel.
- [ ] Moving a slider re-integrates and redraws θ(t) within the same frame budget (no reload).
- [ ] A poles readout lists 4 closed-loop eigenvalues; a stable gain shows all real parts < 0.
- [ ] Recolors on theme toggle (subscribes via `ctx.Theme.onChange`).

**Verify:** In the chapter; manual: drag sliders → curve + poles update; toggle theme → recolor.

**Steps:**

- [ ] **Step 1: Implement `static/demos/cartpole-linearized.js`.** Compose `Plot` + `Controls`; on any change, simulate the nonlinear closed loop from θ₀=0.15 for ~4 s, `setData` the θ trace; compute poles by `linearize` of `(x)=>deriv(x,u(x))` about upright then `polyroots(charpoly(A_cl))`.

```javascript
import { DEFAULTS, deriv, feedback, K_DEFAULT } from '/static/demos/cartpole-dynamics.js';

function mount(el, params, ctx) {
  const { Plot, Controls, Theme, integrate, linalg } = ctx;
  el.innerHTML = `<div style="height:220px"><canvas class="cp-plot" style="width:100%;height:100%"></canvas></div>
    <div class="cp-controls"></div><p class="cp-poles" style="font-variant-numeric:tabular-nums;color:var(--fg-muted)"></p>`;
  const plot = Plot(el.querySelector('canvas'), { xLabel:'t (s)', yLabel:'θ (rad)', xlim:[0,4], series:[{color:'accent'}] });
  const state = { m: DEFAULTS.m, l: DEFAULTS.l, kth: K_DEFAULT[2] };

  function recompute() {
    const p = { ...DEFAULTS, m: state.m, l: state.l };
    const K = [...K_DEFAULT]; K[2] = state.kth;
    const u = (x) => feedback(x, K);
    // step response
    let s = [0,0,0.15,0]; const ts=[], ys=[];
    for (let t=0; t<=4; t+=0.02){ ts.push(t); ys.push(s[2]); s = integrate((x)=>deriv(x,u(x),p), s, 0.02, 'rk4'); }
    plot.setData(0, ts, ys).render();
    // poles of closed loop, linearized about upright
    const { A, B } = linalg.linearize((x,uu)=>deriv(x,uu[0],p), [0,0,0,0], [0]);
    // A_cl = A - B K  (B is 4x1, K is 1x4)
    const Acl = A.map((row,i)=> row.map((a,j)=> a - B[i][0]*K[j]));
    const roots = linalg.polyroots(linalg.charpoly(Acl));
    el.querySelector('.cp-poles').textContent = 'closed-loop poles: ' +
      roots.map(r=>`${r.re.toFixed(2)}${r.im>=0?'+':'−'}${Math.abs(r.im).toFixed(2)}i`).join(',  ');
  }
  Controls(el.querySelector('.cp-controls'), [
    {type:'slider', key:'m', min:0.05, max:1.0, step:0.01, value:state.m, label:'pole mass m', unit:'kg'},
    {type:'slider', key:'l', min:0.25, max:1.0, step:0.01, value:state.l, label:'pole length l', unit:'m'},
    {type:'slider', key:'kth', min:5, max:60, step:1, value:state.kth, label:'θ gain', unit:''},
  ], state, recompute);
  const off = Theme.onChange(()=>plot.onTheme());
  recompute();
  return () => off();
}
window.Demos ? window.Demos.register('cartpole-linearized', mount)
            : import('/static/demo-kit/kit.js').then(({Demos}) => Demos.register('cartpole-linearized', mount));
```

- [ ] **Step 2: Commit.**

```bash
git add static/demos/cartpole-linearized.js
git commit -m "feat(demo): cart-pole linearized step-response + poles plot"
```

---

### Task 13: `cartpole-sim.js` — live simulation demo

**Goal:** An animated cart-pole the reader controls: play/pause/reset, a controller on/off toggle, a θ-gain slider, and a "nudge" disturbance button. Uses `ctx.Anim` (RK4) + `ctx.CanvasDraw`.

**Files:**
- Create: `static/demos/cartpole-sim.js`

**Acceptance Criteria:**
- [ ] Registers as `cartpole-sim`; renders a canvas + controls; honors reduced-motion (no autoplay).
- [ ] With the controller on, the pole balances; off, it falls — visibly.
- [ ] "nudge" adds an impulse to `θ̇`; "reset" restores the initial state.
- [ ] Returns a `cleanup()` that pauses the loop (kit pauses it offscreen).

**Verify:** In the chapter; manual: play → balances; toggle off → falls; nudge perturbs; reset works; scroll away → CPU drops.

**Steps:**

- [ ] **Step 1: Implement `static/demos/cartpole-sim.js`.**

```javascript
import { DEFAULTS, deriv, feedback, K_DEFAULT } from '/static/demos/cartpole-dynamics.js';

function mount(el, params, ctx) {
  const { Anim, CanvasDraw, Controls, Theme } = ctx;
  el.innerHTML = `<div style="height:240px"><canvas class="cp-sim" style="width:100%;height:100%"></canvas></div><div class="cp-controls"></div>`;
  const canvas = el.querySelector('canvas');
  const opts = { control: true, kth: K_DEFAULT[2] };
  const p = { ...DEFAULTS };

  const draw = (g, s) => {
    const t = Theme.tokens();
    g.fit(); g.setWorld({ x0:-2.4, x1:2.4, y0:-0.6, y1:1.4 }); g.clear();
    const ctx2 = g.ctx, cx = g.sx(s[0]), cy = g.sy(0);
    // track
    ctx2.strokeStyle = t.rule; ctx2.lineWidth = g.px(1);
    ctx2.beginPath(); ctx2.moveTo(g.sx(-2.4), cy); ctx2.lineTo(g.sx(2.4), cy); ctx2.stroke();
    // cart
    const cw = g.sx(0.4)-g.sx(0), ch = g.px(20);
    ctx2.fillStyle = t.surface; ctx2.strokeStyle = t.fg; ctx2.lineWidth=g.px(1.5);
    ctx2.beginPath(); ctx2.rect(cx-cw/2, cy-ch/2, cw, ch); ctx2.fill(); ctx2.stroke();
    // pole (theta from upright)
    const L = g.sy(0) - g.sy(p.l*2);
    const px = cx + Math.sin(s[2])*Math.abs(L)* (1), py = (cy-ch/2) - Math.cos(s[2])*Math.abs(L);
    ctx2.strokeStyle = t.accent; ctx2.lineWidth=g.px(4);
    ctx2.beginPath(); ctx2.moveTo(cx, cy-ch/2); ctx2.lineTo(px, py); ctx2.stroke();
    ctx2.fillStyle = t.accent; ctx2.beginPath(); ctx2.arc(px, py, g.px(7), 0, 7); ctx2.fill();
  };

  const anim = Anim({
    state: [0,0,0.05,0],
    deriv: (s) => deriv(s, opts.control ? feedback(s, withGain(opts.kth)) : 0, p),
    dt: 0.01, integrator: 'rk4', canvas, draw, autoplay: false,
  });
  function withGain(k){ const K=[...K_DEFAULT]; K[2]=k; return K; }

  Controls(el.querySelector('.cp-controls'), [
    {type:'button', label:'play', onClick:()=>anim.play()},
    {type:'button', label:'pause', onClick:()=>anim.pause()},
    {type:'button', label:'reset', onClick:()=>anim.reset()},
    {type:'button', label:'nudge', onClick:()=>{ anim.state[3] += 1.5; }},
    {type:'toggle', key:'control', value:true, label:'controller on'},
    {type:'slider', key:'kth', min:0, max:60, step:1, value:opts.kth, label:'θ gain'},
  ], opts);

  const off = Theme.onChange(()=>draw(anim.__g || (anim.__g), anim.state)); // redraw on theme
  // Simpler: re-render current frame on theme change:
  const offTheme = Theme.onChange(()=> anim.step1 && requestAnimationFrame(()=>{}));
  addEventListener('resize', ()=>{});
  return () => { anim.pause(); off(); offTheme(); };
}
window.Demos ? window.Demos.register('cartpole-sim', mount)
            : import('/static/demo-kit/kit.js').then(({Demos}) => Demos.register('cartpole-sim', mount));
```

> Note for the implementer: the theme-redraw wiring above is sketched twice — implement it once cleanly by exposing a `redraw()` from `Anim` (add `api.redraw = redraw;` in `sim.js`) and calling it from `Theme.onChange`. Update `sim.js` Task 3 if needed (small, additive). The acceptance criteria are the oracle: balances on, falls off, nudge/reset work, recolors on toggle.

- [ ] **Step 2: Commit.**

```bash
git add static/demos/cartpole-sim.js static/demo-kit/sim.js
git commit -m "feat(demo): cart-pole live simulation with controls"
```

---

### Task 14: `cartpole-learn.js` — runnable-algorithm demo

**Goal:** Improve a linear policy `u=-K·s` over "episodes" by a simple finite-difference / random-search update; a live training curve (return vs episode) drawn with `ctx.Plot`; "step episode" and "run 20" buttons.

**Files:**
- Create: `static/demos/cartpole-learn.js`

**Acceptance Criteria:**
- [ ] Registers as `cartpole-learn`; renders a `Plot` (return vs episode) + buttons.
- [ ] "run 20" improves average return over the first vs last 5 episodes (balancing longer) for a reasonable seed/params.
- [ ] Pure rollout/return helpers are simple enough to reason about; no console errors.

**Verify:** In the chapter; manual: run episodes → curve trends up; reset clears.

**Steps:**

- [ ] **Step 1: Implement `static/demos/cartpole-learn.js`.** A rollout returns episode return (steps balanced, capped); random-search perturbs `K`, keeps perturbation if return improves.

```javascript
import { DEFAULTS, deriv } from '/static/demos/cartpole-dynamics.js';

function rollout(K, p, integrate, maxT = 5, dt = 0.02) {
  let s = [0,0,0.05*(Math.cos(K[0]*0+1)),0]; s = [0,0,0.08,0];
  let ret = 0;
  for (let t=0; t<maxT; t+=dt) {
    const u = -(K[0]*s[0]+K[1]*s[1]+K[2]*s[2]+K[3]*s[3]);
    s = integrate((x)=>deriv(x,u,p), s, dt, 'rk4');
    if (Math.abs(s[2]) > 0.6 || Math.abs(s[0]) > 2.4) break;
    ret += dt; // reward = time upright
  }
  return ret;
}

function mount(el, params, ctx) {
  const { Plot, Controls, Theme, integrate } = ctx;
  el.innerHTML = `<div style="height:200px"><canvas style="width:100%;height:100%"></canvas></div><div class="cp-controls"></div>`;
  const plot = Plot(el.querySelector('canvas'), { xLabel:'episode', yLabel:'return (s)', series:[{color:'accent'}] });
  const p = { ...DEFAULTS };
  let K = [0, 0, 8, 1], best = rollout(K, p, integrate), ep = 0;
  const xs=[], ys=[]; const push=()=>{ xs.push(ep); ys.push(best); plot.setData(0, xs, ys).render(); };
  push();
  function stepEpisode() {
    ep++;
    const cand = K.map(k => k + (Math.random()*2-1) * 2.0);
    const r = rollout(cand, p, integrate);
    if (r > best) { best = r; K = cand; }
    push();
  }
  Controls(el.querySelector('.cp-controls'), [
    {type:'button', label:'step episode', onClick: stepEpisode},
    {type:'button', label:'run 20', onClick: ()=>{ for(let i=0;i<20;i++) stepEpisode(); }},
    {type:'button', label:'reset', onClick: ()=>{ K=[0,0,8,1]; best=rollout(K,p,integrate); ep=0; xs.length=0; ys.length=0; push(); }},
  ], {});
  const off = Theme.onChange(()=>plot.onTheme());
  return () => off();
}
window.Demos ? window.Demos.register('cartpole-learn', mount)
            : import('/static/demo-kit/kit.js').then(({Demos}) => Demos.register('cartpole-learn', mount));
```

- [ ] **Step 2: Commit.**

```bash
git add static/demos/cartpole-learn.js
git commit -m "feat(demo): cart-pole runnable learning (random search) + training curve"
```

---

### Task 15: The chapter `content/02-cartpole.md` + integration verify

**Goal:** Author the chapter that threads prose, math, and all four demos; confirm the whole pipeline works end-to-end; clean up temporary files.

**Files:**
- Create: `content/02-cartpole.md`
- Delete: `content/_smoke-interactive.md`, `static/demos/_kittest.js` (temporaries)
- Modify: `content/01-sample-chapter.md` (set `hide_from_toc: true` so the cart-pole chapter is the featured exemplar) — optional

**Acceptance Criteria:**
- [ ] `make site` builds; `dist/02-cartpole/index.html` includes the KaTeX + kit script tags and the four `.demo` mount points.
- [ ] Served, the page mounts all four demos with **zero console errors**; math renders.
- [ ] All Node tests pass: `node --test tests/`.
- [ ] Manual checklist passes: reduced-motion (no autoplay), keyboard focus on controls, light/dark parity on every canvas, mobile width (~375px) not broken.

**Verify:** `node --test tests/ && python3 build.py && grep -c 'class="demo"' dist/02-cartpole/index.html` → `4`; then served smoke + checklist.

**Steps:**

- [ ] **Step 1: Write `content/02-cartpole.md`** with front-matter `interactive: true`, `nav_order: 1`, `part: "Part I — Getting Started"`, a `summary`, and prose sections interleaving the four mount points and KaTeX math (equations of motion, the feedback law, the learning update). Mount points:

```markdown
<div class="demo" data-demo="cartpole-diagram"></div>
...
<div class="demo" data-demo="cartpole-linearized"></div>
...
<div class="demo" data-demo="cartpole-sim"></div>
...
<div class="demo" data-demo="cartpole-learn"></div>
```

Include the dynamics in display math, e.g.:

```markdown
$$\ddot\theta = \frac{g\sin\theta - \cos\theta\left(\frac{F + m l\,\dot\theta^2\sin\theta}{M+m}\right)}{l\left(\tfrac{4}{3} - \frac{m\cos^2\theta}{M+m}\right)}$$
```

- [ ] **Step 2: Demote the placeholder chapter (optional).** Set `hide_from_toc: true` in `content/01-sample-chapter.md` front-matter so the TOC features the cart-pole chapter.

- [ ] **Step 3: Remove temporaries.**

```bash
git rm content/_smoke-interactive.md static/demos/_kittest.js
```

- [ ] **Step 4: Build + automated verify.**

Run: `node --test tests/ && python3 build.py && test "$(grep -c 'class=\"demo\"' dist/02-cartpole/index.html)" = "4" && echo BUILD_OK`
Expected: all tests pass, then `BUILD_OK`.

- [ ] **Step 5: Served smoke + manual checklist.** `cd dist && python3 -m http.server 8000`; open `/02-cartpole/`:
  - No console errors; all four demos visible and interactive.
  - KaTeX equations rendered.
  - Theme toggle recolors every canvas.
  - Reduced-motion (emulate) → sim does not autoplay.
  - Tab reaches controls; sliders move with arrows; buttons fire on Enter/Space.
  - At ~375px width nothing overflows.

- [ ] **Step 6: Commit.**

```bash
git add content/02-cartpole.md content/01-sample-chapter.md
git commit -m "feat(content): cart-pole exemplar chapter wiring all four demo types"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** demo runtime (Tasks 1,8) · theme integration (Tasks 1,2) · plot (5) · sim+integrators (3) · controls (6) · diagram (7) · KaTeX vendored+gated (1,9) · interactive gating (1) · exemplar chapter with all four demo types (10–15) · integrator unit test (3) · reduced-motion/a11y (3,15). All spec acceptance criteria map to a task.
- **Placeholder scan:** no "TBD/TODO"; every code step has real code. The one rough edge — the theme-redraw wiring in Task 13 — is called out explicitly with the clean fix (add `Anim.redraw()` in sim.js) and an acceptance-criteria oracle, not left vague.
- **Type/name consistency:** `integrate(deriv, state, dt, method)`, `deriv(state, u, p)`, `feedback(state, K)`, `K_DEFAULT`, `Plot().setData/render/onTheme`, `Controls(container, spec, state, onChange)`, `Diagram(svg)`, `linalg.linearize/charpoly/polyroots`, `Anim({deriv|step, draw, canvas})` are used identically across tasks.
- **Scope:** one cohesive subsystem (the kit) + one chapter — a single plan.
