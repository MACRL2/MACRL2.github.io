// simplex-intro.js — the home page's scroll-driven introduction to the simplex.
//
// The page supplies the slides (.simplex-step paragraphs inside the demo);
// this adds a sticky figure beside them and maps scroll position to a
// continuous stage t in [0, steps - 1].
//
// The first axis comes out of the page as a ray, with the point sitting on it.
// After that, axes are not added but splintered: a ray cracks into two rays
// that rotate out of it, the parent disappears, and the volume (its reach
// forward along each ray, from the point) grows a dimension — point,
// triangle, solid. A slide marked data-scatter (the first split) breaks the
// volume into the systems it stands for, each a volume of its own that
// reaches differently along each ray but has the same size. On the next
// slide (marked data-shift) each system's area shifts into the next one's
// shape, still keeping its size, and then they merge before moving on.

const HALF = 150;     // px from the point to each arrowhead
const RAY_BACK = 105; // px a ray runs behind the point, to its plain start
const HOLD = 0.12;    // viewport heights a slide holds still around its centre
const SCATTER_HOLD = 0.6;   // the same, for the slides that scatter and shift the systems

// The systems the volume stands for: a name, a link, its reach in px along
// the two rays of the first split (Performance, Generality), and where its
// label sits in the same coordinates, with its text-anchor. Every system has
// the same area (reach on one ray times reach on the other: no free lunch),
// and the volume they break out of is their average — the geometric mean of
// their reaches on each ray, so it has that area too. Illustrative, not data.
const SYSTEMS = [
  ['da Vinci', 'https://en.wikipedia.org/wiki/Da_Vinci_Surgical_System', 135, 60, 118, -16, 'middle'],
  ['Spot', 'https://en.wikipedia.org/wiki/Spot_(robot)', 60, 135, -6, 138, 'end'],
  ['Waymo', 'https://en.wikipedia.org/wiki/Waymo', 108, 75, 64, 47, 'start'],
];
const mean = i => Math.pow(SYSTEMS.reduce((m, sys) => m * sys[i], 1), 1 / SYSTEMS.length);
const [MEAN_S, MEAN_E] = [mean(2), mean(3)];
const reachAt = (u, a, b) => a * (b / a) ** u;   // geometric: keeps areas equal

// Each ray's labels: [plain start, arrowhead]. Leave one '' to leave that end
// unlabelled. Names below the first split are placeholders.
const LABEL = {
  C: ['Supervision', 'Autonomy'],
  S: ['', 'Performance'],
  E: ['', 'Generality'],
  EA: ['', 'Safety'],
  EB: ['', 'Efficiency'],
};

// Per stage: each ray's on-page direction (y down, towards its arrowhead),
// how far the volume reaches along it in px, and optionally how far it points
// into the page (-1 to 1, negative out of it; sets which edges are hidden). `split` names the ray
// each new one splinters from.
const STAGES = [
  { axes: {} },
  { axes: { C: [1, 0, 0] } },
  { axes: { S: [0.97, 0.24, MEAN_S], E: [0, -1, MEAN_E] },
    split: { S: 'C', E: 'C' } },
  { axes: { S: [0.97, 0.24, MEAN_S], E: [0, -1, MEAN_E] } },
  { axes: { S: [0.97, 0.24, MEAN_S], EA: [-0.05, -1, 110], EB: [-0.72, 0.6, 100, -0.8] },
    split: { EA: 'E', EB: 'E' } },
];

const NS = 'http://www.w3.org/2000/svg';
const smooth = u => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = x => Math.min(1, Math.max(0, x));

// Rays at continuous stage t. A new ray starts as a copy of the ray it
// splinters from (or, the first one, edge-on: `shown` 0). A ray that has
// just splintered keeps only its labels, fading out.
function frame(t) {
  const k = Math.min(Math.floor(t), STAGES.length - 1);
  const u = k === STAGES.length - 1 ? 0 : t - k;
  const from = STAGES[k].axes, next = STAGES[k + 1] || STAGES[k], to = next.axes;
  const cur = u ? to : from;
  const axes = Object.keys(cur).map(id => {
    const b = cur[id], src = u ? (from[id] || from[(next.split || {})[id]]) : b, a = src || b;
    const x = lerp(a[0], b[0], u), y = lerp(a[1], b[1], u), n = Math.hypot(x, y);
    return { id, label: LABEL[id], dx: x / n, dy: y / n,
             fwd: lerp(a[2], b[2], u), depth: lerp(a[3] || 0, b[3] || 0, u),
             shown: src ? 1 : u, labelFade: from[id] ? 1 : smooth(clamp01(2 * u - 1)) };
  });
  const parents = u ? Object.keys(from).filter(id => !to[id]).map(id => {
    const [x, y] = from[id];
    return { id, label: LABEL[id], dx: x, dy: y, labelFade: 1 - smooth(clamp01(2 * u)) };
  }) : [];
  return { axes, parents };
}

