import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeTrack, makeField, observe, expertSteer, stepCar, startState, CAR, OBS,
} from '../static/demos/bc-car.js';

const track = makeTrack();

test('track closes: pointAt(0) == pointAt(total)', () => {
  const a = track.pointAt(0), b = track.pointAt(track.total);
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6);
});

test('cross-track error is signed (left of travel = positive)', () => {
  const h = track.headingAt(0), [x, y] = track.pointAt(0);
  const left = track.nearest(x - 0.5 * Math.sin(h), y + 0.5 * Math.cos(h));
  const right = track.nearest(x + 0.5 * Math.sin(h), y - 0.5 * Math.cos(h));
  assert.ok(left.e > 0.4 && right.e < -0.4, `e_left=${left.e} e_right=${right.e}`);
});

test('straight-line step when u = 0', () => {
  const c = stepCar({ x: 0, y: 0, psi: 0 }, 0);
  assert.ok(Math.abs(c.y) < 1e-12 && Math.abs(c.psi) < 1e-12 && c.x > 0);
});

test('expert laps the track without leaving the lane', () => {
  let car = startState(track, 0);
  const steps = Math.round(track.total / (CAR.v * CAR.dt));
  let maxE = 0;
  for (let i = 0; i < steps; i++) {
    car = stepCar(car, expertSteer(car, track));
    maxE = Math.max(maxE, Math.abs(track.nearest(car.x, car.y).e));
  }
  assert.ok(maxE < 0.3, `max|e|=${maxE}`);
});

test('expert recovers from a large offset (recovery exists; the data just never shows it)', () => {
  let car = startState(track, 0.8);
  let recovered = false;
  for (let i = 0; i < 100 && !recovered; i++) {
    car = stepCar(car, expertSteer(car, track));
    recovered = Math.abs(track.nearest(car.x, car.y).e) < 0.1;
  }
  assert.ok(recovered);
});

test('camera: values in [0,1], road under the car, image shifts when the car shifts', () => {
  const field = makeField(track);
  const onCenter = observe(startState(track, 0), field, track.halfWidth);
  for (const v of onCenter) assert.ok(v >= 0 && v <= 1);
  const ego = (Math.round((OBS.ahead / (OBS.ahead + OBS.behind)) * OBS.h) * OBS.w) + (OBS.w >> 1);
  assert.ok(onCenter[ego] > 0.9, `ego pixel=${onCenter[ego]}`);
  const mean = onCenter.reduce((a, b) => a + b) / onCenter.length;
  assert.ok(mean > 0.1 && mean < 0.6, `mean=${mean}`);
  // shift the car left: the road's mass in the bottom row should move right
  const shifted = observe(startState(track, 0.8), field, track.halfWidth);
  const centroid = (obs) => {
    let m = 0, mx = 0;
    for (let c = 0; c < OBS.w; c++) { const v = obs[(OBS.h - 1) * OBS.w + c]; m += v; mx += v * c; }
    return mx / (m || 1);
  };
  assert.ok(centroid(shifted) > centroid(onCenter) + 1.5,
    `centroids ${centroid(onCenter)} -> ${centroid(shifted)}`);
});
