// chapter-map.js — the full chapter map as a DAG.
//
// The spine (intro → notation → primer) forks into the two branches, each rung
// linked to the next by the failure that motivates it, and the branches remerge
// into safety → evaluation → synthesis. Live chapters are solid and clickable;
// planned chapters are dashed. Hover a node for its summary, an edge label for
// the full "what breaks" hand-off. Data is transcribed from 06-road-ahead.md;
// keep the two in sync. All colors come from CSS custom properties.

// Lane geometry: spine centered, Branch A left, Branch B right. Branch A's three
// rungs space out to meet Branch B's four at the merge point.
const LANE = { S: { cx: 380, w: 240 }, A: { cx: 180, w: 280 }, B: { cx: 580, w: 280 } };
const NODE_H = 52;

const NODES = [
  { id: 'c0',  lane: 'S', y: 20,  num: '0',  title: 'Why Robot Learning', href: '/01-why-robot-learning/',
    tip: 'Introduction and motivation — where learning enters the control stack, and why the field split into two branches.' },
  { id: 'c1',  lane: 'S', y: 108, num: '1',  title: 'Notation & framing', href: '/02-notation-setup/',
    tip: 'Notation and the (loss, distribution) framing — the two questions this book asks of every method.' },
  { id: 'c2',  lane: 'S', y: 196, num: '2',  title: 'Online learning primer',
    tip: 'Statistical & online learning primer — regret as a design target.' },
  { id: 'a1',  lane: 'A', y: 316, num: '3',  title: 'A.1 · Behavior cloning', href: '/04-behavior-cloning/',
    tip: 'Cloning the Driver — supervised learning on demonstrations; offline metrics only weakly predict closed-loop performance.' },
  { id: 'a2',  lane: 'A', y: 464, num: '4',  title: 'A.2 · Interactive imitation', href: '/05-interactive-imitation/',
    tip: 'The Expert in the Passenger Seat — DAgger: label the states your policy visits; a reduction to no-regret online learning.' },
  { id: 'a3',  lane: 'A', y: 612, num: '5',  title: 'A.3 · Inverse RL',
    tip: 'Inverse RL and reward learning — recover the objective, so you can score plans nobody demonstrated and improve beyond the demonstrator.' },
  { id: 'b1',  lane: 'B', y: 316, num: '6',  title: 'B.1 · Models, trajopt, MPC',
    tip: 'Planning with a model — trajectory optimization, MPC, whole-body and reduced-order control. Very strong when the model is right.' },
  { id: 'b2',  lane: 'B', y: 428, num: '7',  title: 'B.2 · Learning dynamics',
    tip: 'Supervised system ID, then plan — fit the dynamics from logged transitions; residual models let physics do the heavy lifting.' },
  { id: 'b3',  lane: 'B', y: 540, num: '8',  title: 'B.3 · Iterative sys-ID & MBRL',
    tip: '"DAgger for dynamics" — refit on the distribution your own planner induces; the world provides the labels. This is model-based RL.' },
  { id: 'b4',  lane: 'B', y: 652, num: '9',  title: 'B.4 · RL in sim, sim-to-real',
    tip: 'End-to-end RL as amortized planning — massively parallel sim, domain randomization, distillation, and sim-to-real as the discipline.' },
  { id: 's10', lane: 'S', y: 760, num: '10', title: 'Safety as a layer',
    tip: 'Safety as a layer — filters, shields, and constraints wrapped around whichever policy the branches produced.' },
  { id: 's11', lane: 'S', y: 848, num: '11', title: 'Evaluation & deployment',
    tip: 'Closed-loop metrics, data engines, and the long tail — the part that decides whether any of it ships.' },
  { id: 's12', lane: 'S', y: 936, num: '12', title: 'Synthesis',
    tip: 'Choosing a method for a system you have never seen — combining both toolkits (this is where manipulators live).' },
];

// path: SVG path data. label/tip: the "what breaks" hand-off carried by the edge.
const EDGES = [
  { path: 'M380,72 L380,103',                    lane: 'S' },
  { path: 'M380,160 L380,191',                   lane: 'S' },
  { path: 'M380,248 C380,290 180,272 180,311',   lane: 'A' },  // fork
  { path: 'M380,248 C380,290 580,272 580,311',   lane: 'B' },  // fork
  { path: 'M180,368 L180,459',                   lane: 'A', label: 'compounding error', lx: 192, ly: 418,
    tip: 'Demonstrations contain no recovery behavior — a small deviation reaches an unfamiliar state, which produces a larger one. Plus multimodality, causal confusion, and the long tail.' },
  { path: 'M180,516 L180,607',                   lane: 'A', label: 'actions, not intent', lx: 192, ly: 566,
    tip: 'DAgger clones actions, needs the expert forever, and cannot evaluate a plan nobody demonstrated. A recovered cost fixes all three.' },
  { path: 'M580,368 L580,423',                   lane: 'B', label: 'the model is wrong', lx: 592, ly: 400,
    tip: 'Contact, friction, backlash, compliance — the analytic model misses what matters. Fit a correction from data.' },
  { path: 'M580,480 L580,535',                   lane: 'B', label: 'planner exploits error', lx: 592, ly: 512,
    tip: 'The optimizer searches for the lowest predicted cost — and low predicted cost is exactly what model error looks like where data is absent.' },
  { path: 'M580,592 L580,647',                   lane: 'B', label: 'contact & latent state', lx: 592, ly: 624,
    tip: 'Stiff contact defeats long-horizon prediction, latent state is unobservable, and the real-time budget forbids online optimization at kHz.' },
  { path: 'M180,664 C180,715 340,705 340,755',   lane: 'A' },  // merge
  { path: 'M580,704 C580,725 420,712 420,755',   lane: 'B' },  // merge
  { path: 'M380,812 L380,843',                   lane: 'S' },
  { path: 'M380,900 L380,931',                   lane: 'S' },
];

