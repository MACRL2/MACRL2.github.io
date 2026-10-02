// volume-math.js — the geometry of a capability volume.
//
// PURE MODULE: no window/document, no imports, so the unit tests import it
// directly in Node. Shared by the landing-page radar (autonomy-radar.js) and
// the per-unit figures (capability-volume.js).
//
// ── The shape ─────────────────────────────────────────────────────────────
// A volume is a closed curve r(θ) around a hub, through one radius per spoke.
// Between two neighbouring spokes the radius eases with a smoothstep in angle,
// so the curve meets every spoke square-on and never overshoots: r is a convex
// blend of the two radii either side of it. Two things follow.
//
//   - The area is an exact quadratic form in the radii:
//       area = ½ Σ Δᵢ · ( K_SAME·(aᵢ² + bᵢ²) + K_CROSS·aᵢbᵢ )
//     over each gap Δᵢ between a spoke of radius aᵢ and the next, bᵢ.
//     So any shape can be rescaled to a given area exactly: `fitTo`.
//   - Pulling one spoke out while holding the area fixed is a quadratic in
//     that spoke's raw radius, solved in closed form: `solveSpoke`. Every
//     other spoke gives ground in proportion — the volume moves, it does not
//     grow.
//
// The axes are unbounded, but a fixed volume is not: the furthest a shape can
// reach along one spoke is what it gets by giving every other spoke up
// entirely — `reachOf`.

// ∫₀¹(1−s)² dt = ∫₀¹s² dt = 13/35 and ∫₀¹ 2s(1−s) dt = 9/35, s = 3t² − 2t³.
const K_SAME = 13 / 35;
const K_CROSS = 9 / 35;
const TAU = 2 * Math.PI;

/** Smoothstep: the blend between one spoke and the next. */
export const ease = (t) => t * t * (3 - 2 * t);

/**
 * The angular gap from each spoke to the next, wrapping round. Spokes are given
 * in drawing order (clockwise, as angles increase); two spokes that coincide
 * — a split that has only just begun — have a gap of zero.
 */
export function gapsOf(angles) {
  const n = angles.length;
  if (n === 1) return [TAU];
  return angles.map((a, i) => {
    let d = (angles[(i + 1) % n] - a) % TAU;
    if (d < 0) d += TAU;
    return d > TAU - 1e-9 ? 0 : d;     // a hair behind its neighbour still coincides
  });
}

/** The area enclosed by the curve. */
export function areaOf(angles, radii) {
  const gaps = gapsOf(angles);
  const n = radii.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = radii[i], b = radii[(i + 1) % n];
    sum += gaps[i] * (K_SAME * (a * a + b * b) + K_CROSS * a * b);
  }
  return sum / 2;
}

/** The radius of a circle holding `area` — the volume spread evenly. */
export const evenRadius = (area) => Math.sqrt(area / Math.PI);

/** Rescale `radii` so the curve encloses exactly `area`. Shape is unchanged. */
export function fitTo(angles, radii, area) {
  const a = areaOf(angles, radii);
  if (!(a > 0)) return radii.map(() => evenRadius(area));
  const s = Math.sqrt(area / a);
  return radii.map((r) => r * s);
}

/** area(x) = c2·x² + c1·x + c0 as spoke k's raw radius x varies. */
function quadratic(angles, radii, k) {
  const at = (x) => areaOf(angles, radii.map((r, i) => (i === k ? x : r)));
  const c0 = at(0), a1 = at(1), a2 = at(2);
  const c2 = (a2 - 2 * a1 + c0) / 2;
  return { c0, c1: a1 - c2 - c0, c2 };
}

/**
 * How far spoke k can reach when the shape is held to `area` and everything
 * else is given up. This is the bound on an unbounded axis.
 */
export function reachOf(angles, radii, k, area) {
  const { c2 } = quadratic(angles, radii, k);
  return c2 > 0 ? Math.sqrt(area / c2) : Infinity;
}

/**
 * New raw radii — only spoke k changes — such that, once rescaled to `area`,
 * spoke k lands at `target`. The target is clamped into (`floor`, `ceil`·reach),
 * so the other spokes always keep a sliver of the volume.
 */
export function solveSpoke(angles, radii, k, target, area, { floor = 0, ceil = 0.97 } = {}) {
  const { c0, c1, c2 } = quadratic(angles, radii, k);
  const reach = c2 > 0 ? Math.sqrt(area / c2) : Infinity;
  const v = Math.min(Math.max(target, floor), reach * ceil);
  // x²·A = v²·(c2·x² + c1·x + c0)  →  (A − v²c2)·x² − v²c1·x − v²c0 = 0
  const qa = area - v * v * c2, qb = -v * v * c1, qc = -v * v * c0;
  let x;
  if (Math.abs(qa) < 1e-12) x = qb ? -qc / qb : radii[k];
  else x = (-qb + Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc))) / (2 * qa);
  const out = radii.slice();
  out[k] = Math.max(x, 0);
  return out;
}

/** Each spoke's share of the volume, as a multiple of an even spread. */
export const sharesOf = (angles, radii) => fitTo(angles, radii, Math.PI);  // even radius 1

/**
 * The same volume, partway between two shapes: blend the fitted radii, then fit
 * again, so the area holds exactly at every t — not just at the two ends.
 */
export function morph(angles, from, to, t, area) {
  const a = fitTo(angles, from, area), b = fitTo(angles, to, area);
  return fitTo(angles, a.map((r, i) => r + (b[i] - r) * t), area);
}

/**
 * Points along the curve, ready to stroke: [[angle, radius], …] sampled per gap
 * in proportion to its width. Closed — the last point is the first spoke again.
 */
export function curveOf(angles, radii, samples = 180) {
  const gaps = gapsOf(angles);
  const n = radii.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = radii[i], b = radii[(i + 1) % n];
    const m = Math.max(1, Math.round((samples * gaps[i]) / TAU));
    for (let j = 0; j < m; j++) {
      const t = j / m;
      pts.push([angles[i] + gaps[i] * t, a + (b - a) * ease(t)]);
    }
  }
  pts.push([angles[n - 1] + gaps[n - 1], radii[0]]);   // unwrapped, so angles only increase
  return pts;
}
