// autonomy-radar-data.js — the axis tree behind the radar on the landing page.
//
// PURE MODULE: no window/document, no browser-absolute imports, so
// `tests/autonomy-radar-data.test.mjs` imports it directly in Node.
//
// ── The scheme ────────────────────────────────────────────────────────────
// Two root axes. Every axis splits into exactly two children, forever, and an
// axis id IS its path: 'sa' → 'sa.1' → 'sa.1.2'. Anything not named below is
// synthesized on demand and displays as its code (SA.1.2), so the structure can
// be explored before the names exist. To name an axis, add one line to AXES
// keyed by its id — nothing else changes.

export const ROOT_IDS = ['tc', 'sa'];

/** How deep the tree may be explored (root = depth 1). */
export const MAX_DEPTH = 4;

/**
 * Named axes. Roots carry a `code` and a `hue` (the lineage color); every
 * descendant derives both. Add entries as the set of axes settles:
 *
 *   'sa.1': { label: 'Decision Authority', blurb: 'who chooses the next action' },
 */
export const AXES = {
  tc: {
    code: 'TC',
    label: 'Task Complexity',
    hue: 250,
    blurb: 'How much problem there is to solve.',
  },
  sa: {
    code: 'SA',
    label: 'System Autonomy',
    hue: 35,
    blurb: 'How much of the solving the system does without us.',
  },
};

export const parentOf = (id) => (id.includes('.') ? id.slice(0, id.lastIndexOf('.')) : null);
export const rootOf = (id) => id.split('.')[0];
export const depthOf = (id) => id.split('.').length;
export const childrenOf = (id) => [`${id}.1`, `${id}.2`];
export const canExpand = (id) => depthOf(id) < MAX_DEPTH;

/** Ancestors from the root down to `id`, inclusive. */
export function pathOf(id) {
  const parts = id.split('.');
  return parts.map((_, i) => parts.slice(0, i + 1).join('.'));
}

/** 'sa.1.2' → 'SA.1.2' — the handle an unnamed axis goes by. */
export function codeOf(id) {
  const [root, ...rest] = id.split('.');
  return [AXES[root]?.code || root.toUpperCase(), ...rest].join('.');
}

export const labelOf = (id) => AXES[id]?.label || null;
export const isNamed = (id) => !!labelOf(id);
export const displayOf = (id) => labelOf(id) || codeOf(id);
export const blurbOf = (id) => AXES[id]?.blurb || '';

/**
 * The axes currently drawn: a depth-first walk that stops at any node the
 * viewer has not expanded. Order is stable, so a split only ever inserts.
 */
export function visibleAxes(expanded, roots = ROOT_IDS) {
  const out = [];
  (function walk(id) {
    if (expanded.has(id) && canExpand(id)) childrenOf(id).forEach(walk);
    else out.push(id);
  })(roots[0]);
  for (const r of roots.slice(1)) {
    (function walk(id) {
      if (expanded.has(id) && canExpand(id)) childrenOf(id).forEach(walk);
      else out.push(id);
    })(r);
  }
  return out;
}

/** Expanded nodes that are actually on screen, shallowest first. */
export function openGroups(expanded, roots = ROOT_IDS) {
  const vis = new Set(visibleAxes(expanded, roots));
  const groups = [];
  for (const id of expanded) {
    if (!canExpand(id)) continue;
    const covers = [...vis].some((v) => v === id || v.startsWith(`${id}.`));
    if (covers) groups.push(id);
  }
  return groups.sort((a, b) => depthOf(a) - depthOf(b) || (a < b ? -1 : 1));
}

/** Spoke angle for slot i of n, with slot 0 pointing straight up. */
export const angleFor = (i, n) => -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);

/** Shortest signed rotation from a to b, in (-π, π]. */
export function angleDelta(a, b) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Lineage color. Siblings split their parent's hue by a gap that halves with
 * depth, so a family stays recognizably one color while every axis is its own.
 * Lightness/chroma are picked per theme against the site's warm paper ground.
 */
export function hueOf(id) {
  const parts = id.split('.');
  let hue = AXES[parts[0]]?.hue ?? 250;
  for (let d = 1; d < parts.length; d++) {
    const dir = parts[d] === '1' ? -1 : 1;
    hue += dir * (28 / Math.pow(1.9, d - 1));
  }
  return ((hue % 360) + 360) % 360;
}

export function colorOf(id, dark = false) {
  const d = Math.min(depthOf(id), 5);
  const L = dark ? 0.82 - 0.035 * (d - 1) : 0.50 + 0.045 * (d - 1);
  const C = (dark ? 0.135 : 0.145) - 0.016 * (d - 1);
  return `oklch(${L.toFixed(3)} ${Math.max(C, 0.05).toFixed(3)} ${hueOf(id).toFixed(1)})`;
}

/**
 * A placeholder reading for the example silhouette — deterministic per axis so
 * the shape is stable across frames. Real problems and methods land here later.
 */
export function sampleValue(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 0.35 + ((h >>> 0) % 1000) / 1000 * 0.55;
}