function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.append(e);
  return e;
}

// Convex hull (monotone chain) of a few 2-D points.
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => {
    const h = [];
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    return h.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
}

// The volume: the point and its reach forward along each ray, projected.
// Draws the outline filled, and an edge between every two corners. Of the
// edges inside the outline, those further into the page than the nearest
// one are hidden behind the faces in front of them.
function volume(svg, ox, oy, axes, cls) {
  if (!axes.length) return;
  const corners = [{ z: 0, p: [ox, oy] }, ...axes.map(a =>
    ({ z: a.depth * a.fwd, p: [ox + a.dx * a.fwd * a.shown, oy + a.dy * a.fwd * a.shown] }))];
  const h = hull(corners.map(c => c.p));
  if (h.length >= 3) el('polygon', { points: h.map(p => p.join(',')).join(' '), class: cls + '-fill' }, svg);
  const onOutline = (a, b) => h.some((p, i) => {
    const q = h[(i + 1) % h.length];
    return (p === a.p && q === b.p) || (p === b.p && q === a.p);
  });
  const edges = [];
  for (let i = 0; i < corners.length; i++) {
    for (let j = i + 1; j < corners.length; j++) {
      const a = corners[i], b = corners[j];
      edges.push({ a, b, inside: !onOutline(a, b), z: (a.z + b.z) / 2 });
    }
  }
  const nearest = Math.min(...edges.filter(e => e.inside).map(e => e.z));
  for (const { a, b, inside, z } of edges) {
    const hidden = inside && z > nearest + 0.5;
    el('line', { x1: a.p[0], y1: a.p[1], x2: b.p[0], y2: b.p[1],
                 class: cls + '-edge' + (hidden ? ' is-hidden' : '') }, svg);
  }
}

function arrowhead(svg, tx, ty, dx, dy, size) {
  const bx = -dx * size, by = -dy * size, nx = -dy * size * 0.57, ny = dx * size * 0.57;
  el('path', { d: `M${tx + bx + nx},${ty + by + ny} L${tx},${ty} L${tx + bx - nx},${ty + by - ny}`,
               class: 'sx-head' }, svg);
}

function draw(svg, t, scatter, shift) {
  const { axes, parents } = frame(t);
  const ox = 180, oy = 195;                     // the point, in a 420 × 340 viewBox
  svg.replaceChildren();

  for (const a of axes) {
    const len = HALF * a.shown, blen = RAY_BACK * a.shown;
    if (len < 1) continue;
    const fx = ox + a.dx * len, fy = oy + a.dy * len, bx = ox - a.dx * blen, by = oy - a.dy * blen;
    el('line', { x1: bx, y1: by, x2: fx, y2: fy, class: 'sx-ray' }, svg);
    arrowhead(svg, fx, fy, a.dx, a.dy, 7 * Math.min(1, a.shown * 2));
    const fade = a.labelFade * smooth(clamp01(2 * a.shown - 1));
    label(svg, fx, fy, a.dx, a.dy, a.label[1], fade);
    label(svg, bx, by, -a.dx, -a.dy, a.label[0], fade);
  }
  for (const p of parents) {                    // a splintered ray's names, fading
    label(svg, ox + p.dx * HALF, oy + p.dy * HALF, p.dx, p.dy, p.label[1], p.labelFade);
    label(svg, ox - p.dx * RAY_BACK, oy - p.dy * RAY_BACK, -p.dx, -p.dy, p.label[0], p.labelFade);
  }

  // While scattered, the volume breaks into the systems it stands for: each
  // starts as a copy of it and stretches to its own reach on each ray, fading
  // in as the whole fades out (and the reverse, as they merge again). Reaches
  // move geometrically, so every area stays the same throughout. While they
  // shift, each takes on the next system's reach, its label fading out and
  // back in at the new place.
  const [pa, ea] = Object.keys(STAGES[2].axes).map(id => axes.find(a => a.id === id));
  const split = scatter > 0 && pa && ea;
  volume(el('g', { opacity: split ? 1 - scatter : 1 }, svg), ox, oy, axes, 'sx-vol');
  if (split) {
    const fade = smooth(clamp01(2 * scatter - 1)) * smooth(Math.abs(1 - 2 * shift));
    SYSTEMS.forEach(([name, href, p, e], i) => {
      const next = SYSTEMS[(i + 1) % SYSTEMS.length], [, , , , lp, le, anchor] = shift < 0.5 ? SYSTEMS[i] : next;
      const link = el('a', { href, target: '_blank', rel: 'noopener', class: 'sx-system' }, svg);
      volume(el('g', { opacity: scatter }, link), ox, oy,
             [{ ...pa, fwd: reachAt(scatter, pa.fwd, reachAt(shift, p, next[2])) },
              { ...ea, fwd: reachAt(scatter, ea.fwd, reachAt(shift, e, next[3])) }], 'sx-sys');
      if (fade <= 0) return;
      const text = el('text', { x: ox + pa.dx * lp + ea.dx * le, y: oy + pa.dy * lp + ea.dy * le + 4,
                                'text-anchor': anchor, class: 'sx-label', opacity: fade }, link);
      text.textContent = name;
    });
  }
  // The point: it shrinks away as the volume grows out of it.
  const reach = Math.max(0, ...axes.map(a => a.fwd * a.shown));
  const r = 5 * (1 - smooth(clamp01(reach / 25)));
  if (r > 0.1) el('circle', { cx: ox, cy: oy, r, class: 'sx-origin' }, svg);
}

