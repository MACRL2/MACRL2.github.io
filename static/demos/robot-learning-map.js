// robot-learning-map.js — an interactive map of the state of robot learning.
//
// The plot opens on two headline axes, Manual Supervision × Task Complexity.
// Click either axis name and it unfolds: the headline axis is a projection of
// two children, and a mix slider rotates that projection while the systems
// slide. Keep unfolding (Task Complexity → Embodiment Complexity →
// |Observation| / |Action|) to reach the five atomic axes every placement is
// actually scored on. All data + math lives in the pure sibling module.
import {
  AXIS_TREE, LEAVES, ROOTS, GROUPS, SYSTEMS,
  defaultWeights, coeffs, project, spread, backProject, pathTo,
} from '/static/demos/robot-learning-map-data.js';

const PAD = { l: 30, r: 22, t: 20, b: 30 };          // css px, inside the canvas
const R = 5.5;                                        // marker radius, css px
const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (v) => v.toFixed(2);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function mount(el, params, ctx) {
  const { Theme } = ctx;

  // ── state ───────────────────────────────────────────────────────────────
  const systems = SYSTEMS.map((s) => ({ ...s }));
  const st = {
    weights: defaultWeights(),
    node: { x: ROOTS.x, y: ROOTS.y },
    open: null,            // 'x' | 'y' | null — which axis panel is unfolded
    hover: null,           // system id
    focusGroup: null,      // legend filter
    place: false,          // drag-to-place mode
  };
  const cur = { x: coeffs(st.node.x, st.weights), y: coeffs(st.node.y, st.weights) };

  // ── scaffolding ─────────────────────────────────────────────────────────
  el.classList.add('rlmap-host');
  el.innerHTML = `
    <div class="rlmap">
      <div class="rlmap-bar">
        <p class="rlmap-hint">Click an axis name to unfold it.</p>
        <div class="rlmap-tools">
          <button type="button" class="ctl-btn" data-act="place">place mode</button>
          <button type="button" class="ctl-btn" data-act="copy">copy coordinates</button>
          <button type="button" class="ctl-btn" data-act="reset">reset</button>
        </div>
      </div>
      <div class="rlmap-frame">
        <button type="button" class="rlmap-axisbtn rlmap-axisbtn-y" data-axis="y"></button>
        <div class="rlmap-stage">
          <canvas></canvas>
          <div class="rlmap-tip" hidden></div>
        </div>
        <button type="button" class="rlmap-axisbtn rlmap-axisbtn-x" data-axis="x"></button>
      </div>
      <div class="rlmap-panels"></div>
      <div class="rlmap-export-slot"></div>
      <ul class="rlmap-legend"></ul>
      <p class="rlmap-status" role="status"></p>
    </div>`;

  const canvas = el.querySelector('canvas');
  const stage = el.querySelector('.rlmap-stage');
  const tip = el.querySelector('.rlmap-tip');
  const panels = el.querySelector('.rlmap-panels');
  const slot = el.querySelector('.rlmap-export-slot');
  const statusEl = el.querySelector('.rlmap-status');
  const g = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;

  function fit() {
    const r = stage.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  const px = { x0: 0, x1: 0, y0: 0, y1: 0 };
  const X = (v) => px.x0 + v * (px.x1 - px.x0);
  const Y = (v) => px.y0 + v * (px.y1 - px.y0);
  const vx = (p) => (p - px.x0) / (px.x1 - px.x0);
  const vy = (p) => (p - px.y0) / (px.y1 - px.y0);

  // ── drawing ─────────────────────────────────────────────────────────────
  function shapePath(c, shape, x, y, r) {
    c.beginPath();
    if (shape === 'square') { c.rect(x - r, y - r, 2 * r, 2 * r); return; }
    if (shape === 'triangle') {
      c.moveTo(x, y - r * 1.2); c.lineTo(x + r * 1.1, y + r * 0.9);
      c.lineTo(x - r * 1.1, y + r * 0.9); c.closePath(); return;
    }
    if (shape === 'diamond') {
      c.moveTo(x, y - r * 1.25); c.lineTo(x + r * 1.1, y);
      c.lineTo(x, y + r * 1.25); c.lineTo(x - r * 1.1, y); c.closePath(); return;
    }
    if (shape === 'star') {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.5 : r * 1.35;
        const fx = x + Math.cos(a) * rr, fy = y + Math.sin(a) * rr;
        i ? c.lineTo(fx, fy) : c.moveTo(fx, fy);
      }
      c.closePath(); return;
    }
    c.arc(x, y, r, 0, Math.PI * 2);
  }

  const shapeOf = (id) => (GROUPS.find((q) => q.id === id) || GROUPS[0]).shape;
  const serif = (size, style = '') =>
    `${style} ${size}px "Iowan Old Style", Palatino, Georgia, ui-serif, serif`.trim();

  function render() {
    const t = Theme.tokens();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    px.x0 = PAD.l; px.x1 = W - PAD.r; px.y0 = H - PAD.b; px.y1 = PAD.t;

    // grid
    g.lineWidth = 1;
    g.strokeStyle = t.rule;
    for (let i = 0; i <= 4; i++) {
      const f = i / 4;
      g.globalAlpha = i === 0 || i === 4 ? 0.9 : 0.38;
      g.beginPath(); g.moveTo(X(f), Y(0)); g.lineTo(X(f), Y(1)); g.stroke();
      g.beginPath(); g.moveTo(X(0), Y(f)); g.lineTo(X(1), Y(f)); g.stroke();
    }
    g.globalAlpha = 1;

    // end words
    g.fillStyle = t.faint;
    g.font = serif(10);
    g.textBaseline = 'top'; g.textAlign = 'left';
    g.fillText('less', X(0) + 3, Y(0) + 7);
    g.textAlign = 'right';
    g.fillText('more', X(1) - 3, Y(0) + 7);
    g.save();
    g.translate(X(0) - 8, Y(0));
    g.rotate(-Math.PI / 2);
    g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText('less', 3, 0);
    g.textAlign = 'right';
    g.fillText('more', Y(0) - Y(1) - 3, 0);
    g.restore();

    // projection whiskers for the unfolded axis: the interval this axis hides
    if (st.open) {
      const axis = st.open;
      g.strokeStyle = t.faint;
      g.lineWidth = 1;
      for (const s of systems) {
        if (dimmed(s)) continue;
        const [lo, hi] = spread(s, st.node[axis]);
        if (hi - lo < 0.004) continue;
        const cxv = project(s, cur.x), cyv = project(s, cur.y);
        g.globalAlpha = 0.5;
        g.beginPath();
        if (axis === 'x') {
          g.moveTo(X(lo), Y(cyv)); g.lineTo(X(hi), Y(cyv));
          g.moveTo(X(lo), Y(cyv) - 3); g.lineTo(X(lo), Y(cyv) + 3);
          g.moveTo(X(hi), Y(cyv) - 3); g.lineTo(X(hi), Y(cyv) + 3);
        } else {
          g.moveTo(X(cxv), Y(lo)); g.lineTo(X(cxv), Y(hi));
          g.moveTo(X(cxv) - 3, Y(lo)); g.lineTo(X(cxv) + 3, Y(lo));
          g.moveTo(X(cxv) - 3, Y(hi)); g.lineTo(X(cxv) + 3, Y(hi));
        }
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    // the aspiration, drawn only while both headline axes are in view
    if (st.node.x === ROOTS.x && st.node.y === ROOTS.y) {
      g.fillStyle = t.faint;
      g.font = serif(11, 'italic');
      g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText('↖ harder tasks, less human effort', X(0) + 10, Y(1) + 8);
      g.fillText('the corner everyone claims to be moving toward', X(0) + 10, Y(1) + 24);
    }

    // markers, then labels: labels take the first free slot around their marker
    const pts = systems.map((s) => ({
      s,
      x: X(project(s, cur.x)),
      y: Y(project(s, cur.y)),
      faded: dimmed(s),
      on: s.id === st.hover,
    }));
    const taken = pts.map((p) => ({ x0: p.x - R - 2, y0: p.y - R - 2, x1: p.x + R + 2, y1: p.y + R + 2 }));
    const free = (r) => r.x0 > X(0) + 2 && r.x1 < X(1) - 2 && r.y0 > Y(1) + 2 && r.y1 < Y(0) - 2
      && !taken.some((b) => !(r.x1 < b.x0 || r.x0 > b.x1 || r.y1 < b.y0 || r.y0 > b.y1));

    for (const p of pts.slice().sort((a, b) => a.on - b.on)) {
      g.globalAlpha = p.faded ? 0.22 : 1;
      shapePath(g, shapeOf(p.s.group), p.x, p.y, p.on ? R * 1.25 : R);
      g.fillStyle = p.on ? t.accent : t.bg;
      g.fill();
      g.strokeStyle = p.on ? t.accent : t.fg;
      g.lineWidth = p.on ? 2 : 1.25;
      g.stroke();
      g.globalAlpha = 1;
    }

    for (const p of pts.slice().sort((a, b) => b.on - a.on)) {
      if (p.faded) continue;
      g.font = serif(p.on ? 12 : 11);
      const w = g.measureText(p.s.label).width;
      const h = p.on ? 13 : 12;
      const side = [
        { x: p.x + R + 5, y: p.y, align: 'left', base: 'middle' },
        { x: p.x - R - 5, y: p.y, align: 'right', base: 'middle' },
      ];
      const stack = [
        { x: p.x, y: p.y - R - 4, align: 'center', base: 'bottom' },
        { x: p.x, y: p.y + R + 4, align: 'center', base: 'top' },
        { x: p.x + R + 4, y: p.y - R - 3, align: 'left', base: 'bottom' },
        { x: p.x - R - 4, y: p.y + R + 3, align: 'right', base: 'top' },
      ];
      // whiskers run along the unfolded axis, so put labels across it
      const cands = st.open === 'x' ? [...stack, ...side]
        : st.open === 'y' ? [...side, ...stack]
          : [...side, ...stack];
      const boxOf = (c) => {
        const b = {
          x0: c.align === 'left' ? c.x - 2 : c.align === 'right' ? c.x - w - 2 : c.x - w / 2 - 2,
          x1: c.align === 'left' ? c.x + w + 2 : c.align === 'right' ? c.x + 2 : c.x + w / 2 + 2,
          y0: c.base === 'bottom' ? c.y - h : c.base === 'top' ? c.y : c.y - h / 2,
          y1: c.base === 'bottom' ? c.y : c.base === 'top' ? c.y + h : c.y + h / 2,
        };
        // near an edge, slide the label back inside rather than dropping it
        const dx = Math.max(0, X(0) + 3 - b.x0) - Math.max(0, b.x1 - (X(1) - 3));
        b.x0 += dx; b.x1 += dx;
        return { box: b, x: c.x + dx };
      };
      const pick = cands.map((c) => ({ c, ...boxOf(c) })).find((o) => free(o.box));
      if (!pick && !p.on) continue;                       // crowded: the tooltip has it
      const c = pick ? { ...pick.c, x: pick.x } : cands[0];
      g.fillStyle = p.on ? t.accent : t.muted;
      g.textAlign = c.align; g.textBaseline = c.base;
      g.fillText(p.s.label, c.x, c.y + (c.base === 'middle' ? 0.5 : 0));
      taken.push(boxOf(c).box);
    }
  }

  const dimmed = (s) => !!st.focusGroup && s.group !== st.focusGroup;

  // ── axis navigation + the projection tween ──────────────────────────────
  let raf = 0;
  function retarget(animate = true) {
    const to = { x: coeffs(st.node.x, st.weights), y: coeffs(st.node.y, st.weights) };
    if (!animate || REDUCED()) {
      Object.assign(cur, to);
      render();
      return;
    }
    const from = { x: { ...cur.x }, y: { ...cur.y } };
    const t0 = performance.now(), dur = 420;
    cancelAnimationFrame(raf);
    const step = (now) => {
      const k = ease(Math.min(1, (now - t0) / dur));
      for (const a of ['x', 'y']) for (const l of LEAVES) cur[a][l] = lerp(from[a][l], to[a][l], k);
      render();
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function setNode(axis, id, { animate = true } = {}) {
    st.node[axis] = id;
    st.open = axis;
    syncAxes(); syncPanels();
    retarget(animate);
  }

  function sweep(axis) {
    const id = st.node[axis];
    if (!AXIS_TREE[id]?.children) return;
    if (REDUCED()) { st.weights[id] = 0.5; retarget(false); syncPanels(); return; }
    const t0 = performance.now(), dur = 2600;
    cancelAnimationFrame(raf);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      // 0.5 → 0 → 1 → 0.5, so both children get their turn as the axis
      const w = k < 0.25 ? lerp(0.5, 0, k / 0.25)
        : k < 0.75 ? lerp(0, 1, (k - 0.25) / 0.5)
          : lerp(1, 0.5, (k - 0.75) / 0.25);
      st.weights[id] = w;
      Object.assign(cur, { x: coeffs(st.node.x, st.weights), y: coeffs(st.node.y, st.weights) });
      syncMix(axis);
      render();
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // ── axis buttons ────────────────────────────────────────────────────────
  const axisBtns = { x: el.querySelector('[data-axis="x"]'), y: el.querySelector('[data-axis="y"]') };
  function syncAxes() {
    for (const axis of ['x', 'y']) {
      const path = pathTo(st.node[axis], ROOTS[axis]) || [st.node[axis]];
      const trail = path.slice(0, -1).map((id) => AXIS_TREE[id].short).join(' › ');
      const node = AXIS_TREE[st.node[axis]];
      axisBtns[axis].innerHTML =
        `${trail ? `<span class="rlmap-trail">${trail} ›</span> ` : ''}` +
        `<span class="rlmap-axisname">${node.label}</span>` +
        `<span class="rlmap-caret">${st.open === axis ? '▾' : node.children ? '▸' : '·'}</span>`;
      axisBtns[axis].setAttribute('aria-expanded', String(st.open === axis));
      axisBtns[axis].title = node.blurb;
    }
  }

  // ── decomposition panel ─────────────────────────────────────────────────
  function syncMix(axis) {
    const slider = panels.querySelector(`[data-mix="${axis}"]`);
    if (!slider) return;
    const id = st.node[axis];
    slider.value = String(st.weights[id]);
    const out = panels.querySelector(`[data-readout="${axis}"]`);
    if (out) {
      const n = AXIS_TREE[id], w = st.weights[id];
      out.innerHTML = `<strong>${n.label}</strong> = ${fmt(1 - w)} · ${AXIS_TREE[n.children[0]].label}` +
        ` + ${fmt(w)} · ${AXIS_TREE[n.children[1]].label}`;
    }
  }

  function syncPanels() {
    panels.replaceChildren();
    if (!st.open) return;
    const axis = st.open;
    const id = st.node[axis];
    const node = AXIS_TREE[id];
    const path = pathTo(id, ROOTS[axis]) || [id];
    const parent = path.length > 1 ? path[path.length - 2] : null;
    const wrap = document.createElement('div');
    wrap.className = 'rlmap-panel';
    wrap.innerHTML = `
      <div class="rlmap-panel-head">
        <span class="rlmap-eyebrow">${axis} axis</span>
        <strong>${node.label}</strong>
        <span class="rlmap-blurb">${node.blurb}</span>
        <button type="button" class="rlmap-close" data-act="close" aria-label="close">×</button>
      </div>
      ${node.children ? `
      <div class="rlmap-split">
        <button type="button" class="rlmap-child" data-child="${node.children[0]}">${AXIS_TREE[node.children[0]].label}</button>
        <input type="range" min="0" max="1" step="0.01" data-mix="${axis}" aria-label="mix between ${AXIS_TREE[node.children[0]].label} and ${AXIS_TREE[node.children[1]].label}">
        <button type="button" class="rlmap-child" data-child="${node.children[1]}">${AXIS_TREE[node.children[1]].label}</button>
      </div>
      <p class="rlmap-readout" data-readout="${axis}"></p>
      <p class="rlmap-note">Two orthogonal things share one axis. Drag the slider — or
        <button type="button" class="rlmap-link" data-act="sweep">sweep the projection</button> —
        and the whiskers show how far each system slides. Click a child name to make it the axis.</p>
      ` : `
      <p class="rlmap-note">An atomic axis: nothing left to unfold. ${parent
        ? `<button type="button" class="rlmap-link" data-act="up">← back to ${AXIS_TREE[parent].label}</button>` : ''}</p>
      `}
      ${node.children && parent ? `<p class="rlmap-note"><button type="button" class="rlmap-link" data-act="up">← back to ${AXIS_TREE[parent].label}</button></p>` : ''}`;
    panels.append(wrap);
    syncMix(axis);

    wrap.addEventListener('input', (e) => {
      if (e.target.matches('[data-mix]')) {
        st.weights[id] = +e.target.value;
        Object.assign(cur, { x: coeffs(st.node.x, st.weights), y: coeffs(st.node.y, st.weights) });
        syncMix(axis); render();
      }
    });
    wrap.addEventListener('click', (e) => {
      const child = e.target.closest('[data-child]');
      if (child) { setNode(axis, child.dataset.child); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') { st.open = null; syncAxes(); syncPanels(); render(); }
      else if (act === 'up') setNode(axis, parent);
      else if (act === 'sweep') sweep(axis);
    });
  }

  for (const axis of ['x', 'y']) {
    axisBtns[axis].addEventListener('click', () => {
      st.open = st.open === axis ? null : axis;
      syncAxes(); syncPanels(); render();
    });
  }

  // ── legend ──────────────────────────────────────────────────────────────
  const legend = el.querySelector('.rlmap-legend');
  legend.innerHTML = GROUPS.map((q) => `
    <li><button type="button" class="rlmap-legend-btn" data-group="${q.id}">
      <canvas class="rlmap-swatch" width="18" height="18" data-shape="${q.shape}"></canvas>
      <span>${q.label}</span></button></li>`).join('');
  function paintSwatches() {
    const t = Theme.tokens();
    const d = window.devicePixelRatio || 1;
    legend.querySelectorAll('.rlmap-swatch').forEach((c) => {
      c.width = Math.round(18 * d); c.height = Math.round(18 * d);
      const gg = c.getContext('2d');
      gg.setTransform(d, 0, 0, d, 0, 0);
      gg.clearRect(0, 0, 18, 18);
      shapePath(gg, c.dataset.shape, 9, 9, 5);
      gg.fillStyle = t.bg; gg.fill();
      gg.strokeStyle = t.fg; gg.lineWidth = 1.25; gg.stroke();
    });
  }

  legend.addEventListener('click', (e) => {
    const b = e.target.closest('[data-group]');
    if (!b) return;
    st.focusGroup = st.focusGroup === b.dataset.group ? null : b.dataset.group;
    legend.querySelectorAll('[data-group]').forEach((n) =>
      n.classList.toggle('is-on', n.dataset.group === st.focusGroup));
    render();
  });

  // ── pointer: hover, tooltip, drag-to-place ──────────────────────────────
  let drag = null;
  const pickAt = (mx, my) => {
    let best = null, bd = 14 * 14;
    for (const s of systems) {
      if (dimmed(s)) continue;
      const dx = X(project(s, cur.x)) - mx, dy = Y(project(s, cur.y)) - my;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { mx: e.clientX - r.left, my: e.clientY - r.top };
  };

  function showTip(s, mx, my) {
    tip.hidden = false;
    tip.innerHTML = `<strong>${s.label}</strong>` +
      (s.note ? `<em>${s.note}</em>` : '') +
      LEAVES.map((l) => `<span class="rlmap-tiprow"><span>${AXIS_TREE[l].label}</span>
        <span class="rlmap-bar-track"><span class="rlmap-bar-fill" style="width:${(s[l] * 100).toFixed(0)}%"></span></span>
        <span class="rlmap-tipnum">${fmt(s[l])}</span></span>`).join('');
    const flipX = mx > W * 0.55;
    tip.style.left = `${flipX ? mx - 14 : mx + 14}px`;
    tip.style.top = `${Math.min(Math.max(my - 10, 4), H - 40)}px`;
    tip.style.transform = flipX ? 'translateX(-100%)' : 'none';
  }

  function onMove(e) {
    const { mx, my } = local(e);
    if (drag) {
      const s = drag.s;
      const dxv = vx(mx) - vx(drag.mx), dyv = vy(my) - vy(drag.my);
      Object.assign(s, backProject(s, cur.x, dxv), backProject(s, cur.y, dyv));
      drag.mx = mx; drag.my = my;
      drag.moved = true;
      showTip(s, mx, my);
      render();
      return;
    }
    const hit = pickAt(mx, my);
    const id = hit ? hit.id : null;
    if (id !== st.hover) { st.hover = id; render(); }
    if (hit) { showTip(hit, mx, my); canvas.style.cursor = st.place ? 'grab' : 'pointer'; }
    else { tip.hidden = true; canvas.style.cursor = st.place ? 'crosshair' : 'default'; }
  }

  function onDown(e) {
    if (!st.place) return;
    const { mx, my } = local(e);
    const s = pickAt(mx, my);
    if (!s) return;
    drag = { s, mx, my, moved: false };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  }
  function onUp(e) {
    if (drag) {
      if (drag.moved) say(`${drag.s.label} moved — “copy coordinates” exports every placement.`);
      drag = null;
      canvas.style.cursor = 'grab';
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    }
  }
  function onLeave() { if (!drag) { st.hover = null; tip.hidden = true; render(); } }

  function onDblClick(e) {
    if (!st.place) return;
    const { mx, my } = local(e);
    if (pickAt(mx, my)) return;
    const label = window.prompt('Name this system / method:');
    if (!label) return;
    const s = { id: `new-${Date.now()}`, label, group: GROUPS[0].id };
    for (const l of LEAVES) s[l] = 0.5;
    Object.assign(s, backProject(s, cur.x, vx(mx) - project(s, cur.x)));
    Object.assign(s, backProject(s, cur.y, vy(my) - project(s, cur.y)));
    systems.push(s);
    say(`Added “${label}”. Drag to adjust, then copy coordinates.`);
    render();
  }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('dblclick', onDblClick);

  // ── toolbar ─────────────────────────────────────────────────────────────
  let sayTimer = 0;
  function say(msg) {
    statusEl.textContent = msg;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { statusEl.textContent = ''; }, 6000);
  }
  function exportText() {
    const body = systems.map((s) => {
      const coords = LEAVES.map((l) => `${l}: ${s[l].toFixed(2)}`).join(', ');
      return `  { id: '${s.id}', label: ${JSON.stringify(s.label)}, group: '${s.group}',\n    ${coords}` +
        (s.note ? `,\n    note: ${JSON.stringify(s.note)} },` : ' },');
    }).join('\n');
    return `export const SYSTEMS = [\n${body}\n];\n`;
  }
  el.querySelector('.rlmap-tools').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'place') {
      st.place = !st.place;
      e.target.classList.toggle('is-on', st.place);
      e.target.textContent = st.place ? 'place mode: on' : 'place mode';
      canvas.style.cursor = st.place ? 'crosshair' : 'default';
      say(st.place
        ? 'Drag a system to move it; double-click empty space to add one.'
        : 'Place mode off.');
    } else if (act === 'copy') {
      const text = exportText();
      try {
        await navigator.clipboard.writeText(text);
        slot.replaceChildren();
        say('Coordinates copied — paste over SYSTEMS in robot-learning-map-data.js.');
      } catch {
        const ta = document.createElement('textarea');
        ta.className = 'rlmap-export';
        ta.value = text;
        ta.readOnly = true;
        slot.replaceChildren(ta);
        ta.select();
        say('Clipboard blocked — copy the text below by hand.');
      }
    } else if (act === 'reset') {
      systems.splice(0, systems.length, ...SYSTEMS.map((s) => ({ ...s })));
      st.weights = defaultWeights();
      st.node = { x: ROOTS.x, y: ROOTS.y };
      st.open = null; st.focusGroup = null;
      slot.replaceChildren();
      legend.querySelectorAll('[data-group]').forEach((n) => n.classList.remove('is-on'));
      syncAxes(); syncPanels(); retarget(false);
      say('Back to the opening view.');
    }
  });

  // ── boot ────────────────────────────────────────────────────────────────
  syncAxes(); syncPanels();
  fit(); paintSwatches(); render();

  const ro = new ResizeObserver(() => { fit(); render(); });
  ro.observe(stage);
  const offTheme = Theme.onChange(() => { paintSwatches(); render(); });

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(sayTimer);
    ro.disconnect();
    offTheme();
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('dblclick', onDblClick);
  };
}

window.Demos.register('robot-learning-map', mount);
