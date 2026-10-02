import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitVolume, movesOf, anglesFor, MOVE } from '../static/demos/capability-volume-spec.js';
import { areaOf, fitTo } from '../static/demos/volume-math.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

// What build.py emits for a front-matter `volume:` or a ```volume fence.
const DAGGER = {
  from: 'Behavior cloning',
  to: 'DAgger',
  axes: [['Distribution shift', 0.45, 1.7], ['Horizon', 0.6, 1.35], ['Expert independence', 1.7, 0.4]],
};

test('the build output reads back in order', () => {
  const v = unitVolume(DAGGER);
  assert.deepEqual(v.errors, []);
  assert.equal(v.from, 'Behavior cloning');
  assert.equal(v.to, 'DAgger');
  assert.deepEqual(v.axes.map((a) => a.key), ['Distribution shift', 'Horizon', 'Expert independence']);
  assert.deepEqual(v.axes.map((a) => [a.before, a.after]), [[0.45, 1.7], [0.6, 1.35], [1.7, 0.4]]);
});

test('hand-written params are accepted too: a mapping, and one number for "unchanged"', () => {
  const v = unitVolume({ axes: { Compute: [2, 1], 'Data Availability': [1, 2], Safety: 1.2 } });
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.axes.map((a) => [a.label, a.before, a.after]),
    [['Compute', 2, 1], ['Data Availability', 1, 2], ['Safety', 1.2, 1.2]]);
});

test('a wheel axis lends its name and lineage; any other name stands alone', () => {
  const v = unitVolume({ axes: [['tc.2.1', 1, 2], ['data availability', 2, 1], ['Expert time', 1, 1]] });
  assert.deepEqual(v.axes.map((a) => a.id), ['tc.2.1', 'sa.1', null]);
  assert.deepEqual(v.axes.map((a) => a.label), ['Horizon', 'Data Availability', 'Expert time']);
});

test('bad axes are reported and dropped, never thrown', () => {
  const v = unitVolume({ axes: [['A', 1, 2], ['B', 0, 1], ['', 1, 1], ['C', 'x', 1], ['D', 2, 1]] });
  assert.deepEqual(v.axes.map((a) => a.key), ['A', 'D']);
  assert.equal(v.errors.length, 3, v.errors.join(' | '));
  assert.ok(unitVolume({ axes: [['A', 1, 2]] }).errors.some((e) => /at least two/.test(e)));
  assert.ok(unitVolume({}).errors.length > 0, 'no axes at all');
});

test('before and after are drawn at the same volume', () => {
  const v = unitVolume(DAGGER);
  const angles = anglesFor(v.axes.length);
  const A = 1234;
  close(areaOf(angles, fitTo(angles, v.axes.map((a) => a.before), A)), A);
  close(areaOf(angles, fitTo(angles, v.axes.map((a) => a.after), A)), A);
});

test('the caption reads where the volume went', () => {
  const { rows, gains, pays } = movesOf(unitVolume(DAGGER));
  assert.deepEqual(gains, ['Distribution shift', 'Horizon']);
  assert.deepEqual(pays, ['Expert independence']);
  // shares are at one volume, so what was gained was paid for somewhere
  assert.ok(rows.some((r) => r.delta > MOVE) && rows.some((r) => r.delta < -MOVE));
});

test('scaling a whole shape says nothing: the volume is fixed', () => {
  const v = unitVolume({ axes: [['A', 1, 3], ['B', 2, 6], ['C', 1.5, 4.5]] });
  const { gains, pays, rows } = movesOf(v);
  assert.deepEqual(gains, []);
  assert.deepEqual(pays, []);
  rows.forEach((r) => close(r.was, r.now));
});

test('spokes start straight up and go clockwise', () => {
  const a = anglesFor(4);
  close(a[0], -Math.PI / 2);
  close(a[1], 0);
});