// A label just past an arrowhead at (tx, ty), which points along (dx, dy).
function label(svg, tx, ty, dx, dy, text, opacity) {
  if (!text || opacity <= 0) return;
  const lab = el('text', {
    x: tx + dx * 10, y: ty + dy * 10 + (dy > 0.5 ? 10 : dy < -0.5 ? -2 : 4),
    'text-anchor': dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'middle',
    class: 'sx-label', opacity,
  }, svg);
  lab.textContent = text;
}

window.Demos.register('simplex-intro', (root) => {
  const steps = [...root.querySelectorAll('.simplex-step')];
  const fig = document.createElement('div');
  fig.className = 'simplex-fig';
  const svg = el('svg', { viewBox: '0 0 420 340', role: 'img',
    'aria-label': 'Capability as a volume that gains a dimension each time an axis is discovered, then shifts along it' }, fig);
  root.prepend(fig);
  root.classList.add('is-live');

  let last = '', raf = 0;
  function update() {
    raf = 0;
    // x[i]: how far the viewport's middle has scrolled past slide i's middle.
    // Each slide holds its stage still within ±hold of its middle (longer for
    // the scatter slide), and stage i morphs into i + 1 between those windows.
    const vh = window.innerHeight;
    const x = steps.map(s => { const r = s.getBoundingClientRect(); return vh / 2 - (r.top + r.height / 2); });
    const long = s => s.hasAttribute('data-scatter') || s.hasAttribute('data-shift');
    const hold = steps.map(s => vh * (long(s) ? SCATTER_HOLD : HOLD));
    let t = 0;
    for (let i = 1; i < steps.length; i++) {
      const span = (x[i - 1] - x[i]) - hold[i - 1] - hold[i];
      t += smooth(clamp01((x[i - 1] - hold[i - 1]) / span));
    }
    // p(i): how far through slide i's hold window the viewport is, 0 to 1.
    // The systems spread out early in the scatter slide's window, shift in
    // the middle of the shift slide's, and gather back in at the end of the
    // last of the two.
    const p = i => i < 0 ? 0 : clamp01((x[i] + hold[i]) / (2 * hold[i]));
    const sc = steps.findIndex(s => s.hasAttribute('data-scatter'));
    const sh = steps.findIndex(s => s.hasAttribute('data-shift'));
    const end = sh >= 0 ? sh : sc;
    const scatter = sc < 0 ? 0 : Math.min(smooth(clamp01(p(sc) / 0.3)), smooth(clamp01((1 - p(end)) / 0.25)));
    const shift = smooth(clamp01((p(sh) - 0.1) / 0.55));
    const active = Math.round(t);
    steps.forEach((s, i) => s.classList.toggle('is-active', i === active));
    const key = t + ':' + scatter + ':' + shift;
    if (key !== last) { last = key; draw(svg, t, scatter, shift); }
  }
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    cancelAnimationFrame(raf);
    fig.remove();
    root.classList.remove('is-live');
  };
});
