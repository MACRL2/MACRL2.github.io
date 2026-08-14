import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rng } from '../static/demos/bc-car.js';
import {
  createNet, makeCache, forward, backward, gradsInit, adamInit, trainSteps,
  paramCount, predict,
} from '../static/demos/bc-cnn.js';

test('architecture: 24×24 → 10×10×6 → 4×4×12 → 24 → 1, 5473 params', () => {
  const net = createNet(1);
  assert.equal(net.o1, 10);
  assert.equal(net.o2, 4);
  assert.equal(net.flat, 192);
  assert.equal(paramCount(net), 5473);
});

test('backprop matches numeric gradients', () => {
  const net = createNet(7);
  const cache = makeCache(net);
  const g = gradsInit(net);
  const r = rng(3);
  const x = new Float32Array(net.inW * net.inH).map(() => r());
  const target = 0.3;
  const err = forward(net, x, cache) - target;
  backward(net, cache, 2 * err, g);
  for (const k of ['W1', 'b1', 'W2', 'b2', 'W3', 'b3', 'W4', 'b4']) {
    for (let trial = 0; trial < 5; trial++) {
      const i = (r() * net[k].length) | 0;
      const eps = 1e-5, keep = net[k][i];
      net[k][i] = keep + eps; const lp = (forward(net, x, cache) - target) ** 2;
      net[k][i] = keep - eps; const lm = (forward(net, x, cache) - target) ** 2;
      net[k][i] = keep;
      const num = (lp - lm) / (2 * eps);
      const rel = Math.abs(num - g[k][i]) / (Math.abs(num) + Math.abs(g[k][i]) + 1e-8);
      assert.ok(rel < 1e-5, `${k}[${i}]: analytic=${g[k][i]} numeric=${num} rel=${rel}`);
    }
  }
});

test('training reduces loss on a synthetic pixels→steering task', () => {
  const net = createNet(2);
  const cache = makeCache(net), g = gradsInit(net), opt = adamInit(net);
  const r = rng(9);
  const X = [], y = [];
  for (let n = 0; n < 200; n++) {
    const img = new Float32Array(net.inW * net.inH).map(() => r());
    X.push(img);
    y.push(Math.tanh(img[30] - img[400] + 0.5 * img[300]));
  }
  const before = trainSteps(net, X, y, opt, g, cache, 1, 16, r);
  let after = before;
  for (let s = 0; s < 150; s++) after = trainSteps(net, X, y, opt, g, cache, 1, 16, r);
  assert.ok(after < before / 5, `loss ${before} -> ${after}`);
  assert.ok(Math.abs(predict(net, X[0], cache)) <= 1);
});
