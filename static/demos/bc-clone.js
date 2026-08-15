// bc-clone.js — the whole behavior-cloning pipeline, live: collect
// demonstrations from the pure-pursuit expert, fit the CNN (trained offline in
// PyTorch — tools/bc-lab; the page replays the recorded run and loads its
// weights), then hand it the wheel and watch the error compound. A toggle
// widens the data distribution (noise-injected collection) to show the
// distribution — not the loss — was the problem.
//
// Deployment is honest rather than pristine, for every driver equally: a small
// start offset, a whisper of steering noise, and a modest kick every ten
// seconds. The expert and the widened clone shrug the kicks off; the clean
// clone rides the first few, then compounds away.
import {
  makeTrack, makeField, observe, expertSteer, stepCar, startState,
  CAR, OBS, rng, gauss, clamp,
} from '/static/demos/bc-car.js';
import { buildNet, predict } from '/static/demos/bc-net.js';
import {
  fitWorld, drawTrack, drawTrail, drawCar, drawObsView, drawHist,
} from '/static/demos/bc-render.js';

const N_FRAMES = 2000;                               // ~3 laps of demonstrations
const DART_SIGMA = 0.7;                              // execution noise, if widening
const DEPLOY_OFFSET = 0.15, DEPLOY_NOISE = 0.02;     // deployment is never pristine…
const BUMP = 0.2, BUMP_EVERY = 10;                   // …and the world kicks, both ways
const NUDGE = 0.25, T_MAX = 180;
const HIST_BINS = 49, HIST_RANGE = 1.225;

