import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AXES, ROOT_IDS, MAX_DEPTH,
  visibleAxes, openGroups, childrenOf, parentOf, pathOf, depthOf, canExpand, rootOf,
  codeOf, displayOf, isNamed, angleFor, angleDelta, hueOf, colorOf,
  METHOD_IDS, METHODS, readingOf, setReading, hasFinerReading, methodColor,
  readingsBlock, sortIds,
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

test('every method is scored on the named leaves', () => {
  assert.deepEqual(METHOD_IDS, Object.keys(METHODS));
  for (const m of METHOD_IDS) {
    const { label, hue, scores } = METHODS[m];
    assert.ok(label && typeof hue === 'number');
    assert.ok(Object.keys(scores).length >= 4, `${m} says something`);
    for (const [id, v] of Object.entries(scores)) {
      assert.ok(v >= 0 && v <= 1, `${m}.${id} is a reading`);
      assert.ok(ROOT_IDS.includes(rootOf(id)), 'scored on a real lineage');
      assert.ok(depthOf(id) <= MAX_DEPTH);
    }
  }
  assert.match(methodColor('vla', false), /^oklch\(/);
  assert.notEqual(methodColor('vla', false), methodColor('vla', true));
  assert.notEqual(methodColor('vla', false), methodColor('rl', false));
});

test('a stored reading is used as-is', () => {
  const s = { 'tc.1.1': 0.8 };
  assert.equal(readingOf(s, 'tc.1.1'), 0.8);
  assert.ok(hasFinerReading(s, 'tc.1'));
  assert.ok(!hasFinerReading(s, 'tc.1.1'), 'strictly below, not itself');
});

test('a parent averages the readings under it', () => {
  const s = { 'tc.1.1': 0.8, 'tc.1.2': 0.4 };
  close(readingOf(s, 'tc.1'), 0.6);
  // tc.2 says nothing at any depth, so tc itself falls back
  close(readingOf(s, 'tc', 0.5), (0.6 + 0.5) / 2);
});

test('an unscored axis inherits its nearest scored ancestor', () => {
  const s = { 'sa.1': 0.8 };
  assert.equal(readingOf(s, 'sa.1.2'), 0.8);
  assert.equal(readingOf(s, 'sa.1.2.1'), 0.8, 'all the way down');
  assert.equal(readingOf(s, 'sa.2', 0.25), 0.25, 'nothing to inherit → fallback');
});

test('splitting an axis never moves a silhouette by itself', () => {
  for (const m of METHOD_IDS) {
    const s = METHODS[m].scores;
    for (const id of ['tc', 'tc.1', 'sa', 'sa.1']) {
      const [a, b] = childrenOf(id);
      close(readingOf(s, id), (readingOf(s, a) + readingOf(s, b)) / 2);
    }
  }
});

test('dragging a handle is pure and drops the readings below it', () => {
  const before = { 'tc.1.1': 0.8, 'tc.1.2': 0.4, 'sa.1': 0.3 };
  const after = setReading(before, 'tc.1', 0.9);
  assert.deepEqual(before, { 'tc.1.1': 0.8, 'tc.1.2': 0.4, 'sa.1': 0.3 }, 'input untouched');
  assert.deepEqual(after, { 'sa.1': 0.3, 'tc.1': 0.9 });
  assert.equal(readingOf(after, 'tc.1'), 0.9, 'the handle lands where it was dragged');
  assert.equal(readingOf(after, 'tc.1.1'), 0.9, 'and its children now follow it');
  // out-of-range drags are clamped, and a sibling family is left alone
  assert.equal(readingOf(setReading(before, 'tc.1.1', 2), 'tc.1.1'), 1);
  assert.equal(readingOf(setReading(before, 'tc.1.1', -1), 'tc.1.1'), 0);
  assert.equal(setReading(before, 'tc.1.1', 0.5)['tc.1.2'], 0.4);
});

test('sortIds walks the roots in order, then each lineage depth-first', () => {
  assert.deepEqual(sortIds(['sa.1', 'tc.2.1', 'tc', 'sa']), ['tc', 'tc.2.1', 'sa', 'sa.1']);
});

test('readingsBlock round-trips: every reading appears, keyed by id', () => {
  const block = readingsBlock({ vla: { 'tc.1.1': 0.8 }, rl: { 'sa.2': 0.25 } });
  assert.match(block, /vla: \{/);
  assert.match(block, /'tc\.1\.1':\s+0\.80,\s+\/\/ Observability/);
  assert.match(block, /'sa\.2':\s+0\.25,\s+\/\/ Self-supervising/);
});
