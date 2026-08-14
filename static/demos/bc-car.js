// bc-car.js — pure logic for the behavior-cloning driving lab: a closed road,
// a kinematic car, a pure-pursuit expert, and the top-down "camera" the policy
// sees. No imports, no DOM — Node-testable (like cartpole-dynamics.js).

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Deterministic RNG (mulberry32) + a Gaussian sampler, so demos and tests can
// reproduce runs exactly.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gauss(rand) {
  const u = Math.max(rand(), 1e-12), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// --- the road ----------------------------------------------------------------
// A closed centerline r(θ) = R·(1 + amp·sin(lobes·θ + phase)) sampled as a
// dense polyline, with arc-length lookups for the expert and signed
// cross-track error for measurement.
export function makeTrack(opts = {}) {
  const o = { R: 10, amp: 0.14, lobes: 3, phase: 0.7, halfWidth: 1.0, n: 720, ...opts };
  const pts = [];
  for (let i = 0; i < o.n; i++) {
    const th = (i / o.n) * 2 * Math.PI;
    const r = o.R * (1 + o.amp * Math.sin(o.lobes * th + o.phase));
    pts.push([r * Math.cos(th), r * Math.sin(th)]);
  }
  const cum = new Float64Array(o.n + 1);
  for (let i = 1; i <= o.n; i++) {
    const a = pts[i - 1], b = pts[i % o.n];
    cum[i] = cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const total = cum[o.n];

  function tangentAt(i) {
    const a = pts[(i - 1 + o.n) % o.n], b = pts[(i + 1) % o.n];
    const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
    return [dx / m, dy / m];
  }
  // Nearest centerline vertex → arc length s and SIGNED cross-track error e
  // (positive = left of travel direction).
  function nearest(x, y) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < o.n; i++) {
      const dx = x - pts[i][0], dy = y - pts[i][1], d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
    const [tx, ty] = tangentAt(bi);
    const dx = x - pts[bi][0], dy = y - pts[bi][1];
    return { e: tx * dy - ty * dx, s: cum[bi], i: bi };
  }
  function pointAt(s) {
    s = ((s % total) + total) % total;
    let lo = 0, hi = o.n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; (cum[mid] <= s) ? lo = mid : hi = mid; }
    const a = pts[lo], b = pts[(lo + 1) % o.n];
    const f = (s - cum[lo]) / ((cum[lo + 1] - cum[lo]) || 1);
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
  }
  function headingAt(s) {
    const a = pointAt(s), b = pointAt(s + 0.2);
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const bounds = {
    x0: Math.min(...xs) - o.halfWidth, x1: Math.max(...xs) + o.halfWidth,
    y0: Math.min(...ys) - o.halfWidth, y1: Math.max(...ys) + o.halfWidth,
  };
  return { ...o, pts, total, nearest, pointAt, headingAt, bounds };
}

// --- the car -------------------------------------------------------------------
// Kinematic unicycle at constant speed; the single control u ∈ [−1, 1] is a
// curvature command (u·kappaMax = commanded path curvature).
export const CAR = { v: 2.0, dt: 0.05, kappaMax: 0.55, lookahead: 2.2 };

export function stepCar(c, u, p = CAR) {
  const psi = c.psi + clamp(u, -1, 1) * p.kappaMax * p.v * p.dt;
  return { x: c.x + p.v * Math.cos(psi) * p.dt, y: c.y + p.v * Math.sin(psi) * p.dt, psi };
}

// Start on the centerline at arc length s, shifted `offset` to the left.
export function startState(track, offset = 0, s = 0) {
  const [x, y] = track.pointAt(s), psi = track.headingAt(s);
  return { x: x - offset * Math.sin(psi), y: y + offset * Math.cos(psi), psi };
}

// --- the expert ----------------------------------------------------------------
// Pure pursuit: aim at the centerline point one lookahead ahead; the circle
// through it fixes the curvature. Simple, and it recovers from anywhere.
export function expertSteer(c, track, p = CAR) {
  const near = track.nearest(c.x, c.y);
  const [gx, gy] = track.pointAt(near.s + p.lookahead);
  const dx = gx - c.x, dy = gy - c.y;
  const cos = Math.cos(c.psi), sin = Math.sin(c.psi);
  const fwd = cos * dx + sin * dy, lat = -sin * dx + cos * dy;
  const kappa = (2 * lat) / (fwd * fwd + lat * lat || 1e-9);
  return clamp(kappa / p.kappaMax, -1, 1);
}

// --- the camera ------------------------------------------------------------------
// A precomputed grid of distance-to-centerline over the world, then a small
// egocentric top-down image sampled from it: road ≈ 1, off-road ≈ 0, with a
// soft edge so the boundary is smooth. Pure JS — no canvas — so the exact same
// pixels exist in Node tests and in the browser.
export function makeField(track, res = 200, margin = 6) {
  const b = track.bounds;
  const x0 = b.x0 - margin, y0 = b.y0 - margin;
  const w = res, h = res;
  const cw = (b.x1 - b.x0 + 2 * margin) / (w - 1), ch = (b.y1 - b.y0 + 2 * margin) / (h - 1);
  const data = new Float32Array(w * h);
  const pts = track.pts, n = pts.length;
  for (let j = 0; j < h; j++) {
    const y = y0 + j * ch;
    for (let i = 0; i < w; i++) {
      const x = x0 + i * cw;
      let bd = Infinity;
      for (let k = 0; k < n; k += 2) {
        const dx = x - pts[k][0], dy = y - pts[k][1], d = dx * dx + dy * dy;
        if (d < bd) bd = d;
      }
      data[j * w + i] = Math.sqrt(bd);
    }
  }
  return { x0, y0, cw, ch, w, h, data };
}

export function sampleField(f, x, y) {
  const gx = (x - f.x0) / f.cw, gy = (y - f.y0) / f.ch;
  const i = Math.floor(gx), j = Math.floor(gy);
  if (i < 0 || j < 0 || i >= f.w - 1 || j >= f.h - 1) return 1e9;
  const fx = gx - i, fy = gy - j, r0 = j * f.w + i;
  const a = f.data[r0] * (1 - fx) + f.data[r0 + 1] * fx;
  const b = f.data[r0 + f.w] * (1 - fx) + f.data[r0 + f.w + 1] * fx;
  return a * (1 - fy) + b * fy;
}

// The policy's entire sensorium: w×h pixels covering `ahead` units in front,
// `behind` units back, `halfSpan` to each side, car at bottom-center heading up.
export const OBS = { w: 24, h: 24, ahead: 5.0, behind: 1.0, halfSpan: 3.0, edge: 0.25 };

export function observe(car, field, halfWidth, o = OBS, out) {
  out = out || new Float32Array(o.w * o.h);
  const cos = Math.cos(car.psi), sin = Math.sin(car.psi);
  for (let r = 0; r < o.h; r++) {
    const f = o.ahead - ((r + 0.5) / o.h) * (o.ahead + o.behind); // row 0 = far ahead
    for (let c = 0; c < o.w; c++) {
      const l = o.halfSpan - ((c + 0.5) / o.w) * 2 * o.halfSpan;  // col 0 = left
      const wx = car.x + f * cos - l * sin;
      const wy = car.y + f * sin + l * cos;
      const d = sampleField(field, wx, wy);
      out[r * o.w + c] = clamp((halfWidth - d) / o.edge + 0.5, 0, 1);
    }
  }
  return out;
}
