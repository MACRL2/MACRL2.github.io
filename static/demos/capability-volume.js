// capability-volume.js — the small figure each unit carries: the same volume,
// moved.
//
// Only the axes the unit's new approach moves along are drawn, as open rays from
// one origin, each ending in an arrowhead — no rim. The approach the unit starts from is a
// dashed outline; the one it introduces is the filled shape, and both are drawn
// at exactly the same volume (volume-math.js), so the figure can only ever show
// capability moving from some axes to others. As it scrolls into view the
// filled shape morphs out of the dashed one; click it to watch again.
//
// Configured per unit — see capability-volume-spec.js for the schema. build.py
// turns a chapter's `volume:` front-matter (or a ```volume fence) into the
// `data-params` this mount fn receives.
import { unitVolume, movesOf, anglesFor, MOVE } from '/static/demos/capability-volume-spec.js';
import { morph, curveOf, fitTo } from '/static/demos/volume-math.js';
import { colorOf } from '/static/demos/autonomy-radar-data.js';

const NS = 'http://www.w3.org/2000/svg';
const MORPH = 1500;          // ms, dashed → filled
const DELAY = 250;           // ms before it starts, once in view
const EXTENT = 66;           // the largest share sits this far out (viewBox units)
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let uid = 0;

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function pathOf(angles, radii) {
  return curveOf(angles, radii, 160).map(([a, r], i) =>
    `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`).join('') + 'Z';
}

