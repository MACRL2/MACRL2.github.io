// autonomy-radar.js — the landing-page wheel: open axes that split, and one
// fixed volume of capability that systems can only move around them.
//
// Two roots (Task Complexity, System Autonomy) radiate from a hub and never
// stop: each spoke is a ray — a point at the origin, an outward arrowhead, then
// a fade instead of a rim, because none of these axes has a ceiling. Click an axis and it splits into its two children; the
// family it came from is marked by a short arc around the hub (click the arc
// to fold it back). Color carries lineage, as before.
//
// Over the axes sits a volume: one closed shape per *system* — a robot that
// was actually built — and every one of them encloses exactly the same area
// (volume-math.js). Systems differ in shape, never in size. Left alone, the
// wheel tours them, morphing one volume into the next without it ever
// growing. Drag a handle outward and the rest of the shape gives ground to pay
// for it: the reach along any one axis is bounded only by giving up the
// others. `copy readings` exports the result back into autonomy-radar-data.js.
import {
  visibleAxes, openGroups, pathOf, depthOf, canExpand,
  codeOf, displayOf, labelOf, isNamed, blurbOf,
  angleFor, angleDelta, colorOf, namedFrontier,
  SYSTEM_IDS, SYSTEMS, readingOf, setReading, rescaleReadings, systemColor, readingsBlock,
} from '/static/demos/autonomy-radar-data.js';
import { fitTo, solveSpoke, reachOf, curveOf } from '/static/demos/volume-math.js';