const LANE_HEADERS = [
  { lane: 'A', x: 180, y: 296, text: 'Branch A — semantically rich',
    tip: 'The vehicle is the easy part; semantics and objective are hard — and demonstrations are nearly free on the true embodiment. So learn from them.' },
  { lane: 'B', x: 580, y: 296, text: 'Branch B — unstable, contact-rich',
    tip: 'Open-loop unstable below human teleoperation bandwidth — no demonstrations. The objective is easy; the leverage is in the model.' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function nodeSvg(n) {
  const { cx, w } = LANE[n.lane];
  const x = cx - w / 2;
  const live = Boolean(n.href);
  const cls = `cm-node cm-lane-${n.lane} ${live ? 'is-live' : 'is-planned'}`;
  const body = `
    <g class="${cls}" data-tip="${esc(n.tip)}">
      <rect x="${x}" y="${n.y}" width="${w}" height="${NODE_H}" rx="8"></rect>
      <text class="cm-eyebrow" x="${x + 14}" y="${n.y + 20}">chapter ${n.num} · ${live ? 'live' : 'planned'}</text>
      <text class="cm-title" x="${x + 14}" y="${n.y + 40}">${esc(n.title)}</text>
    </g>`;
  return live ? `<a href="${n.href}" aria-label="Open chapter ${n.num}: ${esc(n.title)}">${body}</a>` : body;
}

function edgeSvg(e) {
  let s = `<path class="cm-edge cm-lane-${e.lane}" d="${e.path}" marker-end="url(#cm-arrow)"></path>`;
  if (e.label) s += `<text class="cm-break cm-lane-${e.lane}" x="${e.lx}" y="${e.ly}" data-tip="${esc(e.tip)}">↯ ${esc(e.label)}</text>`;
  return s;
}

function mount(el, params, ctx) {
  el.innerHTML = `
  <div class="cm">
    <svg viewBox="0 0 760 1010" role="img" aria-label="The chapter map as a directed graph: a shared spine forks into Branch A (imitation) and Branch B (models and reinforcement learning), which remerge into safety, evaluation, and synthesis.">
      <defs>
        <marker id="cm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z"></path>
        </marker>
      </defs>
      ${LANE_HEADERS.map(h => `<text class="cm-header cm-lane-${h.lane}" x="${h.x}" y="${h.y}" data-tip="${esc(h.tip)}">${esc(h.text)}</text>`).join('')}
      ${EDGES.map(edgeSvg).join('')}
      ${NODES.map(nodeSvg).join('')}
    </svg>
    <p class="cm-legend">
      <span class="cm-key cm-key-live">live — click to open</span>
      <span class="cm-key cm-key-planned">planned</span>
      <span class="cm-key">↯ hover for what breaks</span>
    </p>
  </div>`;

  const style = document.createElement('style');
  style.textContent = `
    .cm { --cm-s: var(--fg-faint); --cm-a: var(--accent); --cm-b: oklch(0.46 0.10 150); }
    :root[data-theme="dark"] .cm { --cm-b: oklch(0.75 0.10 150); }
    .cm svg { width: 100%; height: auto; display: block; }
    .cm a { outline-offset: 3px; text-decoration: none; }
    .cm-node rect { fill: var(--surface); stroke: var(--rule); stroke-width: 1.5; }
    .cm-node.is-live.cm-lane-S rect { stroke: var(--cm-s); }
    .cm-node.is-live.cm-lane-A rect { stroke: var(--cm-a); }
    .cm-node.is-live.cm-lane-B rect { stroke: var(--cm-b); }
    .cm-node.is-planned rect { stroke-dasharray: 5 3; }
    .cm a:hover rect, .cm a:focus-visible rect { stroke-width: 2.5; }
    .cm a:hover .cm-title { text-decoration: underline; }
    .cm-eyebrow { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; fill: var(--fg-faint); }
    .cm-node.is-live.cm-lane-A .cm-eyebrow { fill: var(--cm-a); }
    .cm-node.is-live.cm-lane-B .cm-eyebrow { fill: var(--cm-b); }
    .cm-node.is-live.cm-lane-S .cm-eyebrow { fill: var(--fg-muted); }
    .cm-title { font-size: 15px; font-weight: 600; fill: var(--fg); }
    .cm-node.is-planned .cm-title { fill: var(--fg-muted); }
    .cm-edge { fill: none; stroke: var(--fg-faint); stroke-width: 1.5; }
    #cm-arrow path { fill: var(--fg-faint); }
    .cm-break { font-size: 12px; font-style: italic; }
    .cm-break.cm-lane-A { fill: var(--cm-a); }
    .cm-break.cm-lane-B { fill: var(--cm-b); }
    .cm-header { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
    .cm-header.cm-lane-A { fill: var(--cm-a); }
    .cm-header.cm-lane-B { fill: var(--cm-b); }
    .cm-header, .cm-lane-A.cm-header, .cm-lane-B.cm-header { text-anchor: middle; }
    .cm-legend { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; margin: 0.75rem 0 0; font-size: 0.85rem; color: var(--fg-muted); }
    .cm-key { display: inline-flex; align-items: center; gap: 0.45rem; }
    .cm-key-live::before, .cm-key-planned::before {
      content: ""; width: 1.5rem; height: 0.85rem; border-radius: 3px;
      background: var(--surface); border: 1.5px solid var(--accent);
    }
    .cm-key-planned::before { border: 1.5px dashed var(--rule); }
  `;
  el.append(style);

  ctx.Diagram(el.querySelector('svg'));
  return () => {};
}

window.Demos.register('chapter-map', mount);
