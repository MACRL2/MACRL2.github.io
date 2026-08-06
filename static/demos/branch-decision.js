// branch-decision.js — the two-questions router.
//
// The reader describes a robot by answering the only two questions that pick an
// algorithm class (can a human demonstrate? how hard is the objective?), and the
// tool reveals which branch it lands in, the method ladder, and — the point —
// which failure mode each rung buys. No colors are hardcoded: every accent uses a
// CSS custom property, so light/dark toggling is automatic.

const SYSTEMS = [
  { name: 'Self-driving car',      demo: 'yes',     obj: 'hard'   },
  { name: 'Off-road vehicle',      demo: 'yes',     obj: 'hard'   },
  { name: 'Table-top manipulator', demo: 'partial', obj: 'medium' },
  { name: 'Quadruped',             demo: 'no',      obj: 'easy'   },
  { name: 'Humanoid',              demo: 'no',      obj: 'easy'   },
  { name: 'Dexterous hand',        demo: 'no',      obj: 'easy'   },
];

const BRANCHES = {
  A: {
    tag: 'Branch A',
    title: 'Semantically rich systems',
    gloss: 'The vehicle is the easy part. What is hard is <em>semantics</em> and the <em>objective</em> — and demonstrations are nearly free, on the true embodiment.',
    channel: 'demonstration',
    ladder: [
      { step: 'Behavior cloning',            breaks: 'compounding error, multimodality, causal confusion, the long tail' },
      { step: 'Interactive imitation (DAgger)', breaks: 'needs an ever-present expert; copies actions, not intent' },
      { step: 'Inverse RL / reward learning',   breaks: 'reward is ill-posed without regularization — but now you can plan or do RL beyond the demonstrator' },
    ],
    pay: 'expert availability',
  },
  B: {
    tag: 'Branch B',
    title: 'Unstable, contact-rich systems',
    gloss: 'The objective is easy to write in a line ("don’t fall"). Demonstrations are impossible — the stabilization timescale is below human bandwidth. The leverage is in the <em>model</em>.',
    channel: 'reward + simulator',
    ladder: [
      { step: 'Plan with an analytic model (MPC / DDP)', breaks: 'contact, friction, delay, unmodeled compliance' },
      { step: 'Supervised system ID, then plan',          breaks: 'the planner exploits model error off the data distribution' },
      { step: 'Iterative system ID / model-based RL',     breaks: 'stiff contact, latent state, the real-time planning budget' },
      { step: 'End-to-end RL in sim + sim-to-real',       breaks: 'reward hacking; the sim-to-real gap becomes the whole job' },
    ],
    pay: 'simulation fidelity & compute',
  },
  M: {
    tag: 'The middle',
    title: 'Manipulation — the interesting hybrid',
    gloss: 'Demonstrations exist, but with an <em>embodiment gap</em>, <strong>and</strong> the contact dynamics are hard. Neither branch alone fits; you end up combining both toolkits.',
    channel: 'demonstration (with a gap) + reward',
    ladder: [
      { step: 'Imitation across the embodiment gap', breaks: 'the gap means cloned actions transfer poorly' },
      { step: 'Model / sim for the contact dynamics', breaks: 'the same model-exploitation and sim-to-real walls as Branch B' },
    ],
    pay: 'both — expert effort and simulation fidelity',
  },
};

function route(demo) {
  if (demo === 'yes') return 'A';
  if (demo === 'no') return 'B';
  return 'M';
}

function renderResult(state) {
  const key = route(state.demo);
  const b = BRANCHES[key];
  const rungs = b.ladder.map((r, i) => `
    <li class="bd-rung">
      <span class="bd-rung-n">${i + 1}</span>
      <div>
        <div class="bd-rung-step">${r.step}</div>
        <div class="bd-rung-breaks"><span class="bd-breaks-label">what breaks →</span> ${r.breaks}</div>
      </div>
    </li>`).join('');
  return `
    <div class="bd-branch-tag">${b.tag}</div>
    <h4 class="bd-branch-title">${b.title}</h4>
    <p class="bd-gloss">${b.gloss}</p>
    <p class="bd-channel">Cheapest human channel: <strong>${b.channel}</strong></p>
    <ol class="bd-ladder">${rungs}</ol>
    <p class="bd-pay">What you pay: <strong>${b.pay}</strong></p>`;
}

