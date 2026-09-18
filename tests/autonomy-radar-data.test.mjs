import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AXES, ROOT_IDS, MAX_DEPTH,
  visibleAxes, openGroups, childrenOf, parentOf, pathOf, depthOf, canExpand, rootOf,
  codeOf, displayOf, isNamed, angleFor, angleDelta, hueOf, colorOf, sampleValue,
} from '../static/demos/autonomy-radar-data.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('an axis id is its own path', () => {
  assert.equal(parentOf('sa.1.2'), 'sa.1');
  assert.equal(parentOf('sa'), null);
  assert.equal(depthOf('sa.1.2'), 3);
  assert.deepEqual(childrenOf('sa.1'), ['sa.1.1', 'sa.1.2']);
  assert.deepEqual(pathOf('sa.1.2'), ['sa', 'sa.1', 'sa.1.2']);
});

test('unnamed axes fall back to a readable code', () => {
  assert.equal(displayOf('tc'), 'Task Complexity');
  assert.equal(codeOf('tc.1'), 'TC.1');
  assert.ok(isNamed('sa'), 'the roots are always named');
  // whichever axes have been named by now, an unnamed one still shows its code
  const unnamed = ['sa.2.2.1', 'sa.1.1.2', 'tc.2.2.1'].find((id) => !AXES[id]);
  assert.ok(unnamed, 'the tree is deeper than the names');
  assert.ok(!isNamed(unnamed));
  assert.equal(displayOf(unnamed), codeOf(unnamed));
  assert.match(displayOf(unnamed), /^(TC|SA)(\.\d)+$/);
});

test('a named axis shows its name', () => {
  for (const [id, def] of Object.entries(AXES)) {
    if (!def.label) continue;
    assert.equal(displayOf(id), def.label);
    assert.ok(isNamed(id));
    assert.equal(rootOf(id), id.split('.')[0], 'named ids stay on their lineage');
  }
});

test('the wheel opens on exactly the two qualities', () => {
  assert.deepEqual(visibleAxes(new Set()), ROOT_IDS);
});

test('splitting one axis makes a three-pronged wheel', () => {
  const vis = visibleAxes(new Set(['sa']));
  assert.deepEqual(vis, ['tc', 'sa.1', 'sa.2']);
  assert.equal(vis.length, 3);
});

test('splits nest and keep depth-first order', () => {
  assert.deepEqual(visibleAxes(new Set(['tc', 'tc.2'])), ['tc.1', 'tc.2.1', 'tc.2.2', 'sa']);
});

test('the tree stops at MAX_DEPTH', () => {
  const deep = ['sa', 'sa.1', 'sa.1.1'];
  assert.equal(depthOf('sa.1.1.1'), MAX_DEPTH);
  assert.ok(!canExpand('sa.1.1.1'));
  const vis = visibleAxes(new Set([...deep, 'sa.1.1.1']));
  assert.ok(vis.includes('sa.1.1.1'), 'a maxed-out axis stays a visible leaf');
});

test('openGroups lists the families on screen, shallowest first', () => {
  assert.deepEqual(openGroups(new Set(['sa', 'sa.1'])), ['sa', 'sa.1']);
  // a family nobody can see (its parent is folded) is not a group
  assert.deepEqual(openGroups(new Set(['sa.1'])), []);
});

test('slot 0 points up and slots divide the circle evenly', () => {
  close(angleFor(0, 4), -Math.PI / 2);
  close(angleFor(1, 4) - angleFor(0, 4), Math.PI / 2);
  close(angleFor(2, 3) - angleFor(0, 3), (4 * Math.PI) / 3);
});

test('angleDelta takes the short way round', () => {
  close(angleDelta(0.1, 0.2), 0.1);
  close(angleDelta(3.0, -3.0), 2 * Math.PI - 6.0);
  assert.ok(Math.abs(angleDelta(-3.1, 3.1)) < Math.PI);
});

test('color encodes lineage: siblings split their parent hue, families stay apart', () => {
  // hue is a circle, so compare the short way round
  const apart = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  assert.ok(apart(hueOf('tc'), hueOf('sa')) > 90, 'roots are plainly different colors');
  for (const root of ROOT_IDS) {
    const [a, b] = childrenOf(root).map(hueOf);
    assert.notEqual(a, b);
    assert.ok(apart(a, hueOf(root)) < 40 && apart(b, hueOf(root)) < 40,
      'children stay in the family');
    // and grandchildren separate less than children do
    const spreadChild = apart(a, hueOf(root));
    const [ga] = childrenOf(`${root}.1`).map(hueOf);
    assert.ok(apart(ga, a) < spreadChild, 'the split narrows with depth');
  }
  assert.match(colorOf('sa.1', false), /^oklch\(/);
  assert.notEqual(colorOf('sa.1', false), colorOf('sa.1', true), 'light and dark differ');
});

test('placeholder readings are deterministic and inside the wheel', () => {
  for (const id of ['tc', 'sa.1', 'sa.2.1.2']) {
    const v = sampleValue(id);
    assert.equal(v, sampleValue(id));
    assert.ok(v > 0.3 && v < 0.95);
  }
});
