// Closed-loop regression for the shipped policy weights: the chapter's story
// must hold in simulation. Deployment conditions mirror bc-clone.js exactly —
// small start offset, light steering noise, an alternating kick every 10 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  makeTrack, makeField, observe, expertSteer, stepCar, startState, CAR, OBS, rng, gauss, clamp,
} from '../static/demos/bc-car.js';
import { buildNet, predict } from '../static/demos/bc-net.js';

const W = JSON.parse(readFileSync(new URL('../static/demos/bc-weights.json', import.meta.url), 'utf8'));
const track = makeTrack();
const field = makeField(track);

function deploy(policy, T, seed = 21) {
  const r = rng(seed);
  let car = startState(track, 0.15), sign = 1;
  const buf = new Float32Array(OBS.w * OBS.h);
  const per = Math.round(10 / CAR.dt);
  for (let i = 0; i < Math.round(T / CAR.dt); i++) {
    if (i > 0 && i % per === 0) { car.psi += 0.2 * sign; sign = -sign; }
    car = stepCar(car, clamp(policy(car, buf) + 0.02 * gauss(r), -1, 1));
    if (Math.abs(track.nearest(car.x, car.y).e) > track.halfWidth) return i * CAR.dt;
  }
  return null;
}
const pol = (v) => {
  const net = buildNet(W.arch, W.variants[v]);
  return (car, buf) => predict(net, observe(car, field, track.halfWidth, OBS, buf));
};

test('clean clone compounds off the road within 90 s', () => {
  const t = deploy(pol('clean'), 90);
  assert.ok(t != null && t > 10, `expected a mid-drive crash, got ${t}`);
});

test('widened (dart) clone survives 180 s of kicks', () => {
  assert.equal(deploy(pol('dart'), 180), null);
});

test('expert survives 180 s of kicks', () => {
  assert.equal(deploy((c) => expertSteer(c, track), 180), null);
});
