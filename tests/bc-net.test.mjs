import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  makeTrack, makeField, observe, expertSteer, stepCar, startState, rng, gauss, clamp,
} from '../static/demos/bc-car.js';
import { buildNet, forward, paramCount } from '../static/demos/bc-net.js';

const W = JSON.parse(readFileSync(new URL('../static/demos/bc-weights.json', import.meta.url), 'utf8'));
const track = makeTrack();
const field = makeField(track);
const SEEDS = { clean: { seed: 11, sigma: 0 }, dart: { seed: 12, sigma: 0.7 } };

// Regenerate dataset frames with the same seeded simulator the exporter used.
function frames(variant, upto) {
  const v = SEEDS[variant], rand = rng(v.seed);
  let car = startState(track, 0);
  const keep = new Map();
  for (let i = 0; i <= upto; i++) {
    const u = expertSteer(car, track);
    keep.set(i, { obs: observe(car, field, track.halfWidth), u });
    car = stepCar(car, v.sigma ? clamp(u + v.sigma * gauss(rand), -1, 1) : u);
  }
  return keep;
}

test('weights file: both variants present with the full 5,473 parameters', () => {
  for (const v of ['clean', 'dart']) {
    const net = buildNet(W.arch, W.variants[v]);
    assert.equal(paramCount(net), 5473);
    assert.ok(W.variants[v].valMSE < 1e-3);
    assert.ok(W.variants[v].lossCurve.length > 100);
  }
});

test('JS forward pass matches PyTorch on pinned dataset frames', () => {
  const maxFrame = Math.max(...W.testVectors.map((t) => t.frame));
  const regen = { clean: frames('clean', maxFrame), dart: frames('dart', maxFrame) };
  assert.ok(W.testVectors.length >= 4);
  for (const tv of W.testVectors) {
    const net = buildNet(W.arch, W.variants[tv.variant]);
    const f = regen[tv.variant].get(tv.frame);
    // the regenerated expert label matches the exported one (dataset identity)…
    assert.ok(Math.abs(f.u - tv.label) < 1e-6, `${tv.variant}#${tv.frame} label drift`);
    // …and the JS inference agrees with PyTorch inference on the same frame
    const y = forward(net, f.obs);
    assert.ok(Math.abs(y - tv.y) < 1e-5, `${tv.variant}#${tv.frame}: js=${y} torch=${tv.y}`);
  }
});
