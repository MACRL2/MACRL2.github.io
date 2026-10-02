// robot-learning-map-data.js — the axis tree, the systems, and the pure
// projection math behind the "state of robot learning" landing-page map.
//
// PURE MODULE: no window/document/getComputedStyle at any level, and no
// browser-absolute imports — so `tests/robot-learning-map-data.test.mjs` can
// import it directly in Node. Keep it that way.
//
// ── Editing the map ───────────────────────────────────────────────────────
// Every system is scored on the FIVE LEAF axes only (each in [0, 1]); the
// headline axes shown on the plot are projections computed from those. To
// place a method, add an entry to SYSTEMS below with:
//
//   modeling   0 = nothing hand-built   → 1 = the model/reward/plan IS the method
//   reference  0 = no human data        → 1 = the method is its demonstrations
//   obs        0 = a few known states   → 1 = raw high-bandwidth open-world sensing
//   act        0 = one or two DoF       → 1 = many DoF, coordinated, high-rate
//   dynamics   0 = quasi-static, short  → 1 = contact-rich, underactuated, long-horizon
//
// Coordinates here are a FIRST PASS meant to be argued with — move them.

/** The axis tree. Internal nodes project onto their two children. */
export const AXIS_TREE = {
  supervision: {
    id: 'supervision', label: 'Manual Supervision', short: 'supervision',
    children: ['modeling', 'reference'],
    blurb: 'Human effort the method consumes before it works — of either kind.',
  },
  modeling: {
    id: 'modeling', label: 'Modeling', short: 'modeling',
    blurb: 'Structure written down by hand: dynamics, rewards, plans, resets, calibration.',
  },
  reference: {
    id: 'reference', label: 'Reference Data', short: 'reference data',
    blurb: 'Behavior collected from humans: demonstrations, teleop, labels, preferences.',
  },
  complexity: {
    id: 'complexity', label: 'Task Complexity', short: 'complexity',
    children: ['embodiment', 'dynamics'],
    blurb: 'How hard the problem is once supervision is set aside.',
  },
  embodiment: {
    id: 'embodiment', label: 'Embodiment Complexity', short: 'embodiment',
    children: ['obs', 'act'],
    blurb: 'How much robot there is to see with and to move.',
  },
  obs: {
    id: 'obs', label: '|Observation|', short: 'observation',
    blurb: 'Width of what the policy must read — from four measured states to open-world video.',
  },
  act: {
    id: 'act', label: '|Action|', short: 'action',
    blurb: 'Width of what the policy must command — DoF, coordination, control rate.',
  },
  dynamics: {
    id: 'dynamics', label: 'Task Dynamics', short: 'dynamics',
    blurb: 'Contact, underactuation, horizon, stochasticity — the part the robot cannot slow down.',
  },
};

/** Leaf axis ids, in a fixed order (the coordinate order everywhere else). */
export const LEAVES = ['modeling', 'reference', 'obs', 'act', 'dynamics'];

/** The two headline axes the map opens on. */
export const ROOTS = { x: 'supervision', y: 'complexity' };

/** Default mix for every internal node: an even blend of its two children. */
export function defaultWeights(tree = AXIS_TREE) {
  const w = {};
  for (const n of Object.values(tree)) if (n.children) w[n.id] = 0.5;
  return w;
}

/** Depth-first list of leaf ids under `id` (a leaf returns itself). */
export function leavesOf(id, tree = AXIS_TREE) {
  const n = tree[id];
  if (!n) return [];
  if (!n.children) return [id];
  return n.children.flatMap((c) => leavesOf(c, tree));
}

/** Path of ids from a root down to `id`, inclusive. */
export function pathTo(id, rootId, tree = AXIS_TREE) {
  if (id === rootId) return [rootId];
  const n = tree[rootId];
  if (!n || !n.children) return null;
  for (const c of n.children) {
    const p = pathTo(id, c, tree);
    if (p) return [rootId, ...p];
  }
  return null;
}

/**
 * Coefficients of the linear functional an axis node represents, over LEAVES.
 * An internal node with mix w is (1-w)·childA + w·childB, so the coefficients
 * always form a convex combination (they sum to 1).
 */
export function coeffs(id, weights, tree = AXIS_TREE) {
  const out = {};
  for (const l of LEAVES) out[l] = 0;
  (function walk(nid, scale) {
    const n = tree[nid];
    if (!n) return;
    if (!n.children) { out[nid] += scale; return; }
    const w = weights[nid] ?? 0.5;
    walk(n.children[0], scale * (1 - w));
    walk(n.children[1], scale * w);
  })(id, 1);
  return out;
}

/** Where a system sits on an axis: the projection c·x. */
export function project(system, c) {
  let v = 0;
  for (const l of LEAVES) v += (c[l] || 0) * (system[l] ?? 0);
  return v;
}

/**
 * The interval a system's position sweeps as the subtree's mixes range over
 * everything — i.e. exactly what the projection hides. Because the projection
 * is convex over the subtree's leaves, the interval is [min leaf, max leaf].
 */