function mount(el, params, ctx) {
  const { Anim, Controls, Theme, Plot } = ctx;
  el.innerHTML = `
    <div style="display:flex;gap:1.25rem;flex-wrap:wrap;align-items:flex-start;justify-content:center">
      <div style="flex:1 1 320px;min-width:250px;max-width:640px"><div style="height:340px">
        <canvas class="bc-track" style="width:100%;height:100%"></canvas>
      </div></div>
      <div style="flex:0 0 170px;display:flex;flex-direction:column;gap:.45rem">
        <canvas class="bc-obs" style="width:170px;height:170px"></canvas>
        <div style="font-size:.72rem;color:var(--fg-muted);line-height:1.35">the policy's camera</div>
        <canvas class="bc-hist" style="width:170px;height:74px"></canvas>
        <div style="font-size:.72rem;color:var(--fg-muted);line-height:1.35">
          cross-track error: training data (bars) vs the car right now (line);
          dashes mark the road edges</div>
      </div>
    </div>
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:.6rem">
      <div style="flex:1 1 240px;min-width:220px">
        <div style="height:165px"><canvas class="bc-loss" style="width:100%;height:100%"></canvas></div>
        <div style="font-size:.72rem;color:var(--fg-muted)">the fit, replayed from the recorded PyTorch run: log₁₀ steering MSE vs gradient step (gray: held-out)</div>
      </div>
      <div style="flex:1 1 240px;min-width:220px">
        <div style="height:165px"><canvas class="bc-err" style="width:100%;height:100%"></canvas></div>
        <div style="font-size:.72rem;color:var(--fg-muted)">deployment: |cross-track error| vs seconds — clone in accent, expert in gray, road edge at 1; the spikes are the kicks</div>
      </div>
    </div>
    <div class="bc-controls" style="display:flex;flex-wrap:wrap;gap:.5rem .75rem;align-items:center"></div>
    <p class="bc-status" style="color:var(--fg-muted);font-size:.85rem"></p>`;

  const track = makeTrack();
  const field = makeField(track);
  const statusEl = el.querySelector('.bc-status');
  const obsCanvas = el.querySelector('.bc-obs');
  const histCanvas = el.querySelector('.bc-hist');
  const dpr = window.devicePixelRatio || 1;
  obsCanvas.width = 170 * dpr; obsCanvas.height = 170 * dpr;
  histCanvas.width = 170 * dpr; histCanvas.height = 74 * dpr;

  const lossPlot = Plot(el.querySelector('.bc-loss'), {
    ylim: [-6, 0], series: [{ color: 'accent', width: 1.5 }, { color: 'muted', width: 2 }],
  });
  const errPlot = Plot(el.querySelector('.bc-err'), {
    ylim: [0, 1.25], series: [{ color: 'accent', width: 2 }, { color: 'muted', width: 1.5 }, { color: 'faint', width: 1 }],
  });

  // --- the trained networks, exported by tools/bc-lab/train_bc.py ---
  let weights = null, weightsErr = null;
  fetch(`/static/demos/bc-weights.json?v=${document.documentElement.dataset.build || ''}`)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((j) => { weights = j; })
    .catch((e) => { weightsErr = e; status(`could not load bc-weights.json (${e.message}) — regenerate with tools/bc-lab.`); });

  // --- experiment state (all of it) ---
  let mode = 'idle';                       // idle | collect | replay | drive
  let collected = 0, bins = new Float64Array(HIST_BINS), collectRand = null, noisyRun = false;
  let net = null, fitVariant = null;
  let replayRaf = null;
  let car = startState(track, 0), trail = [], curE = 0, lastObs = null;
  let driveKind = 'clone', driveT = 0, noiseRand = null, nudgeSign = 1, bumpSign = 1;
  const obsBuf = new Float32Array(OBS.w * OBS.h);
  const opts = { noisy: false };
  const status = (msg) => { statusEl.textContent = msg; };
  const lap = () => (collected * CAR.v * CAR.dt / track.total).toFixed(1);

  function binE(e) {
    const i = Math.round(((e + HIST_RANGE) / (2 * HIST_RANGE)) * (HIST_BINS - 1));
    if (i >= 0 && i < HIST_BINS) bins[i]++;
  }

  // --- one simulated step, meaning depends on the phase ---
  function simStep(s) {
    if (mode === 'collect' && collected < N_FRAMES) {
      const u = expertSteer(car, track);                    // the label: expert's clean action
      lastObs = observe(car, field, track.halfWidth, OBS, obsBuf);
      collected++;
      binE(track.nearest(car.x, car.y).e);
      const exec = noisyRun ? clamp(u + DART_SIGMA * gauss(collectRand), -1, 1) : u;
      car = stepCar(car, exec);                             // noise perturbs execution only
      if (collected >= N_FRAMES) {
        mode = 'idle'; anim.pause(); anim.speed = 1;
        status(`dataset: ${N_FRAMES} frames over ${lap()} laps${noisyRun ? ' (wobbled — look at the histogram)' : ' — note the histogram: one thin spike'} · next: fit`);
      }
    } else if (mode === 'drive') {
      if (Math.round(driveT / CAR.dt) > 0 && Math.round(driveT / CAR.dt) % Math.round(BUMP_EVERY / CAR.dt) === 0) {
        car.psi += BUMP * bumpSign; bumpSign = -bumpSign;   // the scheduled kick, for everyone
      }
      lastObs = observe(car, field, track.halfWidth, OBS, obsBuf);
      const u = driveKind === 'clone' ? predict(net, lastObs) : expertSteer(car, track);
      car = stepCar(car, clamp(u + DEPLOY_NOISE * gauss(noiseRand), -1, 1));
      driveT += CAR.dt;
      curE = track.nearest(car.x, car.y).e;
      const si = driveKind === 'clone' ? 0 : 1;
      errPlot.push(si, driveT, Math.min(Math.abs(curE), 1.25));
      errPlot.setData(2, [0, driveT], [1, 1]);
      if (Math.abs(curE) > track.halfWidth) {
        mode = 'idle'; anim.pause();
        status(driveKind === 'clone'
          ? `off the road after ${driveT.toFixed(1)} s (${Math.floor(driveT / BUMP_EVERY)} kicks in). Look at the histogram: the camera is showing states the dataset simply does not contain.`
          : `the expert left the road?! (${driveT.toFixed(1)} s) — file a bug.`);
      } else if (driveT >= T_MAX) {
        mode = 'idle'; anim.pause();
        status(`${driveKind === 'clone' ? (fitVariant === 'dart' ? 'the widened clone' : 'the clone') : 'the expert'} is still on the road after ${T_MAX} s and ${Math.floor(T_MAX / BUMP_EVERY)} kicks — calling it.`);
      }
    }
    trail.push([car.x, car.y]);
    if (trail.length > 700) trail.shift();
    return s;
  }

  function draw(g) {
    const t = Theme.tokens();
    g.fit(); g.clear();
    fitWorld(g, track.bounds);
    drawTrack(g, track, t);
    drawTrail(g, trail, mode === 'collect' ? t.muted : t.accent);
    drawCar(g, car, mode === 'collect' || (mode === 'drive' && driveKind === 'expert') ? t.muted : t.accent);
    drawObsView(obsCanvas, lastObs || observe(car, field, track.halfWidth, OBS, obsBuf), OBS, t);
    drawHist(histCanvas, bins, HIST_RANGE, t, mode === 'drive' || Math.abs(curE) > 0 ? curE : null, track.halfWidth);
    if (mode === 'collect') status(`collecting demonstrations… ${collected}/${N_FRAMES} frames (${lap()} laps)`);
    if (mode === 'drive') errPlot.render();
  }

  const anim = Anim({ state: { t: 0 }, step: simStep, dt: CAR.dt, canvas: el.querySelector('.bc-track'), draw, autoplay: false });

  // --- phase transitions ---
  function collectStart() {
    if (mode !== 'idle') return;
    collected = 0; bins.fill(0); net = null; fitVariant = null;
    lossPlot.clear().render(); errPlot.clear().render();
    noisyRun = opts.noisy;
    collectRand = rng(noisyRun ? 12 : 11);                  // same seeds the datasets were exported with
    car = startState(track, 0); trail = []; curE = 0; lastObs = null;
    mode = 'collect'; anim.speed = 24; anim.play();
  }

  // Step 2: the learning happened offline in PyTorch (tools/bc-lab). Load the
  // weights for the dataset just collected and replay the recorded loss curve.
  function fitStart() {
    if (mode !== 'idle') return;
    if (!collected) { status('no data yet — collect demonstrations first (step 1).'); return; }
    if (!weights) { status(weightsErr ? 'weights failed to load — see above.' : 'weights still loading — try again in a second.'); return; }
    fitVariant = noisyRun ? 'dart' : 'clean';
    const v = weights.variants[fitVariant];
    net = buildNet(weights.arch, v);
    lossPlot.clear();
    mode = 'replay';
    let i = 0, vi = 0;
    (function replayFrame() {
      for (let k = 0; k < 8 && i < v.lossCurve.length; k++, i++) {
        const [step, mse] = v.lossCurve[i];
        lossPlot.push(0, step, Math.log10(Math.max(1e-8, mse)));
        while (vi < v.valCurve.length && v.valCurve[vi][0] <= step) {
          lossPlot.push(1, v.valCurve[vi][0], Math.log10(Math.max(1e-8, v.valCurve[vi][1])));
          vi++;
        }
      }
      lossPlot.render();
      if (i < v.lossCurve.length) { replayRaf = requestAnimationFrame(replayFrame); return; }
      replayRaf = null; mode = 'idle';
      status(`fit offline in PyTorch (tools/bc-lab): ${v.epochs} epochs · train MSE ${v.trainMSE.toExponential(1)} · held-out MSE ${v.valMSE.toExponential(1)}` +
        (fitVariant === 'dart' ? ' — far worse than the clean fit, offline. Now drive it anyway.' : ' — the offline numbers look superb. Now drive it.'));
    })();
  }

  function driveStart(kind) {
    if (mode === 'replay') return;
    if (kind === 'clone' && !net) { status('there is no clone yet — fit it first (step 2).'); return; }
    anim.pause();
    driveKind = kind; driveT = 0; nudgeSign = 1; bumpSign = 1;
    noiseRand = rng((Math.random() * 2 ** 31) | 0);
    car = startState(track, DEPLOY_OFFSET); trail = []; curE = DEPLOY_OFFSET;
    errPlot.clear(kind === 'clone' ? 0 : 1).render();
    mode = 'drive'; anim.speed = 2; anim.play();
    status(kind === 'clone'
      ? `the ${fitVariant === 'dart' ? 'widened ' : ''}clone is driving — a kick every ${BUMP_EVERY} s…`
      : `the expert is driving — same start offset, same noise, same kicks…`);
  }

  function nudge() {
    if (mode !== 'drive') { status('nudge works while someone is driving.'); return; }
    car.psi += NUDGE * nudgeSign; nudgeSign = -nudgeSign;
  }

  function resetAll() {
    anim.pause();
    if (replayRaf) { cancelAnimationFrame(replayRaf); replayRaf = null; }
    mode = 'idle';
    collected = 0; bins.fill(0); net = null; fitVariant = null;
    car = startState(track, 0); trail = []; curE = 0; lastObs = null;
    lossPlot.clear().render(); errPlot.clear().render();
    anim.redraw();
    status('an empty dataset and an unfit network — start with step 1.');
  }

  Controls(el.querySelector('.bc-controls'), [
    { type: 'button', label: '1 · collect demos', onClick: collectStart },
    { type: 'button', label: '2 · fit the clone', onClick: fitStart },
    { type: 'button', label: '3 · drive the clone', onClick: () => driveStart('clone') },
    { type: 'button', label: 'drive the expert', onClick: () => driveStart('expert') },
    { type: 'button', label: 'nudge', onClick: nudge },
    { type: 'toggle', key: 'noisy', value: false, label: 'wobble the expert while collecting (the fix — try last)' },
    { type: 'button', label: 'reset', onClick: resetAll },
  ], opts);

  resetAll();
  const off = Theme.onChange(() => { anim.redraw(); lossPlot.render(); errPlot.render(); });
  const onResize = () => { anim.redraw(); lossPlot.resize(); errPlot.resize(); };
  window.addEventListener('resize', onResize);
  return () => {
    anim.pause();
    if (replayRaf) cancelAnimationFrame(replayRaf);
    off(); window.removeEventListener('resize', onResize);
  };
}

window.Demos.register('bc-clone', mount);
