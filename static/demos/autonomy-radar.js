// autonomy-radar.js — the landing-page radar: two axes that split, and the
// methods placed against them.
//
// Two roots (Task Complexity, System Autonomy) sit on a radar. Click an axis
// and it splits into its two children: the spoke fans apart, every other spoke
// rotates to make room, and an arc appears outside the chart marking the family
// the two new axes came from. Color carries lineage — siblings share a hue that
// separates a little further at every level. Left alone, it splits and re-folds
// on its own.
//
// Over that sit the methods (VLA, RL): one silhouette each, with a draggable
// handle on every spoke. Drag a handle to move that method's reading on that
// axis — at whatever depth the wheel is currently split to, which is the whole
// point: a claim about Observability is a finer claim than one about Task
// Complexity, and the wheel lets you make either. `copy readings` exports the
// result back into autonomy-radar-data.js.
import {
  MAX_DEPTH, visibleAxes, openGroups, pathOf, depthOf, canExpand,
  codeOf, displayOf, labelOf, isNamed, blurbOf,
  angleFor, angleDelta, colorOf,
  METHOD_IDS, METHODS, readingOf, setReading, methodColor, readingsBlock,
} from '/static/demos/autonomy-radar-data.js';

const TWEEN = 900;              // ms for one split / fold
const BEAT = 1500;              // ms between automatic moves
const MAX_AXES = 10;            // how far the automatic cycle grows
const BAND_W = 7, BAND_GAP = 3; // lineage arcs outside the chart
const GRAB = 11;                // px around a handle that counts as grabbing it
const V_MIN = 0.06, V_MAX = 0.94; // keeps handles clear of the hub and the rim
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt = (v) => v.toFixed(2).replace(/^0/, '');
const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function mount(el, params, ctx) {
  const { Theme } = ctx;

  const expanded = new Set();
  const anim = new Map();          // id -> { angle, alpha, r }
  let visible = [];
  let slot = Math.PI / 2;          // half the angular gap between spokes
  let tw = null;                   // active tween
  let raf = 0, beat = 0;
  let hover = null;                // axis or lineage arc under the pointer
  let hoverHandle = null;          // { method, axis } under the pointer
  let drag = null;                 // { method, axis, moved }
  let swallowClick = false;        // a finished drag must not also split the axis
  const auto = { on: params.autoplay !== false, phase: 'grow' };

  // Readings are per-mount copies: dragging edits this wheel, not the module.
  const readings = new Map(METHOD_IDS.map((m) => [m, { ...METHODS[m].scores }]));
  const shown = new Set(params.methods || METHOD_IDS);

  el.classList.add('radar-host');
  el.innerHTML = `
    <div class="radar">
      <div class="rlmap-bar">
        <p class="rlmap-hint"></p>
        <div class="rlmap-tools">
          ${METHOD_IDS.map((m) => `<button type="button" class="ctl-btn radar-method"
            data-act="method" data-method="${m}"><span class="radar-swatch"></span>${METHODS[m].label}</button>`).join('')}
          <button type="button" class="ctl-btn" data-act="auto"></button>
          <button type="button" class="ctl-btn" data-act="reset">fold back</button>
          <button type="button" class="ctl-btn" data-act="copy">copy readings</button>
        </div>
      </div>
      <div class="radar-stage">
        <canvas></canvas>
        <div class="rlmap-tip" hidden></div>
      </div>
      <ul class="radar-inventory"></ul>
      <div class="rlmap-export-slot"></div>
      <p class="rlmap-status" role="status"></p>
    </div>`;

  const canvas = el.querySelector('canvas');
  const stage = el.querySelector('.radar-stage');
  const tip = el.querySelector('.rlmap-tip');
  const inventory = el.querySelector('.radar-inventory');
  const hint = el.querySelector('.rlmap-hint');
  const statusEl = el.querySelector('.rlmap-status');
  const slotEl = el.querySelector('.rlmap-export-slot');
  const g = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 120;

  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const serif = (size, style = '') =>
    `${style} ${size}px "Iowan Old Style", Palatino, Georgia, ui-serif, serif`.trim();
  const read = (m, id) => readingOf(readings.get(m), id);

  function fit() {
    const rect = stage.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    cx = W / 2; cy = H / 2;
    R = Math.max(70, Math.min(W * 0.5 - 172, H * 0.5 - 66));
  }

  // ── layout ──────────────────────────────────────────────────────────────
  function seed(id, target) {
    for (const anc of pathOf(id).slice(0, -1).reverse()) {           // splitting
      if (anim.has(anc)) return { angle: anim.get(anc).angle, alpha: 0, r: 0.3 };
    }
    for (const [other, v] of anim) {                                  // folding back
      if (other.startsWith(`${id}.`)) return { angle: v.angle, alpha: 0, r: 0.55 };
    }
    return { angle: target, alpha: 0, r: 0.3 };
  }

  function relayout(animate = true) {
    const next = visibleAxes(expanded);
    const targets = new Map(next.map((id, i) => [id, angleFor(i, next.length)]));
    const from = new Map(), to = new Map();

    for (const id of next) {
      const cur = anim.get(id) || seed(id, targets.get(id));
      anim.set(id, cur);
      from.set(id, { ...cur });
      to.set(id, { angle: cur.angle + angleDelta(cur.angle, targets.get(id)), alpha: 1, r: 1 });
    }
    for (const [id, cur] of anim) {
      if (targets.has(id)) continue;                                  // leaving
      const anc = pathOf(id).slice(0, -1).reverse().find((a) => targets.has(a));
      const aim = anc ? targets.get(anc) : cur.angle;
      from.set(id, { ...cur });
      to.set(id, { angle: cur.angle + angleDelta(cur.angle, aim), alpha: 0, r: 0.75 });
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
    const step = (now) => {
      raf = 0;
      if (!tw) { render(); return; }
      const k = ease(Math.min(1, (now - tw.t0) / TWEEN));
      for (const [id, f] of tw.from) {
        const t = tw.to.get(id);
        anim.set(id, {
          angle: lerp(f.angle, t.angle, k),
          alpha: lerp(f.alpha, t.alpha, k),
          r: lerp(f.r, t.r, k),
        });
      }
      slot = lerp(tw.slotFrom, tw.slotTo, k);
      render();
      if (k >= 1) {
        for (const id of [...anim.keys()]) if (!tw.targets.has(id)) anim.delete(id);
        tw = null;
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // ── drawing ─────────────────────────────────────────────────────────────
  const at = (angle, rad) => [cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad];
  const bandRadius = (depth) => R + 10 + (depth - 1) * (BAND_W + BAND_GAP);
  const openDepth = () => openGroups(expanded).reduce((m, id) => Math.max(m, depthOf(id)), 0);
  const labelRadius = () => bandRadius(Math.max(openDepth(), 1)) + BAND_W + 10;

  /** Where a method's handle sits on a spoke, in canvas pixels. */
  function handlePos(m, id) {
    const a = anim.get(id);
    if (!a) return null;
    return at(a.angle, R * read(m, id) * a.r);
  }

  function render() {
    const t = Theme.tokens();
    const dark = isDark();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // rings
    g.strokeStyle = t.rule;
    g.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      g.globalAlpha = i === 4 ? 0.9 : 0.4;
      g.beginPath(); g.arc(cx, cy, (R * i) / 4, 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;

    // Lineage arcs: one ring per level, spanning the family's spokes. The span
    // comes from the live gap to the neighbouring family, not from the slot
    // width, so a new family's arc opens out of its parent spoke instead of
    // snapping to full width the moment the split starts.
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
      g.globalAlpha = 0.5 * fade;
      g.lineWidth = BAND_W;
      g.beginPath();
      g.arc(cx, cy, bandRadius(depthOf(id)), a0.angle - before * 0.9, a1.angle + after * 0.9);
      g.stroke();
      g.globalAlpha = 1;
    }
    g.lineCap = 'round';

    // spokes
    for (const id of [...anim.keys()].sort((a, b) => (a === hover ? 1 : b === hover ? -1 : 0))) {
      const a = anim.get(id);
      if (a.alpha <= 0.01) continue;
      const on = id === hover;
      const col = colorOf(id, dark);
      g.globalAlpha = a.alpha;
      g.strokeStyle = col;
      g.lineWidth = on ? 3 : 1.75;
      g.beginPath();
      const [x0, y0] = at(a.angle, R * 0.06);
      const [x1, y1] = at(a.angle, R * a.r);
      g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();

      // the split affordance sits at the end of the spoke
      const [bx, by] = at(a.angle, R * a.r);
      g.beginPath(); g.arc(bx, by, on ? 7 : 5.5, 0, Math.PI * 2);
      g.fillStyle = t.bg; g.fill();
      g.lineWidth = on ? 2 : 1.4; g.stroke();
      if (canExpand(id)) {
        g.globalAlpha = a.alpha * (on ? 1 : 0.6);
        g.lineWidth = on ? 1.8 : 1.3;
        g.beginPath();
        g.moveTo(bx - 3, by); g.lineTo(bx + 3, by);
        g.moveTo(bx, by - 3); g.lineTo(bx, by + 3);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    // method silhouettes, then their handles on top of every spoke
    for (const m of METHOD_IDS) {
      if (!shown.has(m) || visible.length < 3) continue;
      const col = methodColor(m, dark);
      const live = drag?.method === m;
      g.beginPath();
      visible.forEach((id, i) => {
        const [x, y] = handlePos(m, id);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.closePath();
      g.fillStyle = col; g.globalAlpha = live ? 0.16 : 0.10; g.fill();
      g.globalAlpha = live ? 0.95 : 0.7;
      g.strokeStyle = col; g.lineWidth = live ? 2.4 : 1.8;
      g.stroke();
      g.globalAlpha = 1;
    }
    for (const m of METHOD_IDS) {
      if (!shown.has(m)) continue;
      const col = methodColor(m, dark);
      for (const id of visible) {
        const a = anim.get(id);
        if (!a || a.alpha <= 0.02) continue;
        const [x, y] = handlePos(m, id);
        const on = (drag && drag.method === m && drag.axis === id)
          || (hoverHandle?.method === m && hoverHandle.axis === id);
        g.globalAlpha = a.alpha;
        g.beginPath(); g.arc(x, y, on ? 6.5 : 4.5, 0, Math.PI * 2);
        g.fillStyle = on ? col : t.bg; g.fill();
        g.strokeStyle = col; g.lineWidth = on ? 2 : 1.6; g.stroke();
        g.globalAlpha = 1;
      }
    }

    // labels
    const LR = labelRadius();
    for (const id of [...anim.keys()]) {
      const a = anim.get(id);
      if (a.alpha <= 0.02) continue;
      const named = isNamed(id);
      const on = id === hover;
      g.font = serif(named ? (on ? 14 : 13) : (on ? 12 : 11.5), named ? '' : 'italic');
      g.fillStyle = colorOf(id, dark);
      g.globalAlpha = a.alpha * (named ? 1 : 0.85);
      const [lx, ly] = at(a.angle, LR);
      const c = Math.cos(a.angle);
      g.textAlign = c > 0.25 ? 'left' : c < -0.25 ? 'right' : 'center';
      g.textBaseline = Math.abs(c) > 0.25 ? 'middle'
        : Math.sin(a.angle) > 0 ? 'top' : 'bottom';
      g.fillText(displayOf(id), lx, ly);
      if (named && depthOf(id) > 1) {
        g.font = serif(10);
        g.globalAlpha = a.alpha * 0.6;
        g.fillText(codeOf(id), lx, ly + (Math.sin(a.angle) > 0 ? 15 : -15));
      }
      g.globalAlpha = 1;
    }
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

  function autoStep() {
    const vis = visibleAxes(expanded);
    const growable = vis.filter(canExpand);
    if (auto.phase === 'grow' && vis.length < MAX_AXES && growable.length) {
      const shallowest = Math.min(...growable.map(depthOf));
      const pool = growable.filter((id) => depthOf(id) === shallowest);
      expand(pool[Math.floor(Math.random() * pool.length)]);
      if (visibleAxes(expanded).length >= MAX_AXES) auto.phase = 'fold';
    } else {
      auto.phase = 'fold';
      const open = openGroups(expanded);
      if (!open.length) { auto.phase = 'grow'; return; }
      collapse(open[open.length - 1]);                // deepest family folds first
      if (!openGroups(expanded).length) auto.phase = 'grow';
    }
  }

  function scheduleAuto() {
    clearTimeout(beat);
    if (!auto.on) return;
    beat = setTimeout(() => {
      // never stack a move on an unfinished one — a backgrounded tab stops
      // producing frames, and the queue would otherwise pile up invisibly
      if (!tw && !drag) autoStep();
      scheduleAuto();
    }, BEAT + TWEEN * 0.2);
  }
  function setAuto(on, why = '') {
    auto.on = on;
    el.querySelector('[data-act="auto"]').textContent = on ? 'auto-split: on' : 'auto-split: off';
    el.querySelector('[data-act="auto"]').classList.toggle('is-on', on);
    hint.textContent = on
      ? 'Splitting on its own — click any axis to take over.'
      : 'Click an axis to split it, its arc to fold it back; drag a handle to move a reading.';
    if (why) say(why);
    scheduleAuto();
  }

  let sayTimer = 0;
  function say(msg) {
    statusEl.textContent = msg;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { statusEl.textContent = ''; }, 6000);
  }

  // ── the axis inventory: every visible axis, with each method's reading ────
  function syncInventory() {
    const dark = isDark();
    inventory.replaceChildren(...visible.map((id) => {
      const li = document.createElement('li');
      li.className = 'radar-chip' + (isNamed(id) ? ' is-named' : '');
      li.dataset.axis = id;
      li.innerHTML = `<span class="radar-dot" style="background:${colorOf(id, dark)}"></span>` +
        `<span class="radar-code">${codeOf(id)}</span>` +
        `<span class="radar-name">${labelOf(id) || '—'}</span>` +
        METHOD_IDS.filter((m) => shown.has(m)).map((m) =>
          `<span class="radar-read" style="color:${methodColor(m, dark)}"
            title="${METHODS[m].label}">${fmt(read(m, id))}</span>`).join('');
      return li;
    }));
  }

  function syncMethodButtons() {
    const dark = isDark();
    for (const btn of el.querySelectorAll('[data-act="method"]')) {
      const m = btn.dataset.method;
      btn.classList.toggle('is-on', shown.has(m));
      btn.querySelector('.radar-swatch').style.background = methodColor(m, dark);
      btn.setAttribute('aria-pressed', String(shown.has(m)));
    }
  }

  // ── pointer ─────────────────────────────────────────────────────────────
  function local(e) {
    const rect = canvas.getBoundingClientRect();
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  }
  function polar(e) {
    const { mx, my } = local(e);
    const dx = mx - cx, dy = my - cy;
    return { angle: Math.atan2(dy, dx), rad: Math.hypot(dx, dy), mx, my };
  }
  function handleAt(p) {
    let best = null, bd = GRAB;
    for (const m of METHOD_IDS) {
      if (!shown.has(m)) continue;
      for (const id of visible) {
        const pos = handlePos(m, id);
        if (!pos) continue;
        const d = Math.hypot(pos[0] - p.mx, pos[1] - p.my);
        if (d < bd) { bd = d; best = { method: m, axis: id }; }
      }
    }
    return best;
  }
  function axisAt(p) {
    if (p.rad > labelRadius() + 46) return null;
    let best = null, bd = Infinity;
    for (const id of visible) {
      const a = anim.get(id);
      if (!a) continue;
      const d = Math.abs(angleDelta(a.angle, p.angle));
      if (d < bd) { bd = d; best = id; }
    }
    return bd <= slot ? best : null;
  }
  function groupAt(p) {
    for (const id of openGroups(expanded)) {
      const rad = bandRadius(depthOf(id));
      if (Math.abs(p.rad - rad) > BAND_W) continue;
      const kids = visible.filter((v) => v === id || v.startsWith(`${id}.`));
      const a0 = anim.get(kids[0]), a1 = anim.get(kids[kids.length - 1]);
      if (!a0 || !a1) continue;
      const from = a0.angle - slot, span = a1.angle + slot - from;
      let d = angleDelta(from, p.angle);
      if (d < 0) d += 2 * Math.PI;
      if (d <= span) return id;
    }
    return null;
  }

  function showHandleTip(h, mx, my) {
    const { method, axis } = h;
    const dark = isDark();
    tip.hidden = false;
    tip.innerHTML = `<strong style="color:${methodColor(method, dark)}">${METHODS[method].label} · ${displayOf(axis)}</strong>` +
      `<span class="rlmap-tiprow"><span>reading</span>` +
      `<span class="rlmap-bar-track"><span class="rlmap-bar-fill" style="width:${(read(method, axis) * 100).toFixed(0)}%;background:${methodColor(method, dark)}"></span></span>` +
      `<span class="rlmap-tipnum">${fmt(read(method, axis))}</span></span>` +
      `<span class="radar-tiprow">${drag ? 'release to keep it' : 'drag along the spoke to move it'}</span>`;
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
      const v = clamp(p.rad / Math.max(R, 1), V_MIN, V_MAX);
      readings.set(drag.method, setReading(readings.get(drag.method), drag.axis, v));
      drag.moved = true;
      syncInventory();
      showHandleTip(drag, p.mx, p.my);
      render();
      return;
    }
    const h = handleAt(p);
    const grp = h ? null : groupAt(p);
    const id = h ? null : (grp || axisAt(p));
    const changed = id !== hover
      || h?.method !== hoverHandle?.method || h?.axis !== hoverHandle?.axis;
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
    const p = polar(e);
    const h = handleAt(p);
    if (!h) return;
    drag = { ...h, moved: false };
    hoverHandle = h; hover = null;
    if (auto.on) setAuto(false, 'Auto-split paused — you have the wheel.');
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
    render();
  }

  function onUp(e) {
    if (!drag) return;
    const { method, axis, moved } = drag;
    drag = null;
    canvas.style.cursor = 'grab';
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    if (moved) {
      say(`${METHODS[method].label} · ${displayOf(axis)} = ${fmt(read(method, axis))}` +
        ' — readings below it now follow this one. “copy readings” exports them all.');
    }
    render();
  }

  function onClick(e) {
    if (swallowClick) return;
    const p = polar(e);
    if (handleAt(p)) return;                       // a handle is a grab, not a split
    const grp = groupAt(p);
    const id = grp || axisAt(p);
    if (!id) return;
    if (auto.on) setAuto(false, 'Auto-split paused — you have the wheel.');
    if (grp) { collapse(grp); say(`Folded ${displayOf(grp)} back.`); return; }
    if (canExpand(id)) {
      expand(id);
      say(`${displayOf(id)} split into ${codeOf(id)}.1 and ${codeOf(id)}.2 — ` +
        'each method keeps its reading until you drag one.');
    } else {
      say(`${codeOf(id)} is at depth ${MAX_DEPTH}; raise MAX_DEPTH to go deeper.`);
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

  el.querySelector('.rlmap-tools').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    const act = btn?.dataset.act;
    if (act === 'method') {
      const m = btn.dataset.method;
      shown.has(m) ? shown.delete(m) : shown.add(m);
      syncMethodButtons(); syncInventory(); render();
      say(shown.has(m) ? `${METHODS[m].full} shown.` : `${METHODS[m].label} hidden.`);
    } else if (act === 'auto') setAuto(!auto.on);
    else if (act === 'reset') { foldAll(); say('Back to the two qualities.'); }
    else if (act === 'copy') {
      const text = readingsBlock(Object.fromEntries(readings));
      try {
        await navigator.clipboard.writeText(text);
        slotEl.replaceChildren();
        say('Readings copied — paste over METHODS in autonomy-radar-data.js.');
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
  });

  // ── boot ────────────────────────────────────────────────────────────────
  fit();
  relayout(false);
  syncMethodButtons();
  setAuto(auto.on);

  const ro = new ResizeObserver(() => { fit(); render(); });
  ro.observe(stage);
  const offTheme = Theme.onChange(() => { syncMethodButtons(); syncInventory(); render(); });

  return () => {
    clearTimeout(beat); clearTimeout(sayTimer);
    cancelAnimationFrame(raf);
    ro.disconnect(); offTheme();
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('click', onClick);
  };
}

window.Demos.register('autonomy-radar', mount);
