import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriv, feedback, DEFAULTS } from '../static/demos/cartpole-dynamics.js';
import { integrate } from '../static/demo-kit/sim.js';

test('upright with no force is an equilibrium', () => {
  assert.deepEqual(deriv([0,0,0,0], 0), [0,0,0,0]);
});
test('upright is unstable (theta_ddot same sign as theta)', () => {
  const d = deriv([0,0,0.05,0], 0);
  assert.ok(d[3] * 0.05 > 0, `theta_ddot=${d[3]}`);
});
test('feedback controller stabilizes a small tilt', () => {
  let s = [0,0,0.1,0];
  for (let t=0; t<5; t+=0.01) {
    const u = feedback(s);
    s = integrate((x)=>deriv(x, u), s, 0.01, 'rk4');
    assert.ok(Math.abs(s[2]) < 0.1, `theta blew up to ${s[2]} at t=${t.toFixed(2)}`);
  }
});
