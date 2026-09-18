// autonomy-radar.js — the landing-page radar: two axes that split.
//
// Two roots (Task Complexity, System Autonomy) sit on a radar. Click an axis
// and it splits into its two children: the spoke fans apart, every other spoke
// rotates to make room, and an arc appears outside the chart marking the family
// the two new axes came from. Color carries lineage — siblings share a hue that
// separates a little further at every level. Left alone, it splits and re-folds
// on its own, forever, which is the point until the axes are named.
import {
  MAX_DEPTH, visibleAxes, openGroups, pathOf, depthOf, canExpand,
  codeOf, displayOf, labelOf, isNamed, blurbOf,
  angleFor, angleDelta, colorOf, sampleValue,
} from '/static/demos/autonomy-radar-data.js';

const TWEEN = 900;              // ms for one split / fold
const BEAT = 1500;              // ms between automatic moves
const MAX_AXES = 10;            // how far the automatic cycle grows
const BAND_W = 7, BAND_GAP = 3; // lineage arcs outside the chart
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function mount(el, params, ctx) {
  const { Theme } = ctx;

  const expanded = new Set();
  const anim = new Map();          // id -> { angle, alpha, r }
  let visible = [];
  let slot = Math.PI / 2;          // half the angular gap between spokes
  let tw = null;                   // active tween
  let raf = 0, beat = 0;
  let hover = null;
  const auto = { on: params.autoplay !== false, phase: 'grow' };
  let silhouette = false;

  el.classList.add('radar-host');
  el.innerHTML = `
    <div class="radar">
      <div class="rlmap-bar">
        <p class="rlmap-hint"></p>
        <div class="rlmap-tools">
          <button type="button" class="ctl-btn" data-act="auto"></button>
          <button type="button" class="ctl-btn" data-act="reset">fold back</button>
          <button type="button" class="ctl-btn" data-act="ghost">example silhouette</button>
        </div>
      </div>
      <div class="radar-stage">
        <canvas></canvas>
        <div class="rlmap-tip" hidden></div>
      </div>
      <ul class="radar-inventory"></ul>
      <p class="rlmap-status" role="status"></p>
    </div>`;

  const canvas = el.querySelector('canvas');
  const stage = el.querySelector('.radar-stage');
  const tip = el.querySelector('.rlmap-tip');
  const inventory = el.querySelector('.radar-inventory');
  const hint = el.querySelector('.rlmap-hint');
  const statusEl = el.querySelector('.rlmap-status');
  const g = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 120;

  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const serif = (size, style = '') =>
    `${style} ${size}px "Iowan Old Style", Palatino, Georgia, ui-serif, serif`.trim();

  function fit() {
    const rect = stage.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    cx = W / 2; cy = H / 2;
    R = Math.max(70, Math.min(W * 0.5 - 150, H * 0.5 - 66));
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

    // silhouette placeholder
    if (silhouette && visible.length > 2) {
      g.beginPath();
      visible.forEach((id, i) => {
        const a = anim.get(id);
        const [x, y] = at(a.angle, R * sampleValue(id) * a.r);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.closePath();
      g.fillStyle = t.accent; g.globalAlpha = 0.10; g.fill();
      g.globalAlpha = 0.55; g.strokeStyle = t.accent; g.lineWidth = 1.5; g.stroke();
      g.globalAlpha = 1;
    }

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
      if (!tw) autoStep();
      scheduleAuto();
    }, BEAT + TWEEN * 0.2);
  }
  function setAuto(on, why = '') {
    auto.on = on;
    el.querySelector('[data-act="auto"]').textContent = on ? 'auto-split: on' : 'auto-split: off';
    el.querySelector('[data-act="auto"]').classList.toggle('is-on', on);
    hint.textContent = on
      ? 'Splitting on its own — click any axis to take over.'
      : 'Click an axis to split it; click its lineage arc to fold it back.';
    if (why) say(why);
    scheduleAuto();
  }

  let sayTimer = 0;
  function say(msg) {
    statusEl.textContent = msg;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { statusEl.textContent = ''; }, 5000);
  }

  // ── the axis inventory, so unnamed axes can be named ─────────────────────
  function syncInventory() {
    const dark = isDark();
    inventory.replaceChildren(...visible.map((id) => {
      const li = document.createElement('li');
      li.className = 'radar-chip' + (isNamed(id) ? ' is-named' : '');
      li.dataset.axis = id;
      li.innerHTML = `<span class="radar-dot" style="background:${colorOf(id, dark)}"></span>` +
        `<span class="radar-code">${codeOf(id)}</span>` +
        `<span class="radar-name">${labelOf(id) || '—'}</span>`;
      return li;
    }));
  }

  // ── pointer ─────────────────────────────────────────────────────────────
  function polar(e) {
    const rect = canvas.getBoundingClientRect();
    const dx = e.clientX - rect.left - cx, dy = e.clientY - rect.top - cy;
    return { angle: Math.atan2(dy, dx), rad: Math.hypot(dx, dy) };
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

  function onMove(e) {
    const p = polar(e);
    const grp = groupAt(p);
    const id = grp || axisAt(p);
    if (id !== hover) { hover = id; render(); }
    if (!id) { tip.hidden = true; canvas.style.cursor = 'default'; return; }
    canvas.style.cursor = 'pointer';
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
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
    const flip = mx > W * 0.55;
    tip.style.left = `${flip ? mx - 12 : mx + 12}px`;
    tip.style.top = `${Math.min(Math.max(my - 10, 4), H - 40)}px`;
    tip.style.transform = flip ? 'translateX(-100%)' : 'none';
  }

  function onClick(e) {
    const p = polar(e);
    const grp = groupAt(p);
    const id = grp || axisAt(p);
    if (!id) return;
    if (auto.on) setAuto(false, 'Auto-split paused — you have the wheel.');
    if (grp) { collapse(grp); say(`Folded ${displayOf(grp)} back.`); return; }
    if (canExpand(id)) {
      expand(id);
      say(`${displayOf(id)} split into ${codeOf(id)}.1 and ${codeOf(id)}.2 — name them and they stick.`);
    } else {
      say(`${codeOf(id)} is at depth ${MAX_DEPTH}; raise MAX_DEPTH to go deeper.`);
    }
  }
  function onLeave() { if (hover) { hover = null; render(); } tip.hidden = true; }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);

  el.querySelector('.rlmap-tools').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'auto') setAuto(!auto.on);
    else if (act === 'reset') { foldAll(); say('Back to the two qualities.'); }
    else if (act === 'ghost') {
      silhouette = !silhouette;
      e.target.classList.toggle('is-on', silhouette);
      say(silhouette
        ? 'Placeholder shape only — problems and methods get placed once the axes are named.'
        : '');
      render();
    }
  });

  // ── boot ────────────────────────────────────────────────────────────────
  fit();
  relayout(false);
  setAuto(auto.on);

  const ro = new ResizeObserver(() => { fit(); render(); });
  ro.observe(stage);
  const offTheme = Theme.onChange(() => { syncInventory(); render(); });

  return () => {
    clearTimeout(beat); clearTimeout(sayTimer);
    cancelAnimationFrame(raf);
    ro.disconnect(); offTheme();
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('click', onClick);
  };
}

window.Demos.register('autonomy-radar', mount);
