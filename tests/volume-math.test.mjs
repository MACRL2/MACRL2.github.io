import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ease, gapsOf, areaOf, evenRadius, fitTo, reachOf, solveSpoke, sharesOf, morph, curveOf,
} from '../static/demos/volume-math.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const even = (n) => Array.from({ length: n }, (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / n);

/** Brute-force ½∫r²dθ over the sampled curve — an independent check on the closed form. */
function sampledArea(angles, radii) {
  const pts = curveOf(angles, radii, 20000);
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, r0] = pts[i], [a1, r1] = pts[i + 1];
    sum += 0.5 * (a1 - a0) * (r0 * r0 + r1 * r1) / 2;
  }
  return sum;
}

test('smoothstep eases from one spoke to the next', () => {
  close(ease(0), 0); close(ease(1), 1); close(ease(0.5), 0.5);
});

test('gaps go round the wheel once, and coinciding spokes have none', () => {
  const g = gapsOf(even(5));
  close(g.reduce((s, x) => s + x, 0), 2 * Math.PI);
  g.forEach((x) => close(x, (2 * Math.PI) / 5));
  assert.deepEqual(gapsOf([0, 0, Math.PI]).map((x) => +x.toFixed(6)), [0, +Math.PI.toFixed(6), +Math.PI.toFixed(6)]);
  // two opposite spokes: half a turn each
  gapsOf([-Math.PI / 2, Math.PI / 2]).forEach((x) => close(x, Math.PI));
});

test('equal radii make a circle, at any spoke count', () => {
  for (const n of [2, 3, 6, 11]) close(areaOf(even(n), Array(n).fill(2)), Math.PI * 4);
  close(evenRadius(Math.PI * 9), 3);
});

test('the closed-form area matches the drawn curve', () => {
  const angles = even(6), radii = [1.8, 0.4, 1.1, 0.7, 2.2, 0.9];
  close(areaOf(angles, radii), sampledArea(angles, radii), 1e-4);
  // and with uneven gaps, the way a split mid-tween leaves them
  const a = [-1.5, -1.4, 0.3, 2.0], r = [1, 2, 0.5, 1.5];
  close(areaOf(a, r), sampledArea(a, r), 1e-4);
});

test('fitTo rescales to the given volume without changing the shape', () => {
  const angles = even(5), radii = [3, 1, 2, 0.5, 1];
  const fit = fitTo(angles, radii, 10);
  close(areaOf(angles, fit), 10);
  fit.forEach((r, i) => close(r / fit[0], radii[i] / radii[0]));
});

test('pulling one spoke out makes every other spoke give ground', () => {
  const angles = even(6), A = Math.PI;
  const before = fitTo(angles, [1, 1.2, 0.8, 1, 1.4, 0.6], A);
  const raw = solveSpoke(angles, before, 2, 1.6, A);
  const after = fitTo(angles, raw, A);
  close(after[2], 1.6, 1e-9);
  close(areaOf(angles, after), A);
  after.forEach((r, i) => { if (i !== 2) assert.ok(r < before[i], `spoke ${i} gave ground`); });
});

test('pushing a spoke in hands the volume to the others', () => {
  const angles = even(4), A = 5;
  const before = fitTo(angles, [1, 1, 1, 1], A);
  const after = fitTo(angles, solveSpoke(angles, before, 0, before[0] * 0.3, A), A);
  close(after[0], before[0] * 0.3, 1e-9);
  for (const i of [1, 2, 3]) assert.ok(after[i] > before[i]);
});

test('an axis is unbounded, but a fixed volume only reaches so far along it', () => {
  const angles = even(6), A = Math.PI;
  const radii = [1, 1, 1, 1, 1, 1];
  const reach = reachOf(angles, radii, 0, A);
  // all the volume on one spoke: ½·(Δ + Δ)·K_SAME·x² = π  →  x = √(35·6/26)
  close(reach, Math.sqrt((35 * 6) / 26), 1e-9);
  // asking for more than that clamps just short of it — the rest keep a sliver
  const after = fitTo(angles, solveSpoke(angles, radii, 0, 99, A), A);
  close(after[0], reach * 0.97, 1e-9);
  close(areaOf(angles, after), A);
  assert.ok(after.slice(1).every((r) => r > 0 && r < 0.6));
});

test('a drag solves at two spokes too (the wheel opens on two qualities)', () => {
  const angles = even(2), A = Math.PI;
  const after = fitTo(angles, solveSpoke(angles, [1, 1], 1, 1.3, A), A);
  close(after[1], 1.3, 1e-9);
  close(areaOf(angles, after), A);
});

test('shares are multiples of an even spread', () => {
  const s = sharesOf(even(4), [2, 2, 2, 2]);
  s.forEach((x) => close(x, 1));
});

test('a morph holds the volume at every step, not just the ends', () => {
  const angles = even(5), A = 7;
  const from = [2, 0.3, 1, 1, 0.5], to = [0.4, 2, 0.6, 1.5, 1];
  for (const t of [0, 0.1, 0.37, 0.5, 0.9, 1]) close(areaOf(angles, morph(angles, from, to, t, A)), A);
  const end = morph(angles, from, to, 1, A), want = fitTo(angles, to, A);
  end.forEach((r, i) => close(r, want[i]));
});

test('the curve is closed and passes through every spoke', () => {
  const angles = even(3), radii = [1, 2, 3];
  const pts = curveOf(angles, radii, 30);
  const [first, last] = [pts[0], pts[pts.length - 1]];
  close(last[0] - first[0], 2 * Math.PI);
  assert.equal(last[1], first[1]);
  assert.ok(pts.every((p, i) => i === 0 || p[0] >= pts[i - 1][0]), 'angles only increase');
  for (let i = 0; i < 3; i++) assert.ok(pts.some(([a, r]) => Math.abs(a - angles[i]) < 1e-9 && r === radii[i]));
  // a convex blend: never outside the two radii either side
  assert.ok(pts.every(([, r]) => r >= 1 && r <= 3));
});
