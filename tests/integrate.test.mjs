import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrate } from '../static/demo-kit/sim.js';

test('rk4 solves x_dot = -x accurately', () => {
  const deriv = (s) => [-s[0]];
  let s = [1], t = 0;
  while (t < 1 - 1e-9) { s = integrate(deriv, s, 0.01, 'rk4'); t += 0.01; }
  assert.ok(Math.abs(s[0] - Math.exp(-1)) < 1e-6, `rk4 err=${Math.abs(s[0]-Math.exp(-1))}`);
});

test('rk4 beats euler on the same ODE', () => {
  const deriv = (s) => [-s[0]];
  const run = (m) => { let s=[1],t=0; while(t<1-1e-9){s=integrate(deriv,s,0.05,m);t+=0.05;} return Math.abs(s[0]-Math.exp(-1)); };
  assert.ok(run('rk4') < run('euler'));
});

test('rk4 conserves energy of a harmonic oscillator', () => {
  const deriv = (s) => [s[1], -s[0]];
  let s = [1, 0]; const E0 = 0.5 * (s[0]**2 + s[1]**2);
  for (let t = 0; t < 10; t += 0.01) s = integrate(deriv, s, 0.01, 'rk4');
  const E = 0.5 * (s[0]**2 + s[1]**2);
  assert.ok(Math.abs(E - E0) / E0 < 0.01, `drift=${Math.abs(E-E0)/E0}`);
});