const TWEEN = 900;               // ms for one split / fold
const MORPH = 1300;              // ms for one system's volume to become the next
const HOLD = 2600;               // ms the tour rests on each system
const RING = 6;                  // px between the lineage arcs around the hub
const GRAB = 11;                 // px around a handle that counts as grabbing it
const TAU = 2 * Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const times = (v) => `×${v.toFixed(1)}`;
const withAlpha = (oklch, a) => oklch.replace(/\)\s*$/, ` / ${a})`);
const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function mount(el, params, ctx) {
  const { Theme } = ctx;

  const systems = (params.systems || SYSTEM_IDS).filter((s) => SYSTEMS[s]);
  const expanded = new Set(params.expanded || namedFrontier());
  const anim = new Map();          // axis id -> { angle, alpha }
  let visible = [];
  let slot = Math.PI / 2;          // half the angular gap between spokes
  let tw = null;                   // active split / fold
  let raf = 0, tourTimer = 0;
  let hover = null;                // axis or lineage arc under the pointer
  let hoverHandle = null;          // axis whose handle is under the pointer
  let drag = null;                 // { axis, moved }
  let swallowClick = false;        // a finished drag must not also split the axis

  // Readings are per-mount copies: dragging edits this wheel, not the module.
  const readings = new Map(systems.map((s) => [s, { ...SYSTEMS[s].scores }]));
  let focus = SYSTEMS[params.focus] ? params.focus : systems[0];
  let mix = new Map([[focus, 1]]);    // what is drawn: a blend of systems' volumes
  let mo = null;                      // active morph { from: Map, to, t0 }
  let trail = null;                   // the system the volume just left (dashed)
  let compare = !!params.compare;
  let touring = params.autoplay !== false && systems.length > 1;

  el.classList.add('radar-host');
  el.innerHTML = `
    <div class="radar">
      <div class="rlmap-bar">
        <p class="rlmap-hint"></p>
        <div class="rlmap-tools">
          <button type="button" class="ctl-btn" data-act="tour"></button>
          <button type="button" class="ctl-btn" data-act="compare">all at once</button>
          <button type="button" class="ctl-btn" data-act="reset">fold back</button>
          <button type="button" class="ctl-btn" data-act="copy">copy readings</button>
        </div>
      </div>
      <div class="radar-systems" role="group" aria-label="systems">
        ${systems.map((s) => `<button type="button" class="ctl-btn radar-sys-btn" data-act="system"
          data-system="${s}"><span class="radar-swatch"></span>${SYSTEMS[s].label}</button>`).join('')}
      </div>
      <div class="radar-stage">
        <canvas></canvas>
        <div class="rlmap-tip" hidden></div>
      </div>
      <p class="radar-now" aria-live="polite"></p>
      <ul class="radar-inventory"></ul>
      <div class="rlmap-export-slot"></div>
      <p class="rlmap-status" role="status"></p>
    </div>`;

  const canvas = el.querySelector('canvas');
  const stage = el.querySelector('.radar-stage');
  const tip = el.querySelector('.rlmap-tip');
  const inventory = el.querySelector('.radar-inventory');
  const now = el.querySelector('.radar-now');
  const hint = el.querySelector('.rlmap-hint');
  const statusEl = el.querySelector('.rlmap-status');
  const slotEl = el.querySelector('.rlmap-export-slot');
  const g = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0;
  let rho = 80;                    // radius of the volume spread evenly
  let LR = 180;                    // where the labels sit — not where the axes end
  let narrow = false;

  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const serif = (size, style = '') =>
    `${style} ${size}px "Iowan Old Style", Palatino, Georgia, ui-serif, serif`.trim();
  const area = () => Math.PI * rho * rho;

  function fit() {
    const rect = stage.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    cx = W / 2; cy = H / 2;
    narrow = W < 560;
    const room = narrow ? 62 : 132;                 // horizontal room a label needs
    rho = clamp(Math.min(W / 2 - room, H / 2 - 46) / 2.15, 30, 150);
    LR = rho * 2.15;
  }

  // ── layout ──────────────────────────────────────────────────────────────
  function seed(id, target) {
    for (const anc of pathOf(id).slice(0, -1).reverse()) {           // splitting
      if (anim.has(anc)) return { angle: anim.get(anc).angle, alpha: 0 };
    }
    for (const [other, v] of anim) {                                  // folding back
      if (other.startsWith(`${id}.`)) return { angle: v.angle, alpha: 0 };
    }
    return { angle: target, alpha: 0 };
  }

  function relayout(animate = true) {
    const next = visibleAxes(expanded);
    const targets = new Map(next.map((id, i) => [id, angleFor(i, next.length)]));
    const from = new Map(), to = new Map();

    for (const id of next) {
      const cur = anim.get(id) || seed(id, targets.get(id));
      anim.set(id, cur);
      from.set(id, { ...cur });
      to.set(id, { angle: cur.angle + angleDelta(cur.angle, targets.get(id)), alpha: 1 });
    }
    for (const [id, cur] of anim) {
      if (targets.has(id)) continue;                                  // leaving
      const anc = pathOf(id).slice(0, -1).reverse().find((a) => targets.has(a));
      const aim = anc ? targets.get(anc) : cur.angle;
      from.set(id, { ...cur });
      to.set(id, { angle: cur.angle + angleDelta(cur.angle, aim), alpha: 0 });
    }

    const slotFrom = slot, slotTo = Math.PI / Math.max(1, next.length);
    visible = next;
    syncInventory();

    if (!animate || REDUCED()) {
      for (const [id, v] of to) anim.set(id, { ...v });
      for (const id of [...anim.keys()]) if (!targets.has(id)) anim.delete(id);
      slot = slotTo;
      tw = null;
      render();
      return;
    }
    tw = { t0: performance.now(), from, to, targets, slotFrom, slotTo };
    startLoop();
  }

  function startLoop() {
    if (raf) return;
    const step = (t) => {
      raf = 0;
      if (tw) {
        const k = ease(Math.min(1, (t - tw.t0) / TWEEN));
        for (const [id, f] of tw.from) {
          const e = tw.to.get(id);
          anim.set(id, { angle: lerp(f.angle, e.angle, k), alpha: lerp(f.alpha, e.alpha, k) });
        }
        slot = lerp(tw.slotFrom, tw.slotTo, k);
        if (k >= 1) {
          for (const id of [...anim.keys()]) if (!tw.targets.has(id)) anim.delete(id);
          tw = null;
          syncInventory();
        }
      }
      if (mo) {
        const k = Math.min(1, (t - mo.t0) / MORPH);
        mix = blend(mo.from, mo.to, ease(k));
        if (k >= 1) { mo = null; mix = new Map([[focus, 1]]); syncInventory(); }
      }
      render();
      if (tw || mo) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // ── the volume ──────────────────────────────────────────────────────────
  /**
   * The spokes a volume is drawn through, in angle order. Mid-split or
   * mid-fold the finer axes carry the shape, and an arriving or departing
   * axis eases its reading from the ancestor on screen — so a split never
   * jolts the volume, and a fold lands exactly on the parent's reading.
   */
  function shapeSpokes() {
    const ids = [...anim.keys()];
    const leaves = ids.filter((id) => !ids.some((o) => o.startsWith(`${id}.`)));
    const key = (a) => (((a + Math.PI / 2) % TAU) + TAU) % TAU;
    return leaves
      .map((id) => ({
        id,
        angle: anim.get(id).angle,
        alpha: anim.get(id).alpha,
        anc: pathOf(id).slice(0, -1).reverse().find((a) => anim.has(a)) || null,
      }))
      .sort((a, b) => key(a.angle) - key(b.angle));
  }

  function rawOf(sys, spokes) {
    const s = readings.get(sys);
    return spokes.map((sp) => {
      const own = readingOf(s, sp.id);
      return sp.anc && sp.alpha < 1 ? lerp(readingOf(s, sp.anc), own, sp.alpha) : own;
    });
  }

  /** A system's volume (or a blend of several), fitted to the one fixed area. */
  function shapeOf(m, spokes, angles) {
    const A = area();
    const acc = new Array(spokes.length).fill(0);
    for (const [sys, w] of m) {
      if (w <= 0) continue;
      fitTo(angles, rawOf(sys, spokes), A).forEach((r, i) => { acc[i] += w * r; });
    }
    return fitTo(angles, acc, A);
  }

  function blend(from, to, k) {
    const out = new Map();
    for (const [s, w] of from) out.set(s, w * (1 - k));
    out.set(to, (out.get(to) || 0) + k);
    return out;
  }

  function focusOn(sys, why = '') {
    if (!readings.has(sys)) return;
    if (sys === focus && !mo) { if (why) say(why); return; }
    trail = focus !== sys ? focus : trail;
    focus = sys;
    if (REDUCED()) { mo = null; mix = new Map([[sys, 1]]); render(); }
    else { mo = { from: new Map(mix), to: sys, t0: performance.now() }; startLoop(); }
    syncSystems(); syncNow(); syncInventory();
    if (why) say(why);
  }

  // ── drawing ─────────────────────────────────────────────────────────────
  const at = (angle, rad) => [cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad];
  const openDepth = () => openGroups(expanded).reduce((m, id) => Math.max(m, depthOf(id)), 0);
  const ring = () => (narrow ? RING * 0.7 : RING);    // tighter on a phone, where the volume is small
  const ringRadius = (depth) => 7 + depth * ring();
  const hubRadius = () => ringRadius(openDepth()) + ring();

  let frame = null;                // this frame's geometry, reused for hit-testing
  function geometry() {
    const spokes = shapeSpokes();
    const angles = spokes.map((s) => s.angle);
    return { spokes, angles, focus: shapeOf(mix, spokes, angles) };
  }

  function strokeCurve(angles, radii) {
    g.beginPath();
    curveOf(angles, radii, 240).forEach(([a, r], i) => {
      const [x, y] = at(a, r);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.closePath();
  }

  function render() {
    const t = Theme.tokens();
    const dark = isDark();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    frame = geometry();
    const hubR = hubRadius();
    const far = Math.hypot(W, H) / 2;

    // Spokes are rays, not lines through the hub. With no rim to say "radius",
    // two opposite spokes drawn as plain strokes fuse into one line — one axis
    // with a negative end — which is exactly the wrong reading. So each starts
    // as a point at the origin, faint, and widens and darkens outward to its
    // label before fading off the canvas: more is always away from the hub.
    for (const id of [...anim.keys()].sort((a, b) => (a === hover ? 1 : b === hover ? -1 : 0))) {
      const a = anim.get(id);
      if (a.alpha <= 0.01) continue;
      const on = id === hover;
      const col = colorOf(id, dark);
      const c = Math.cos(a.angle), sn = Math.sin(a.angle);
      const w1 = (on ? 4.4 : 3) / 2, w2 = w1 * 1.3;    // half-widths at the label and at the edge
      const [x0, y0] = at(a.angle, hubR);
      const [x2, y2] = at(a.angle, far);
      const grad = g.createLinearGradient(x0, y0, x2, y2);
      grad.addColorStop(0, withAlpha(col, 0.25));
      grad.addColorStop(clamp((LR - hubR) / (far - hubR), 0.05, 0.95), col);
      grad.addColorStop(1, withAlpha(col, 0));         // same hue at zero alpha, not black
      g.globalAlpha = a.alpha * (on ? 1 : 0.85);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(cx + c * LR - sn * w1, cy + sn * LR + c * w1);
      g.lineTo(cx + c * far - sn * w2, cy + sn * far + c * w2);
      g.lineTo(cx + c * far + sn * w2, cy + sn * far - c * w2);
      g.lineTo(cx + c * LR + sn * w1, cy + sn * LR - c * w1);
      g.closePath();
      g.fill();
      // an open arrowhead just short of the label, as on every unit's figure:
      // all spokes get one, so none reads as the negative end of another
      const tip = LR - 12, len = on ? 7 : 6, wid = on ? 4.6 : 4;
      g.strokeStyle = col; g.lineWidth = on ? 1.8 : 1.4;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(cx + c * (tip - len) - sn * wid, cy + sn * (tip - len) + c * wid);
      g.lineTo(cx + c * tip, cy + sn * tip);
      g.lineTo(cx + c * (tip - len) + sn * wid, cy + sn * (tip - len) - c * wid);
      g.stroke();
      g.globalAlpha = 1;
    }
    // the origin every spoke leaves from
    g.fillStyle = t.fg; g.globalAlpha = 0.7;
    g.beginPath(); g.arc(cx, cy, 2.4, 0, TAU); g.fill();
    g.globalAlpha = 1;
    g.lineCap = 'round';

    // Lineage arcs, tucked around the hub — the families the axes came from.
    // The span comes from the live gap to the neighbouring family, so a new
    // family's arc opens out of its parent instead of snapping to full width.
    g.lineCap = 'butt';
    for (const id of openGroups(expanded)) {
      const kids = visible.filter((v) => v === id || v.startsWith(`${id}.`));
      if (!kids.length) continue;
      const a0 = anim.get(kids[0]), a1 = anim.get(kids[kids.length - 1]);
      if (!a0 || !a1) continue;
      const outside = visible.length - kids.length;
      const pad = (from, to) => (outside <= 0 ? slot
        : Math.min(slot, Math.abs(angleDelta(from, to)) / 2));
      const before = pad(anim.get(visible[(visible.indexOf(kids[0]) - 1 + visible.length) % visible.length]).angle, a0.angle);
      const after = pad(a1.angle, anim.get(visible[(visible.indexOf(kids[kids.length - 1]) + 1) % visible.length]).angle);
      const fade = kids.reduce((m, k) => m + (anim.get(k)?.alpha ?? 0), 0) / kids.length;
      g.strokeStyle = colorOf(id, dark);
      g.globalAlpha = (id === hover ? 0.95 : 0.6) * fade;
      g.lineWidth = id === hover ? 4 : 3;
      g.beginPath();
      g.arc(cx, cy, ringRadius(depthOf(id)), a0.angle - before * 0.85, a1.angle + after * 0.85);
      g.stroke();
      g.globalAlpha = 1;
    }
    g.lineCap = 'round';

    const { spokes, angles } = frame;
    // the other systems, all the same size: thin outlines when comparing
    if (compare) {
      for (const s of systems) {
        if (s === focus) continue;
        strokeCurve(angles, shapeOf(new Map([[s, 1]]), spokes, angles));
        g.strokeStyle = systemColor(s, dark); g.globalAlpha = 0.55; g.lineWidth = 1.3;
        g.stroke(); g.globalAlpha = 1;
      }
    } else if (trail && trail !== focus && readings.has(trail)) {
      // where the volume just came from, dashed — the same language as each unit's figure
      strokeCurve(angles, shapeOf(new Map([[trail, 1]]), spokes, angles));
      g.setLineDash([3, 4]);
      g.strokeStyle = t.faint; g.globalAlpha = 0.9; g.lineWidth = 1.2;
      g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    }

    // The volume, in plain ink: it is the same stuff whichever system holds it,
    // so it keeps one color while the colored axes underneath change hands.
    const ink = t.fg;
    strokeCurve(angles, frame.focus);
    g.fillStyle = ink; g.globalAlpha = drag ? 0.11 : 0.07; g.fill();
    g.strokeStyle = ink; g.globalAlpha = 0.85; g.lineWidth = drag ? 2.2 : 1.8; g.stroke();
    g.globalAlpha = 1;

    // handles, one per visible spoke, on the focused system only
    for (const id of visible) {
      const pos = handlePos(id);
      const a = anim.get(id);
      if (!pos || !a || a.alpha <= 0.02) continue;
      const on = drag?.axis === id || hoverHandle === id;
      g.globalAlpha = a.alpha;
      g.beginPath(); g.arc(pos[0], pos[1], on ? 6.5 : 4.5, 0, TAU);
      g.fillStyle = on ? ink : t.bg; g.fill();
      g.strokeStyle = ink; g.lineWidth = on ? 2 : 1.6; g.stroke();
      g.globalAlpha = 1;
    }

    // labels sit on the spokes, haloed so the axis runs on behind them
    for (const id of [...anim.keys()]) {
      const a = anim.get(id);
      if (a.alpha <= 0.02) continue;
      const named = isNamed(id);
      const on = id === hover;
      const size = (named ? 13 : 11.5) * (narrow ? 0.88 : 1) + (on ? 1 : 0);
      g.font = serif(size, named ? '' : 'italic');
      const [lx, ly] = at(a.angle, LR);
      const c = Math.cos(a.angle), sn = Math.sin(a.angle);
      g.textAlign = c > 0.25 ? 'left' : c < -0.25 ? 'right' : 'center';
      g.textBaseline = 'middle';
      const lines = wrap(displayOf(id));
      const lh = size * 1.15;
      const y0 = ly - ((lines.length - 1) * lh) / 2 + (Math.abs(c) > 0.25 ? 0 : sn > 0 ? lh * 0.6 : -lh * 0.6);
      g.lineJoin = 'round';
      g.globalAlpha = a.alpha * (named ? 1 : 0.85);
      lines.forEach((line, i) => {
        g.strokeStyle = t.surface || t.bg; g.lineWidth = 5;
        g.strokeText(line, lx, y0 + i * lh);
        g.fillStyle = colorOf(id, dark);
        g.fillText(line, lx, y0 + i * lh);
      });
      if (named && depthOf(id) > 1) {
        g.font = serif(10);
        g.globalAlpha = a.alpha * 0.6;
        const cy2 = sn > 0.25 && Math.abs(c) <= 0.25 ? y0 + lines.length * lh : y0 - lh;
        g.strokeText(codeOf(id), lx, cy2);
        g.fillText(codeOf(id), lx, cy2);
      }
      g.globalAlpha = 1;
    }
  }

  /** Long names go onto two lines when the wheel is narrow, at a space or a hyphen. */
  function wrap(text) {
    if (!narrow || text.length < 12) return [text];
    const mid = text.length / 2;
    let best = -1;
    for (let i = 1; i < text.length - 1; i++) {
      if ((text[i] === ' ' || text[i] === '-') && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    }
    if (best < 0) return [text];
    return text[best] === '-'
      ? [text.slice(0, best + 1), text.slice(best + 1)]
      : [text.slice(0, best), text.slice(best + 1)];
  }

  /** Where the focused volume crosses a spoke, in canvas pixels. */
  function handlePos(id) {
    if (!frame) return null;
    const i = frame.spokes.findIndex((s) => s.id === id);
    if (i < 0) return null;
    return at(frame.angles[i], frame.focus[i]);
  }

  // ── moves ───────────────────────────────────────────────────────────────
  function expand(id) {
    if (!canExpand(id) || expanded.has(id)) return false;
    expanded.add(id);
    relayout();
    return true;
  }
  function collapse(id) {
    if (!expanded.has(id)) return false;
    for (const e of [...expanded]) if (e === id || e.startsWith(`${id}.`)) expanded.delete(e);
    relayout();
    return true;
  }
  function foldAll() { expanded.clear(); relayout(); }

  function scheduleTour() {
    clearTimeout(tourTimer);
    if (!touring) return;
    tourTimer = setTimeout(() => {
      // never stack a morph on an unfinished one — a backgrounded tab stops
      // producing frames, and the queue would otherwise pile up invisibly
      if (!mo && !drag && !tw) focusOn(systems[(systems.indexOf(focus) + 1) % systems.length]);
      scheduleTour();
    }, HOLD + MORPH);
  }
  function setTour(on, why = '') {
    touring = on && systems.length > 1;
    const btn = el.querySelector('[data-act="tour"]');
    btn.textContent = touring ? 'tour: on' : 'tour: off';
    btn.classList.toggle('is-on', touring);
    hint.textContent = touring
      ? 'Touring the systems — the same volume, moved. Click a system or an axis to take over.'
      : 'Drag a handle: the rest of the volume gives way, and it never grows. Click an axis to split it.';
    if (why) say(why);
    scheduleTour();
  }
  const takeOver = () => { if (touring) setTour(false, 'Tour paused — you have the wheel.'); };

  let sayTimer = 0;
  function say(msg) {
    statusEl.textContent = msg;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { statusEl.textContent = ''; }, 6000);
  }

  // ── text around the wheel ───────────────────────────────────────────────
  /** Each visible axis's share of the focused system's volume, ×even spread. */
  function sharesNow() {
    const g0 = geometry();
    const out = new Map();
    g0.spokes.forEach((s, i) => out.set(s.id, g0.focus[i] / rho));
    return out;
  }

  function syncInventory() {
    const dark = isDark();
    const shares = sharesNow();
    inventory.replaceChildren(...visible.map((id) => {
      const li = document.createElement('li');
      li.className = 'radar-chip' + (isNamed(id) ? ' is-named' : '');
      li.dataset.axis = id;
      const share = shares.get(id);
      li.innerHTML = `<span class="radar-dot" style="background:${colorOf(id, dark)}"></span>` +
        `<span class="radar-code">${codeOf(id)}</span>` +
        `<span class="radar-name">${labelOf(id) || '—'}</span>` +
        (share == null ? '' : `<span class="radar-read" style="color:${systemColor(focus, dark)}"
          title="${SYSTEMS[focus].label}: share of its volume, against an even spread">${times(share)}</span>`);
      return li;
    }));
  }

  function syncSystems() {
    const dark = isDark();
    for (const btn of el.querySelectorAll('[data-act="system"]')) {
      const s = btn.dataset.system;
      btn.classList.toggle('is-on', s === focus);
      btn.setAttribute('aria-pressed', String(s === focus));
      btn.querySelector('.radar-swatch').style.background = systemColor(s, dark);
    }
    el.querySelector('[data-act="compare"]').classList.toggle('is-on', compare);
  }

  function syncNow() {
    const s = SYSTEMS[focus];
    now.innerHTML = `<span class="radar-swatch" style="background:${systemColor(focus, isDark())}"></span>` +
      `<strong>${s.full}</strong>` +
      ` <span class="radar-method-name">— ${s.method}.</span> ${s.blurb}`;
  }

  // ── pointer ─────────────────────────────────────────────────────────────
  function polar(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const dx = mx - cx, dy = my - cy;
    return { angle: Math.atan2(dy, dx), rad: Math.hypot(dx, dy), mx, my };
  }
  function handleAt(p) {
    let best = null, bd = GRAB;
    for (const id of visible) {
      const pos = handlePos(id);
      if (!pos) continue;
      const d = Math.hypot(pos[0] - p.mx, pos[1] - p.my);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  function axisAt(p) {
    if (p.rad < hubRadius()) return null;
    let best = null, bd = Infinity;
    for (const id of visible) {
      const a = anim.get(id);
      if (!a) continue;
      const d = Math.abs(angleDelta(a.angle, p.angle));
      if (d < bd) { bd = d; best = id; }
    }
    return bd <= slot ? best : null;
  }
  /** The family whose hub arc is under the pointer — deepest first. */
  function groupAt(p) {
    if (p.rad > hubRadius() + 2) return null;
    const groups = openGroups(expanded).sort((a, b) => depthOf(b) - depthOf(a));
    const near = groups.filter((id) => Math.abs(p.rad - ringRadius(depthOf(id))) <= ring() / 2 + 1);
    for (const id of [...near, ...groups]) {
      const kids = visible.filter((v) => v === id || v.startsWith(`${id}.`));
      const a0 = anim.get(kids[0]), a1 = anim.get(kids[kids.length - 1]);
      if (!a0 || !a1) continue;
      const from = a0.angle - slot, span = a1.angle + slot - from;
      let d = angleDelta(from, p.angle);
      if (d < 0) d += TAU;
      if (d <= span) return id;
    }
    return null;
  }

  function showHandleTip(id, mx, my) {
    const dark = isDark();
    const i = frame.spokes.findIndex((s) => s.id === id);
    const share = frame.focus[i] / rho;
    const reach = reachOf(frame.angles, rawOf(focus, frame.spokes), i, area()) / rho;
    tip.hidden = false;
    tip.innerHTML = `<strong style="color:${systemColor(focus, dark)}">${SYSTEMS[focus].label} · ${displayOf(id)}</strong>` +
      `<span class="radar-tiprow">${times(share)} an even spread of its volume — ` +
      `at most ${times(reach)}, by giving up every other axis</span>` +
      `<span class="radar-tiprow">${drag ? 'release to keep it' : 'drag along the spoke: the rest gives way'}</span>`;
    placeTip(mx, my);
  }
  function placeTip(mx, my) {
    const flip = mx > W * 0.55;
    tip.style.left = `${flip ? mx - 12 : mx + 12}px`;
    tip.style.top = `${Math.min(Math.max(my - 10, 4), H - 40)}px`;
    tip.style.transform = flip ? 'translateX(-100%)' : 'none';
  }

  function onMove(e) {
    const p = polar(e);
    if (drag) {
      const { spokes, angles } = frame;
      const i = spokes.findIndex((s) => s.id === drag.axis);
      if (i < 0) return;
      const raw = rawOf(focus, spokes);
      const next = solveSpoke(angles, raw, i, Math.max(p.rad, hubRadius() + 4), area(),
        { floor: hubRadius() + 4 });
      readings.set(focus, setReading(readings.get(focus), drag.axis, next[i]));
      drag.moved = true;
      render();
      syncInventory();
      showHandleTip(drag.axis, p.mx, p.my);
      return;
    }
    const h = handleAt(p);
    const grp = h ? null : groupAt(p);
    const id = h ? null : (grp || axisAt(p));
    const changed = id !== hover || h !== hoverHandle;
    hover = id; hoverHandle = h;
    if (changed) render();

    if (h) { canvas.style.cursor = 'grab'; showHandleTip(h, p.mx, p.my); return; }
    if (!id) { tip.hidden = true; canvas.style.cursor = 'default'; return; }
    canvas.style.cursor = 'pointer';
    const lineage = pathOf(id).map((a) => displayOf(a)).join(' › ');
    tip.hidden = false;
    tip.innerHTML = `<strong>${displayOf(id)}</strong>` +
      (blurbOf(id) ? `<em>${blurbOf(id)}</em>` : '') +
      `<span class="radar-tiprow">${lineage}</span>` +
      `<span class="radar-tiprow">${grp
        ? 'click to fold this family back'
        : canExpand(id)
          ? `click to split into ${codeOf(id)}.1 and ${codeOf(id)}.2`
          : `depth ${depthOf(id)} — as deep as the tree goes`}</span>`;
    placeTip(p.mx, p.my);
  }

  function onDown(e) {
    if (tw) return;
    const p = polar(e);
    const h = handleAt(p);
    if (!h) return;
    if (mo) { mo = null; mix = new Map([[focus, 1]]); }        // finish the morph first
    drag = { axis: h, moved: false };
    hoverHandle = h; hover = null;
    takeOver();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
    render();
  }

  function onUp(e) {
    if (!drag) return;
    const { axis, moved } = drag;
    drag = null;
    canvas.style.cursor = 'grab';
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    if (moved) {
      readings.set(focus, rescaleReadings(readings.get(focus), visible));  // same shape, tidy numbers
      say(`${SYSTEMS[focus].label} · ${displayOf(axis)} is now ${times(sharesNow().get(axis))} — ` +
        'and the other axes paid for it. Same volume. “copy readings” exports them.');
    }
    render();
    syncInventory();
  }

  function onClick(e) {
    if (swallowClick) return;
    const p = polar(e);
    if (handleAt(p)) return;                       // a handle is a grab, not a split
    const grp = groupAt(p);
    const id = grp || axisAt(p);
    if (!id) return;
    takeOver();
    if (grp) { collapse(grp); say(`Folded ${displayOf(grp)} back.`); return; }
    if (canExpand(id)) {
      expand(id);
      say(`${displayOf(id)} split into ${codeOf(id)}.1 and ${codeOf(id)}.2 — ` +
        'the volume keeps its size; drag a handle to argue where it sits.');
    } else {
      say(`${codeOf(id)} is as deep as the tree goes; raise MAX_DEPTH to go deeper.`);
    }
  }
  function onLeave() {
    if (drag) return;
    if (hover || hoverHandle) { hover = null; hoverHandle = null; render(); }
    tip.hidden = true;
  }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);

  async function onTool(e) {
    const btn = e.target.closest('[data-act]');
    const act = btn?.dataset.act;
    if (act === 'system') {
      takeOver();
      focusOn(btn.dataset.system, `${SYSTEMS[btn.dataset.system].full} — the same volume as every other system here.`);
    } else if (act === 'tour') setTour(!touring);
    else if (act === 'compare') {
      compare = !compare;
      syncSystems(); render();
      say(compare ? 'Every system at once: different shapes, one size.' : 'Back to one system at a time.');
    } else if (act === 'reset') { foldAll(); say('Back to the two qualities.'); }
    else if (act === 'copy') {
      const text = readingsBlock(Object.fromEntries(readings));
      try {
        await navigator.clipboard.writeText(text);
        slotEl.replaceChildren();
        say('Readings copied — paste over the scores in SYSTEMS, in autonomy-radar-data.js.');
      } catch {
        const ta = document.createElement('textarea');
        ta.className = 'rlmap-export';
        ta.value = text;
        ta.readOnly = true;
        slotEl.replaceChildren(ta);
        ta.select();
        say('Clipboard blocked — copy the text below by hand.');
      }
    }
  }
  el.querySelector('.radar').addEventListener('click', onTool);

  // ── boot ────────────────────────────────────────────────────────────────
  fit();
  relayout(false);
  syncSystems();
  syncNow();
  syncInventory();
  setTour(touring && !REDUCED());

  const ro = new ResizeObserver(() => { fit(); render(); });
  ro.observe(stage);
  const offTheme = Theme.onChange(() => { syncSystems(); syncNow(); syncInventory(); render(); });

  return () => {
    clearTimeout(tourTimer); clearTimeout(sayTimer);
    cancelAnimationFrame(raf);
    ro.disconnect(); offTheme();
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('click', onClick);
    el.querySelector('.radar')?.removeEventListener('click', onTool);
  };
}

window.Demos.register('autonomy-radar', mount);
