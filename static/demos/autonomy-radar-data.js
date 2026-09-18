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
 * descendant derives both. Anything absent here is synthesized and shows as its
 * code, so naming an axis is one line keyed by its id:
 *
 *   'sa.1.2': { label: 'Reset Cost', blurb: 'what it takes to try again' },
 *
 * `blurb` is optional — it only feeds the hover tooltip.
 */
export const AXES = {
  tc: {
    code: 'TC',
    label: 'Task Complexity',
    hue: 250,
    blurb: 'How much problem there is to solve.',
  },
  'tc.1': { label: 'Actor Capability' },
  'tc.1.1': { label: 'Observability' },
  'tc.1.2': { label: 'Decision Authority' },
  'tc.2': { label: 'Environment Complexity' },
  'tc.2.1': { label: 'Horizon' },
  'tc.2.2': { label: 'Dynamics' },

  sa: {
    code: 'SA',
    label: 'System Autonomy',
    hue: 35,
    blurb: 'How much of the solving the system does without us.',
  },
  'sa.1': { label: 'Data Availability' },
  'sa.2': { label: 'Self-supervising' },
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

/* ── Methods on the wheel ──────────────────────────────────────────────────
 *
 * A method is a silhouette: one reading in [0,1] per axis, meaning how much of
 * that axis the method can absorb — how much observability it copes with, how
 * much of the data it supplies itself. Readings are stored at whatever depth
 * the claim was actually made at, and every other axis is derived:
 *
 *   - an axis with a stored reading uses it;
 *   - an axis with stored readings *below* it averages its two children
 *     (so splitting an axis never moves the silhouette by itself);
 *   - anything else inherits the nearest ancestor that has one.
 *
 * So the wheel can be split to any depth and every method still has a value on
 * every spoke. Dragging a handle calls `setReading`, which drops the readings
 * underneath that axis — the claim you just made is now the finest one there.
 */

export const METHOD_IDS = ['vla', 'rl'];

export const METHODS = {
  vla: {
    label: 'VLA',
    full: 'Vision-language-action models',
    hue: 330,
    blurb: 'One network from pixels and words to motor commands, trained on human demonstrations.',
    scores: {
      'tc.1.1': 0.80,   // Observability — raw pixels + language is the native input
      'tc.1.2': 0.55,   // Decision Authority — acts end to end, inside a demonstrated envelope
      'tc.2.1': 0.35,   // Horizon — long-horizon drift is the standing failure
      'tc.2.2': 0.40,   // Dynamics — contact-rich, fast dynamics are thin in demonstrations
      'sa.1': 0.25,     // Data Availability — needs an enormous teleoperated corpus
      'sa.2': 0.20,     // Self-supervising — no signal of its own to improve against
    },
  },
  rl: {
    label: 'RL',
    full: 'Reinforcement learning',
    hue: 155,
    blurb: 'A reward and a rollout budget: the policy finds the behavior by trying.',
    scores: {
      'tc.1.1': 0.40,   // Observability — partial observation needs heavy engineering
      'tc.1.2': 0.78,   // Decision Authority — full closed-loop authority by construction
      'tc.2.1': 0.55,   // Horizon — credit assignment is hard, but this is the tool for it
      'tc.2.2': 0.82,   // Dynamics — thrives where the dynamics are fast and simulable
      'sa.1': 0.80,     // Data Availability — generates its own experience
      'sa.2': 0.68,     // Self-supervising — improves on its own, once someone writes the reward
    },
  },
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Does `scores` say anything strictly below `id`? */
export const hasFinerReading = (scores, id) =>
  Object.keys(scores).some((k) => k.startsWith(`${id}.`));

/** The reading a method shows on `id`, derived per the rules above. */
export function readingOf(scores, id, fallback = 0.5) {
  if (id in scores) return scores[id];
  if (canExpand(id) && hasFinerReading(scores, id)) {
    const [a, b] = childrenOf(id);
    return (readingOf(scores, a, fallback) + readingOf(scores, b, fallback)) / 2;
  }
  for (const anc of pathOf(id).slice(0, -1).reverse()) if (anc in scores) return scores[anc];
  return fallback;
}

/**
 * Claim `value` on `id`. Pure: returns new scores. Readings below `id` are
 * dropped, so the handle lands exactly where it was dragged and everything
 * underneath inherits it.
 */
export function setReading(scores, id, value) {
  const next = {};
  for (const [k, v] of Object.entries(scores)) {
    if (k !== id && !k.startsWith(`${id}.`)) next[k] = v;
  }
  next[id] = clamp01(value);
  return next;
}

/** Method color — its own layer, deliberately off the axes' two lineages. */
export function methodColor(id, dark = false) {
  const hue = METHODS[id]?.hue ?? 320;
  return dark ? `oklch(0.815 0.155 ${hue})` : `oklch(0.545 0.180 ${hue})`;
}

/** Roots in ROOT_IDS order, then depth-first down each lineage. */
export function sortIds(ids) {
  const rank = (id) => ROOT_IDS.indexOf(rootOf(id));
  return [...ids].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The `scores` literals, ready to paste back over the ones above — the same
 * re-argue-the-placements loop the projection map uses.
 */
export function readingsBlock(readings) {
  const lines = [];
  for (const m of METHOD_IDS) {
    const scores = readings[m] || readings.get?.(m) || {};
    lines.push(`  ${m}: {`, `    // ...keep label / full / hue / blurb as they are`, '    scores: {');
    for (const id of sortIds(Object.keys(scores))) {
      const pad = `'${id}':`.padEnd(12);
      lines.push(`      ${pad} ${scores[id].toFixed(2)},   // ${displayOf(id)}`);
    }
    lines.push('    },', '  },');
  }
  return lines.join('\n');
}