function mount(el, params, ctx) {
  el.innerHTML = `
  <div class="bd">
    <p class="bd-lede">Pick a system, or set the two questions yourself. The framework routes it —
    and tells you which failure mode you just bought.</p>

    <div class="bd-chips" role="group" aria-label="example systems">
      ${SYSTEMS.map((s, i) => `<button type="button" class="ctl-btn bd-chip" data-sys="${i}">${s.name}</button>`).join('')}
    </div>

    <div class="bd-questions">
      <fieldset class="bd-q">
        <legend>Can a human demonstrate on the target embodiment?</legend>
        <button type="button" class="ctl-btn bd-opt" data-q="demo" data-v="yes">Yes, cheaply</button>
        <button type="button" class="ctl-btn bd-opt" data-q="demo" data-v="partial">With an embodiment gap</button>
        <button type="button" class="ctl-btn bd-opt" data-q="demo" data-v="no">No</button>
      </fieldset>
      <fieldset class="bd-q">
        <legend>How hard is it to specify the objective?</legend>
        <button type="button" class="ctl-btn bd-opt" data-q="obj" data-v="easy">Easy ("don't fall")</button>
        <button type="button" class="ctl-btn bd-opt" data-q="obj" data-v="medium">In between</button>
        <button type="button" class="ctl-btn bd-opt" data-q="obj" data-v="hard">Hard ("good driving")</button>
      </fieldset>
    </div>

    <div class="bd-result" aria-live="polite"></div>
  </div>`;

  const style = document.createElement('style');
  style.textContent = `
    .bd-lede { color: var(--fg-muted); margin: 0 0 0.9rem; }
    .bd-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1rem; }
    .bd-questions { display: grid; gap: 0.75rem; margin-bottom: 1rem; }
    .bd-q { border: 1px solid var(--rule); border-radius: 8px; padding: 0.6rem 0.75rem; }
    .bd-q legend { font-size: 0.85rem; color: var(--fg-muted); padding: 0 0.4rem; }
    .bd-q .bd-opt { margin: 0.15rem 0.3rem 0.15rem 0; }
    .bd-opt.is-on, .bd-chip.is-on { border-color: var(--accent); color: var(--accent); background: color-mix(in oklch, var(--accent) 10%, transparent); }
    .bd-result { border-left: 3px solid var(--accent); background: var(--surface); border-radius: 6px; padding: 0.9rem 1.1rem; }
    .bd-branch-tag { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
    .bd-branch-title { margin: 0.15rem 0 0.5rem; }
    .bd-gloss { margin: 0 0 0.6rem; color: var(--fg); }
    .bd-channel, .bd-pay { margin: 0.5rem 0 0; font-size: 0.92rem; }
    .bd-ladder { list-style: none; margin: 0.7rem 0 0; padding: 0; display: grid; gap: 0.5rem; }
    .bd-rung { display: flex; gap: 0.6rem; align-items: baseline; }
    .bd-rung-n { flex: none; width: 1.4rem; height: 1.4rem; border-radius: 50%; border: 1px solid var(--rule);
                 display: grid; place-items: center; font-size: 0.78rem; font-variant-numeric: tabular-nums; color: var(--fg-muted); }
    .bd-rung-step { font-weight: 600; }
    .bd-rung-breaks { font-size: 0.88rem; color: var(--fg-muted); }
    .bd-breaks-label { color: var(--accent); }
  `;
  el.append(style);

  const state = { demo: params.demo || 'yes', obj: params.obj || 'hard' };
  const result = el.querySelector('.bd-result');

  const syncButtons = () => {
    el.querySelectorAll('.bd-opt').forEach(btn =>
      btn.classList.toggle('is-on', state[btn.dataset.q] === btn.dataset.v));
    el.querySelectorAll('.bd-chip').forEach(btn => {
      const s = SYSTEMS[+btn.dataset.sys];
      btn.classList.toggle('is-on', s.demo === state.demo && s.obj === state.obj);
    });
    result.innerHTML = renderResult(state);
  };

  const onClick = (e) => {
    const opt = e.target.closest('.bd-opt');
    const chip = e.target.closest('.bd-chip');
    if (opt) { state[opt.dataset.q] = opt.dataset.v; syncButtons(); }
    else if (chip) { const s = SYSTEMS[+chip.dataset.sys]; state.demo = s.demo; state.obj = s.obj; syncButtons(); }
  };
  el.addEventListener('click', onClick);
  syncButtons();

  return () => { el.removeEventListener('click', onClick); };
}

window.Demos.register('branch-decision', mount);