function mount(el, params, ctx) {
  const { Theme } = ctx;
  const vol = unitVolume(params);
  const id = `cvol${++uid}`;
  el.classList.add('cvol-host');

  if (vol.errors.length) console.error('[capability-volume]', vol.errors.join('; '), params);
  if (vol.axes.length < 2) {
    el.innerHTML = `<p class="cvol-error">volume figure: ${esc(vol.errors.join('; '))}</p>`;
    return () => {};
  }

  const n = vol.axes.length;
  const angles = anglesFor(n);
  const { rows, gains, pays } = movesOf(vol);
  const peak = Math.max(...rows.map((r) => Math.max(r.was, r.now)));
  const rho = Math.min(34, EXTENT / peak);              // the even-spread radius
  const area = Math.PI * rho * rho;
  const before = fitTo(angles, vol.axes.map((a) => a.before), area);
  const after = fitTo(angles, vol.axes.map((a) => a.after), area);
  const LR = peak * rho + 13;                            // labels, all on one radius

  const summary = [
    gains.length ? `toward ${gains.join(', ')}` : '',
    pays.length ? `away from ${pays.join(', ')}` : '',
  ].filter(Boolean).join(' · ');
  const title = `${vol.from || 'before'} → ${vol.to || 'after'}: the same volume, moved ${summary || 'nowhere'}.`;

  el.innerHTML = `
    <figure class="cvol">
      <svg class="cvol-svg" viewBox="${-(LR + 112)} ${-(LR + 16)} ${2 * (LR + 112)} ${2 * (LR + 16)}"
           role="img" aria-labelledby="${id}-t">
        <title id="${id}-t">${esc(title)}</title>
        <defs></defs>
        <g class="cvol-spokes"></g>
        <path class="cvol-before" d="${pathOf(angles, before)}"/>
        <path class="cvol-after" d="${pathOf(angles, before)}"/>
        <g class="cvol-moves"></g>
        <g class="cvol-labels"></g>
      </svg>
      <figcaption class="cvol-cap">
        <span class="cvol-pair">
          ${vol.from ? `<span class="cvol-key cvol-key-before"></span><span>${esc(vol.from)}</span>` : ''}
          ${vol.from && vol.to ? '<span class="cvol-arrow">→</span>' : ''}
          ${vol.to ? `<span class="cvol-key cvol-key-after"></span><span>${esc(vol.to)}</span>` : ''}
        </span>
        <span class="cvol-moved">${esc(vol.note || (summary ? `same volume, moved ${summary}` : 'same volume'))}</span>
      </figcaption>
    </figure>`;

  const svg = el.querySelector('svg');
  const defs = svg.querySelector('defs');
  const spokes = svg.querySelector('.cvol-spokes');
  const labels = svg.querySelector('.cvol-labels');
  const moves = svg.querySelector('.cvol-moves');
  const afterPath = svg.querySelector('.cvol-after');

  // Spokes are rays, each its own direction: a thin line out of the origin,
  // darkening as it goes, ending in an open arrowhead just short of its label —
  // the usual mark for an axis that keeps going. All of them get one, which is
  // the point: an x–y cross puts arrows on the positive ends only, so plain
  // strokes made two opposite spokes read as one axis with a negative side.
  const R0 = 5;                                          // where a spoke leaves the origin
  const TIP = LR - 2;                                    // where it ends, pointing at its label
  const head = (c, s, r, len, wid) =>
    `M${(c * (r - len) - s * wid).toFixed(2)} ${(s * (r - len) + c * wid).toFixed(2)}` +
    `L${(c * r).toFixed(2)} ${(s * r).toFixed(2)}` +
    `L${(c * (r - len) + s * wid).toFixed(2)} ${(s * (r - len) - c * wid).toFixed(2)}`;
  angles.forEach((a, i) => {
    const c = Math.cos(a), s = Math.sin(a);
    const grad = svgEl('linearGradient', {
      id: `${id}-g${i}`, gradientUnits: 'userSpaceOnUse',
      x1: (c * R0).toFixed(2), y1: (s * R0).toFixed(2), x2: (c * TIP).toFixed(2), y2: (s * TIP).toFixed(2),
    });
    grad.append(
      svgEl('stop', { offset: '0', class: 'cvol-stop', 'stop-opacity': '0.3' }),
      svgEl('stop', { offset: '1', class: 'cvol-stop', 'stop-opacity': '1' }),
    );
    defs.append(grad);
    spokes.append(svgEl('line', {
      x1: (c * R0).toFixed(2), y1: (s * R0).toFixed(2), x2: (c * (TIP - 0.6)).toFixed(2), y2: (s * (TIP - 0.6)).toFixed(2),
      stroke: `url(#${id}-g${i})`, class: 'cvol-spoke',
    }));
    spokes.append(svgEl('path', { d: head(c, s, TIP, 4.2, 2.6), class: 'cvol-head' }));
  });
  spokes.append(svgEl('circle', { cx: 0, cy: 0, r: 1.6, class: 'cvol-origin' }));

  // Where the volume went: the stretch of each spoke between the dashed shape
  // and the filled one, inked in — accent where it grew, muted where it paid.
  rows.forEach((r, i) => {
    if (Math.abs(r.now - r.was) * rho < 3) return;
    const a = angles[i], c = Math.cos(a), s = Math.sin(a);
    const r0 = before[i], r1 = after[i];
    const g = svgEl('g', { class: `cvol-move ${r1 > r0 ? 'is-gain' : 'is-pay'}` });
    g.append(svgEl('line', {
      x1: (c * r0).toFixed(2), y1: (s * r0).toFixed(2), x2: (c * r1).toFixed(2), y2: (s * r1).toFixed(2),
    }));
    g.style.opacity = '0';
    moves.append(g);
  });

  function drawLabels() {
    const dark = document.documentElement.dataset.theme === 'dark';
    labels.replaceChildren(...vol.axes.map((ax, i) => {
      const a = angles[i], c = Math.cos(a), s = Math.sin(a);
      const t = svgEl('text', {
        x: (c * (LR + 3)).toFixed(2), y: (s * (LR + 3)).toFixed(2), class: 'cvol-label',
        'text-anchor': c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle',
        'dominant-baseline': Math.abs(c) > 0.3 ? 'central' : s > 0 ? 'hanging' : 'auto',
      });
      if (ax.id) t.style.fill = colorOf(ax.id, dark);
      const r = rows[i];
      t.classList.toggle('is-gain', r.delta > MOVE);
      t.classList.toggle('is-pay', r.delta < -MOVE);
      t.textContent = ax.label;
      return t;
    }));
  }

  let raf = 0, timer = 0;
  function show(k) {
    afterPath.setAttribute('d', pathOf(angles, morph(angles, before, after, k, area)));
    for (const g of moves.children) g.style.opacity = String(Math.max(0, (k - 0.6) / 0.4));
  }
  function play() {
    cancelAnimationFrame(raf); clearTimeout(timer);
    if (REDUCED()) { show(1); return; }
    show(0);
    timer = setTimeout(() => {
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / MORPH);
        show(ease(k));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, DELAY);
  }

  drawLabels();
  play();
  svg.addEventListener('click', play);
  const offTheme = Theme.onChange(drawLabels);

  return () => {
    cancelAnimationFrame(raf); clearTimeout(timer);
    svg.removeEventListener('click', play);
    offTheme();
  };
}

window.Demos.register('capability-volume', mount);
