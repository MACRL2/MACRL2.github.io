// capability-volume-spec.js — what a unit's volume figure says, before it is drawn.
//
// PURE MODULE (relative imports only), so `tests/capability-volume-spec.test.mjs`
// imports it in Node. The figure itself is capability-volume.js.
//
// A unit configures its figure in one of two places, with one schema:
//
//   front-matter (drawn under the chapter title)     a fenced block (drawn in place)
//   ---                                               ```volume
//   volume:                                           from: Basic IRL
//     from: Behavior cloning                          to: MaxEnt IRL
//     to: DAgger                                      axes:
//     axes:                                             Ambiguity: [0.6, 1.6]
//       Distribution shift: [0.4, 1.7]                  Compute: [1.5, 0.7]
//       Expert independence: [1.6, 0.4]               ```
//       tc.2.1: [0.6, 1.4]
//   ---
//
// Each axis is `name: [before, after]` (or one number: unchanged), listed
// clockwise from the top. Values are relative weights, and both shapes are
// redrawn at the same volume — so a unit can only say where its capability
// moved, never that it grew. A name that is a landing-page axis ('Horizon', or
// its id 'tc.2.1') borrows that axis's name and lineage color.
import { axisFor, displayOf } from './autonomy-radar-data.js';
import { sharesOf } from './volume-math.js';

/** A share must move by more than this (×even) to count as gained or paid. */
export const MOVE = 0.12;

const num = (v) => (typeof v === 'number' ? v : Number(v));

/** [[name, before, after], …] from any of the accepted spellings. */
function entries(axes) {
  if (Array.isArray(axes)) {
    return axes.map((a) => (Array.isArray(a)
      ? (a.length === 2 ? [a[0], a[1], a[1]] : [a[0], a[1], a[2]])
      : [a.name ?? a.axis, a.from ?? a.before, a.to ?? a.after ?? a.from ?? a.before]));
  }
  if (axes && typeof axes === 'object') {
    return Object.entries(axes).map(([k, v]) => (Array.isArray(v) ? [k, v[0], v[1] ?? v[0]] : [k, v, v]));
  }
  return [];
}

/**
 * Normalize a unit's spec. Never throws: problems are collected in `errors`
 * (the figure shows them in place) and the bad axis is dropped.
 */
export function unitVolume(spec = {}) {
  const errors = [];
  const axes = [];
  for (const [key, b, a] of entries(spec.axes)) {
    const before = num(b), after = num(a);
    const name = String(key ?? '').trim();
    if (!name) { errors.push('an axis has no name'); continue; }
    if (!(before > 0) || !(after > 0)) {
      errors.push(`“${name}” needs two positive numbers, [before, after]`);
      continue;
    }
    const id = axisFor(name);
    axes.push({ key: name, id, label: id ? displayOf(id) : name, before, after });
  }
  if (axes.length < 2) errors.push('a volume needs at least two axes');
  return {
    from: spec.from ? String(spec.from) : '',
    to: spec.to ? String(spec.to) : '',
    note: spec.note ? String(spec.note) : '',
    axes,
    errors,
  };
}

/** Spoke angles for n axes, the first straight up, clockwise. */
export const anglesFor = (n) =>
  Array.from({ length: n }, (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / n);

/**
 * Where the volume went: each axis's share before and after (as multiples of
 * an even spread, both at the same volume), and which axes it moved toward and
 * away from. This is what the caption reads out.
 */
export function movesOf(vol) {
  const angles = anglesFor(vol.axes.length);
  const was = sharesOf(angles, vol.axes.map((a) => a.before));
  const now = sharesOf(angles, vol.axes.map((a) => a.after));
  const rows = vol.axes.map((a, i) => ({ ...a, was: was[i], now: now[i], delta: now[i] - was[i] }));
  return {
    rows,
    gains: rows.filter((r) => r.delta > MOVE).map((r) => r.label),
    pays: rows.filter((r) => r.delta < -MOVE).map((r) => r.label),
  };
}
