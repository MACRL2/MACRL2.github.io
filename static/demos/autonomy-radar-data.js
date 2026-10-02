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

/** The axes the wheel opens on: every family whose children have names is split. */
export function namedFrontier() {
  return new Set(Object.keys(AXES).filter((id) => canExpand(id) && childrenOf(id).some(isNamed)));
}

/**
 * Find an axis by id ('tc.2.1') or by name ('Horizon', any case). The per-unit
 * volumes use this, so a unit that moves along a wheel axis can say so and pick
 * up its name and its lineage color. Returns the id, or null.
 */
export function axisFor(key) {
  const k = String(key).trim();
  if (/^[a-z]+(\.[12])*$/.test(k) && ROOT_IDS.includes(rootOf(k)) && depthOf(k) <= MAX_DEPTH) return k;
  const want = k.toLowerCase();
  return Object.keys(AXES).find((id) => labelOf(id)?.toLowerCase() === want) || null;
}

/* ── Systems on the wheel ──────────────────────────────────────────────────
 *
 * Only a SYSTEM gets a volume — one robot, one dataset, one budget, actually
 * built. A method as an idea has no edge to it: give RL an unlimited reward,
 * simulator and budget and it encloses every axis, which says nothing. A
 * system is where that unlimited idea met a finite engineering effort, and
 * that effort is the volume.
 *
 * The volume is the same for every system. The wheel rescales each shape to a
 * fixed area (volume-math.js), so a system's readings say only where its
 * capability sits, never how much of it there is. Readings are relative
 * weights: positive, unbounded, any scale — doubling every reading changes
 * nothing. Like the axes, they are stored at whatever depth the claim was made
 * at, and every other axis is derived:
 *
 *   - an axis with a stored reading uses it;
 *   - an axis with stored readings *below* it averages its two children;
 *   - anything else inherits the nearest ancestor that has one.
 *
 * Dragging a handle calls `setReading`, which drops the readings underneath
 * that axis — the claim you just made is now the finest one there.
 */

export const SYSTEM_IDS = ['pi0', 'anymal', 'atlas', 'waymo'];

export const SYSTEMS = {
  pi0: {
    label: 'π0',
    full: 'π0, Physical Intelligence (2024)',
    method: 'vision-language-action model',
    hue: 330,
    blurb: 'Folds laundry and buses tables from camera images and a sentence, learned from ~10k hours of teleoperated robot data.',
    scores: {
      'tc.1.1': 1.80,   // Observability — cluttered homes, from pixels and words
      'tc.1.2': 1.00,   // Decision Authority — end to end, inside a demonstrated envelope
      'tc.2.1': 1.15,   // Horizon — minutes-long chores, with drift the standing failure
      'tc.2.2': 0.50,   // Dynamics — slow, quasi-static manipulation
      'sa.1': 0.35,     // Data Availability — every hour of it teleoperated by people
      'sa.2': 0.30,     // Self-supervising — no signal of its own to improve against
    },
  },
  anymal: {
    label: 'ANYmal parkour',
    full: 'ANYmal parkour, ETH Zürich (2024)',
    method: 'reinforcement learning in simulation',
    hue: 140,
    blurb: 'A quadruped that climbs, jumps and crawls through an obstacle course, with every skill trained by RL in simulation.',
    scores: {
      'tc.1.1': 0.55,   // Observability — a geometric height map, nothing semantic
      'tc.1.2': 1.45,   // Decision Authority — closed-loop, joint-level, its own
      'tc.2.1': 0.75,   // Horizon — seconds of agility, stitched by a navigation module
      'tc.2.2': 1.90,   // Dynamics — jumps and climbs, through contact
      'sa.1': 1.60,     // Data Availability — as much simulated experience as compute buys
      'sa.2': 1.30,     // Self-supervising — improves against its reward, once one is written
    },
  },
  atlas: {
    label: 'Atlas parkour',
    full: 'Atlas parkour, Boston Dynamics (2021)',
    method: 'trajectory optimization + model-predictive control',
    hue: 85,
    blurb: 'Vaults, flips and jumps along an obstacle course, from a library of behaviors optimized offline and tracked with MPC online.',
    scores: {
      'tc.1.1': 0.55,   // Observability — sees enough of a known course to place itself on it
      'tc.1.2': 0.90,   // Decision Authority — MPC adapts each behavior; people choose the behaviors
      'tc.2.1': 0.80,   // Horizon — a choreographed run, a few seconds per behavior
      'tc.2.2': 2.10,   // Dynamics — whole-body flips and vaults, the hardest on this wheel
      'sa.1': 0.85,     // Data Availability — needs a model, not data, and engineers write the model
      'sa.2': 0.30,     // Self-supervising — every new behavior is engineered
    },
  },
  waymo: {
    label: 'Waymo Driver',
    full: 'Waymo Driver, Waymo (2024)',
    method: 'modular stack with learned perception and prediction',
    hue: 205,
    blurb: 'Fully driverless ride-hailing on city streets: learned perception and behavior prediction inside an engineered planning stack.',
    scores: {
      'tc.1.1': 1.55,   // Observability — lidar, camera and radar on open streets
      'tc.1.2': 1.35,   // Decision Authority — no one in the driver's seat, within a mapped domain
      'tc.2.1': 1.50,   // Horizon — whole trips
      'tc.2.2': 0.55,   // Dynamics — a car, driven well inside its limits
      'sa.1': 1.00,     // Data Availability — a fleet's logs, curated and labeled at scale
      'sa.2': 0.45,     // Self-supervising — improves through engineering and simulation
    },
  },
};

/** Readings below this are clamped up to it, so every axis keeps a sliver of the volume. */
export const MIN_READING = 0.02;

/** Does `scores` say anything strictly below `id`? */
export const hasFinerReading = (scores, id) =>
  Object.keys(scores).some((k) => k.startsWith(`${id}.`));

/** The reading a system shows on `id`, derived per the rules above. */
export function readingOf(scores, id, fallback = 1) {
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
  next[id] = Math.max(MIN_READING, value);
  return next;
}

/**
 * Multiply every reading by one factor so the axes in `ids` average 1. The
 * shape — and so the volume — is unchanged; the numbers just stay readable.
 */
export function rescaleReadings(scores, ids) {
  const mean = ids.reduce((s, id) => s + readingOf(scores, id), 0) / Math.max(1, ids.length);
  if (!(mean > 0)) return { ...scores };
  return Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v / mean]));
}

/** System color — for its swatch and its outline when comparing; kept off the axes' lineage hues. */
export function systemColor(id, dark = false) {
  const hue = typeof id === 'number' ? id : SYSTEMS[id]?.hue ?? 320;
  return dark ? `oklch(0.815 0.140 ${hue})` : `oklch(0.545 0.165 ${hue})`;
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
  for (const m of SYSTEM_IDS) {
    const scores = readings[m] || readings.get?.(m) || {};
    lines.push(`  ${m}: {`, `    // ...keep label / full / method / hue / blurb as they are`, '    scores: {');
    for (const id of sortIds(Object.keys(scores))) {
      const pad = `'${id}':`.padEnd(12);
      lines.push(`      ${pad} ${scores[id].toFixed(2)},   // ${displayOf(id)}`);
    }
    lines.push('    },', '  },');
  }
  return lines.join('\n');
}
