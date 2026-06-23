import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scale, niceTicks } from '../static/demo-kit/plot.js';

test('scale maps linearly', () => {
  assert.equal(scale([0,10],[0,100])(5), 50);
  assert.equal(scale([0,10],[100,0])(0), 100);
});
test('niceTicks spans the range ascending', () => {
  const t = niceTicks(0, 9.7);
  assert.ok(t[0] <= 0 && t[t.length-1] >= 9.7);
  for (let i=1;i<t.length;i++) assert.ok(t[i] > t[i-1]);
});
