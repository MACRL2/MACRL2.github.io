// value-fn.js — a small "value function" the robot is imagined to know, pinned in
// the right margin. For now it's FAKE: a slowly morphing 2-D value landscape with
// a wandering "current state" marker, so we have the visual language in place. The
// intent is to later feed it real signal from the microduck (e.g. a critic's V(s)
// or a state-visitation estimate) via postMessage. The mount div is a trigger only;
// the widget is portaled to <body> so it floats in the margin wherever the mount is.

const N = 56;                          // value-field resolution (kept low; CSS upscales)
// Perceptual-ish sequential ramp (dark → teal → green → gold): reads as "value".
const STOPS = [[13, 17, 23], [38, 70, 83], [42, 157, 143], [233, 196, 106], [244, 162, 97]];
function cmap(t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const s = t * (STOPS.length - 1), i = Math.floor(s), f = s - i;
  const a = STOPS[i], b = STOPS[Math.min(STOPS.length - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

window.Demos.register('value-fn', (el, params, ctx) => {
  el.style.display = 'none';           // trigger only; the widget lives in the margin
  // Persist across scroll: the kit unmounts a demo when its trigger leaves the
  // viewport, so we make the widget a singleton and return no cleanup — the
  // margin aid should stay pinned while the page is open.
  if (document.querySelector('.valuefn-widget')) return;

  const wrap = document.createElement('div');
  wrap.className = 'valuefn-widget';
  wrap.innerHTML =
    '<div class="valuefn-title">value</div>' +
    '<div class="valuefn-stage"><canvas class="valuefn-canvas" width="' + N + '" height="' + N + '"></canvas>' +
    '<div class="valuefn-dot"></div></div>' +
    '<div class="valuefn-cap">a stand-in V(s) — what the robot “knows” (placeholder)</div>';
  document.body.appendChild(wrap);

  const g = wrap.querySelector('canvas').getContext('2d');
  const dot = wrap.querySelector('.valuefn-dot');
  const img = g.createImageData(N, N);

  let raf = 0;
  function frame(ts) {
    const t = ts * 0.001;
    // two slowly wandering value peaks + a broad basin
    const p1x = 0.5 + 0.30 * Math.sin(t * 0.45), p1y = 0.5 + 0.26 * Math.cos(t * 0.37);
    const p2x = 0.5 + 0.30 * Math.cos(t * 0.23 + 1), p2y = 0.5 + 0.30 * Math.sin(t * 0.31 + 2);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const u = x / (N - 1), v = y / (N - 1);
        let val = Math.exp(-(((u - p1x) ** 2) + ((v - p1y) ** 2)) / 0.05)
          + 0.6 * Math.exp(-(((u - p2x) ** 2) + ((v - p2y) ** 2)) / 0.03)
          + 0.12 * Math.sin(u * 6 + t) * Math.cos(v * 6 - t);   // gentle texture
        val = val < 0 ? 0 : val > 1 ? 1 : val;
        const [r, gg, bb] = cmap(val);
        const q = (y * N + x) * 4;
        img.data[q] = r; img.data[q + 1] = gg; img.data[q + 2] = bb; img.data[q + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // "current state" marker wanders on its own path (fake, for now)
    const sx = 0.5 + 0.40 * Math.sin(t * 0.7 + 0.4), sy = 0.5 + 0.40 * Math.cos(t * 0.55);
    dot.style.left = (sx * 100) + '%';
    dot.style.top = (sy * 100) + '%';
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  // No cleanup returned on purpose (see the singleton note above): the margin
  // widget persists for the life of the page rather than tearing down on scroll.
});
