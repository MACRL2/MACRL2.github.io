import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AXIS_TREE, LEAVES, SYSTEMS, ROOTS,
  defaultWeights, coeffs, project, spread, backProject, leavesOf, pathTo,
} from '../static/demos/robot-learning-map-data.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('the tree resolves to the five atomic axes', () => {
  assert.deepEqual(leavesOf(ROOTS.x), ['modeling', 'reference']);
  assert.deepEqual(leavesOf(ROOTS.y), ['obs', 'act', 'dynamics']);
  assert.deepEqual([...leavesOf(ROOTS.x), ...leavesOf(ROOTS.y)].sort(), [...LEAVES].sort());
});

test('pathTo walks from the headline axis down to a leaf', () => {
  assert.deepEqual(pathTo('act', ROOTS.y), ['complexity', 'embodiment', 'act']);
  assert.equal(pathTo('modeling', ROOTS.y), null);
});

test('axis coefficients are a convex combination of the leaves', () => {
  const w = defaultWeights();
  for (const id of Object.keys(AXIS_TREE)) {
    const c = coeffs(id, w);
    const sum = LEAVES.reduce((a, l) => a + c[l], 0);
    close(sum, 1);
    assert.ok(LEAVES.every((l) => c[l] >= 0));
  }
});

test('the mix slider sweeps the axis between its two children', () => {
  const s = { modeling: 0.9, reference: 0.1, obs: 0, act: 0, dynamics: 0 };
  const w = defaultWeights();
  w.supervision = 0;
  close(project(s, coeffs('supervision', w)), 0.9);
  w.supervision = 1;
  close(project(s, coeffs('supervision', w)), 0.1);
  w.supervision = 0.5;
  close(project(s, coeffs('supervision', w)), 0.5);
});

test('spread is exactly the interval the projection hides', () => {
  const s = { modeling: 0, reference: 0, obs: 0.9, act: 0.2, dynamics: 0.5 };
  assert.deepEqual(spread(s, 'complexity'), [0.2, 0.9]);
  assert.deepEqual(spread(s, 'dynamics'), [0.5, 0.5]);
});

test('backProject moves a system by the requested delta, minimally', () => {
  const w = defaultWeights();
  const c = coeffs('supervision', w);
  const s = { modeling: 0.4, reference: 0.4, obs: 0, act: 0, dynamics: 0 };
  const next = { ...s, ...backProject(s, c, 0.2) };
  close(project(next, c) - project(s, c), 0.2);
  assert.deepEqual(Object.keys(backProject(s, c, 0.2)).sort(), ['modeling', 'reference']);
  // untouched leaves stay untouched
  assert.equal(next.dynamics, 0);
});

test('backProject clamps to the unit box', () => {
  const c = coeffs('dynamics', defaultWeights());
  const s = { modeling: 0, reference: 0, obs: 0, act: 0, dynamics: 0.9 };
  assert.equal(backProject(s, c, 0.5).dynamics, 1);
  assert.equal(backProject(s, c, -2).dynamics, 0);
});

test('every seeded system carries all five coordinates in range', () => {
  const ids = new Set();
  for (const s of SYSTEMS) {
    assert.ok(s.id && s.label && s.group, `incomplete entry: ${JSON.stringify(s)}`);
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
    for (const l of LEAVES) {
      assert.equal(typeof s[l], 'number', `${s.id} missing ${l}`);
      assert.ok(s[l] >= 0 && s[l] <= 1, `${s.id}.${l} out of range`);
    }
  }
});