export function spread(system, id, tree = AXIS_TREE) {
  const ls = leavesOf(id, tree);
  const vs = ls.map((l) => system[l] ?? 0);
  return [Math.min(...vs), Math.max(...vs)];
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Move a system by `delta` along the axis with coefficients `c`, changing the
 * leaf coordinates as little as possible (minimum-norm update, then clamped).
 * Returns a new {leaf: value} object for the leaves the axis actually touches.
 */
export function backProject(system, c, delta) {
  let n2 = 0;
  for (const l of LEAVES) n2 += (c[l] || 0) ** 2;
  const out = {};
  if (n2 === 0) return out;
  for (const l of LEAVES) {
    if (!c[l]) continue;
    out[l] = clamp01((system[l] ?? 0) + (delta * c[l]) / n2);
  }
  return out;
}

/** Marker families. Kept to shape, not color — the site's palette is one accent. */
export const GROUPS = [
  { id: 'model', label: 'model-based / classical', shape: 'square' },
  { id: 'sim', label: 'RL in simulation → real', shape: 'triangle' },
  { id: 'real', label: 'RL / search on hardware', shape: 'diamond' },
  { id: 'imitation', label: 'imitation from demonstrations', shape: 'circle' },
  { id: 'generalist', label: 'large-scale generalist policies', shape: 'star' },
];

/**
 * FIRST-PASS placements. Every number is a claim; edit freely.
 * Fields: id, label, group, and the five leaf coordinates, plus an optional
 * one-line `note` shown on hover.
 */
export const SYSTEMS = [
  { id: 'lqr', label: 'LQR (cart-pole)', group: 'model',
    modeling: 1.00, reference: 0.00, obs: 0.05, act: 0.05, dynamics: 0.15,
    note: 'The model is the method; nothing is learned.' },
  { id: 'mrac', label: 'Adaptive control (MRAC)', group: 'model',
    modeling: 0.85, reference: 0.00, obs: 0.10, act: 0.15, dynamics: 0.40,
    note: 'Learns parameters online, inside a structure written by hand.' },
  { id: 'zmp', label: 'ZMP walking', group: 'model',
    modeling: 0.95, reference: 0.05, obs: 0.20, act: 0.50, dynamics: 0.60,
    note: 'Buys tractable dynamics by constraining the gait.' },
  { id: 'mpc-manip', label: 'MPC manipulation', group: 'model',
    modeling: 0.90, reference: 0.00, obs: 0.25, act: 0.35, dynamics: 0.45 },
  { id: 'atlas-mpc', label: 'Whole-body MPC', group: 'model',
    modeling: 0.90, reference: 0.10, obs: 0.35, act: 0.75, dynamics: 0.80,
    note: 'Atlas-class whole-body control: extreme dynamics, extreme modeling, an engineering team.' },
  { id: 'anymal-rl', label: 'Learned legged locomotion', group: 'sim',
    modeling: 0.55, reference: 0.05, obs: 0.25, act: 0.45, dynamics: 0.70,
    note: 'Supervision moves into the simulator: model, randomization, reward.' },
  { id: 'parallel-rl', label: 'Parallel sim RL', group: 'sim',
    modeling: 0.50, reference: 0.00, obs: 0.25, act: 0.45, dynamics: 0.65 },
  { id: 'dactyl', label: 'In-hand reorientation', group: 'sim',
    modeling: 0.50, reference: 0.05, obs: 0.40, act: 0.65, dynamics: 0.85,
    note: 'Trained in simulation, transferred by randomizing what the model got wrong.' },
  { id: 'drone-racing', label: 'Autonomous drone racing', group: 'sim',
    modeling: 0.60, reference: 0.05, obs: 0.30, act: 0.20, dynamics: 0.90 },
  { id: 'qt-opt', label: 'Real-world RL grasping', group: 'real',
    modeling: 0.20, reference: 0.25, obs: 0.70, act: 0.30, dynamics: 0.40,
    note: 'QT-Opt-class: the robot farm collects its own data, on hardware.' },
  { id: 'dreamer', label: 'Learned world models', group: 'real',
    modeling: 0.15, reference: 0.05, obs: 0.60, act: 0.30, dynamics: 0.50,
    note: 'Dreamer-class: the model is learned rather than written down.' },
  { id: 'bc', label: 'Behavior cloning', group: 'imitation',
    modeling: 0.05, reference: 0.60, obs: 0.50, act: 0.20, dynamics: 0.25 },
  { id: 'dagger', label: 'Interactive IL (DAgger)', group: 'imitation',
    modeling: 0.10, reference: 0.75, obs: 0.45, act: 0.25, dynamics: 0.35 },
  { id: 'diffusion-policy', label: 'Diffusion policy', group: 'imitation',
    modeling: 0.05, reference: 0.70, obs: 0.60, act: 0.35, dynamics: 0.50 },
  { id: 'aloha', label: 'Bimanual teleop IL (ALOHA)', group: 'imitation',
    modeling: 0.05, reference: 0.80, obs: 0.65, act: 0.60, dynamics: 0.60 },
  { id: 'vla', label: 'Vision-language-action', group: 'generalist',
    modeling: 0.05, reference: 0.95, obs: 0.90, act: 0.40, dynamics: 0.55,
    note: 'Breadth of observation bought entirely with reference data.' },
  { id: 'generalist', label: 'Generalist policies', group: 'generalist',
    modeling: 0.05, reference: 1.00, obs: 0.95, act: 0.60, dynamics: 0.65 },
];
