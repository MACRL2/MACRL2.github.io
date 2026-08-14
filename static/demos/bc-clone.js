// bc-clone.js — the whole behavior-cloning pipeline, live: collect
// demonstrations from the pure-pursuit expert, train the tiny CNN on them,
// then hand it the wheel and watch the error compound. A toggle widens the
// data distribution (noise-injected collection) to show the distribution —
// not the loss — was the problem.
import {
  makeTrack, makeField, observe, expertSteer, stepCar, startState,
  CAR, OBS, rng, gauss, clamp,
} from '/static/demos/bc-car.js';
import {
  createNet, makeCache, gradsInit, adamInit, trainSteps, evalMSE, predict,
} from '/static/demos/bc-cnn.js';
import {
  fitWorld, drawTrack, drawTrail, drawCar, drawObsView, drawHist,
} from '/static/demos/bc-render.js';

const N_FRAMES = 2000, EPOCHS = 20, BATCH = 32;      // the recipe
const DART_SIGMA = 0.7;                              // execution noise, if widening
const DEPLOY_OFFSET = 0.15, DEPLOY_NOISE = 0.02;     // deployment is never pristine
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
        <div style="font-size:.72rem;color:var(--fg-muted)">training: log₁₀ steering MSE vs gradient step (dots: held-out)</div>
      </div>
      <div style="flex:1 1 240px;min-width:220px">
        <div style="height:165px"><canvas class="bc-err" style="width:100%;height:100%"></canvas></div>
        <div style="font-size:.72rem;color:var(--fg-muted)">deployment: |cross-track error| vs seconds — clone in accent, expert in gray, road edge at 1</div>
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

  // --- experiment state (all of it) ---
  let mode = 'idle';                       // idle | collect | train | drive
  let X = [], Y = [], bins = new Float64Array(HIST_BINS), collectRand = null, noisyRun = false;
  let net = null, cache = null, grads = null, opt = null, batchRand = null;
  let trainIdx = [], valIdx = [], step = 0, stepsGoal = 0, epochsDone = 0, lossWin = [];
  let trainRaf = null;
  let car = startState(track, 0), trail = [], curE = 0, lastObs = null;
  let driveKind = 'clone', driveT = 0, noiseRand = null, nudgeSign = 1;
  const obsBuf = new Float32Array(OBS.w * OBS.h);
  const opts = { noisy: false };
  const status = (msg) => { statusEl.textContent = msg; };
  const lap = () => (X.length * CAR.v * CAR.dt / track.total).toFixed(1);

  function binE(e) {
    const i = Math.round(((e + HIST_RANGE) / (2 * HIST_RANGE)) * (HIST_BINS - 1));
    if (i >= 0 && i < HIST_BINS) bins[i]++;
  }

  // --- one simulated step, meaning depends on the phase ---
  function simStep(s) {
    if (mode === 'collect' && X.length < N_FRAMES) {
      const u = expertSteer(car, track);                    // the label: expert's clean action
      X.push(observe(car, field, track.halfWidth, OBS, new Float32Array(OBS.w * OBS.h)));
      Y.push(u);
      binE(track.nearest(car.x, car.y).e);
      const exec = noisyRun ? clamp(u + DART_SIGMA * gauss(collectRand), -1, 1) : u;
      car = stepCar(car, exec);                             // noise perturbs execution only
      if (X.length >= N_FRAMES) {
        mode = 'idle'; anim.pause(); anim.speed = 1;
        status(`dataset: ${N_FRAMES} frames over ${lap()} laps${noisyRun ? ' (wobbled — look at the histogram)' : ' — note the histogram: one thin spike'} · next: train`);
      }
    } else if (mode === 'drive') {
      lastObs = observe(car, field, track.halfWidth, OBS, obsBuf);
      const u = driveKind === 'clone' ? predict(net, lastObs, cache) : expertSteer(car, track);
      car = stepCar(car, clamp(u + DEPLOY_NOISE * gauss(noiseRand), -1, 1));
      driveT += CAR.dt;
      curE = track.nearest(car.x, car.y).e;
      const si = driveKind === 'clone' ? 0 : 1;
      errPlot.push(si, driveT, Math.min(Math.abs(curE), 1.25));
      errPlot.setData(2, [0, driveT], [1, 1]);
      if (Math.abs(curE) > track.halfWidth) {
        mode = 'idle'; anim.pause();
        status(driveKind === 'clone'
          ? `off the road after ${driveT.toFixed(1)} s. Look at the histogram: the camera is showing states the dataset simply does not contain.`
          : `the expert left the road?! (${driveT.toFixed(1)} s) — file a bug.`);
      } else if (driveT >= T_MAX) {
        mode = 'idle'; anim.pause();
        status(`${driveKind} still on the road after ${T_MAX} s — calling it. max|e| stayed inside the lane.`);
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
    if (mode === 'collect') status(`collecting demonstrations… ${X.length}/${N_FRAMES} frames (${lap()} laps)`);
    if (mode === 'drive') errPlot.render();
  }

  const anim = Anim({ state: { t: 0 }, step: simStep, dt: CAR.dt, canvas: el.querySelector('.bc-track'), draw, autoplay: false });

  // --- phase transitions ---
  function collectStart() {
    if (mode !== 'idle') return;
    X = []; Y = []; bins.fill(0); net = null; epochsDone = 0; step = 0; lossWin = [];
    lossPlot.clear().render(); errPlot.clear().render();
    noisyRun = opts.noisy;
    collectRand = rng(noisyRun ? 12 : 11);
    car = startState(track, 0); trail = []; curE = 0; lastObs = null;
    mode = 'collect'; anim.speed = 24; anim.play();
  }

  function trainStart() {
    if (mode !== 'idle') return;
    if (!X.length) { status('no data yet — collect demonstrations first (step 1).'); return; }
    if (!net) {
      net = createNet(5); cache = makeCache(net); grads = gradsInit(net); opt = adamInit(net);
      batchRand = rng(105);
      trainIdx = []; valIdx = [];
      for (let i = 0; i < X.length; i++) (i % 10 === 9 ? valIdx : trainIdx).push(i);
    }
    const Xt = trainIdx.map((i) => X[i]), Yt = trainIdx.map((i) => Y[i]);
    const perEpoch = Math.ceil(Xt.length / BATCH);
    stepsGoal = step + perEpoch * EPOCHS;
    const targetEpochs = epochsDone + EPOCHS;
    mode = 'train';
    (function trainFrame() {
      const t0 = performance.now();
      while (performance.now() - t0 < 12 && step < stepsGoal) {
        lossWin.push(trainSteps(net, Xt, Yt, opt, grads, cache, 1, BATCH, batchRand));
        step++;
        if (lossWin.length === 5) {
          lossPlot.push(0, step, Math.log10(Math.max(1e-8, lossWin.reduce((a, b) => a + b) / 5)));
          lossWin = [];
        }
        if (step % perEpoch === 0) {
          epochsDone++;
          lossPlot.push(1, step, Math.log10(Math.max(1e-8, evalMSE(net, X, Y, valIdx, cache))));
        }
      }
      lossPlot.render();
      status(`training… epoch ${epochsDone}/${targetEpochs} · gradient step ${step}`);
      if (step < stepsGoal) { trainRaf = requestAnimationFrame(trainFrame); return; }
      trainRaf = null; mode = 'idle';
      const tr = evalMSE(net, X, Y, trainIdx.filter((_, i) => i % 9 === 0), cache);
      const va = evalMSE(net, X, Y, valIdx, cache);
      status(`trained ${epochsDone} epochs · train MSE ${tr.toExponential(1)} · held-out MSE ${va.toExponential(1)}` +
        (noisyRun ? ' — much worse than the clean run, offline. Now drive it anyway.'
                  : ' — the offline numbers look superb. Now drive it.'));
    })();
  }

  function driveStart(kind) {
    if (mode === 'train') return;
    if (kind === 'clone' && !net) { status('there is no clone yet — train it first (step 2).'); return; }
    anim.pause();
    driveKind = kind; driveT = 0; nudgeSign = 1;
    noiseRand = rng((Math.random() * 2 ** 31) | 0);
    car = startState(track, DEPLOY_OFFSET); trail = []; curE = DEPLOY_OFFSET;
    errPlot.clear(kind === 'clone' ? 0 : 1).render();
    mode = 'drive'; anim.speed = 2; anim.play();
    status(kind === 'clone' ? 'the clone is driving…' : 'the expert is driving (same start offset, same noise)…');
  }

  function nudge() {
    if (mode !== 'drive') { status('nudge works while someone is driving.'); return; }
    car.psi += NUDGE * nudgeSign; nudgeSign = -nudgeSign;
  }

  function resetAll() {
    anim.pause();
    if (trainRaf) { cancelAnimationFrame(trainRaf); trainRaf = null; }
    mode = 'idle';
    X = []; Y = []; bins.fill(0); net = null; epochsDone = 0; step = 0; lossWin = [];
    car = startState(track, 0); trail = []; curE = 0; lastObs = null;
    lossPlot.clear().render(); errPlot.clear().render();
    anim.redraw();
    status('an empty dataset and an untrained network — start with step 1.');
  }

  Controls(el.querySelector('.bc-controls'), [
    { type: 'button', label: '1 · collect demos', onClick: collectStart },
    { type: 'button', label: '2 · train the clone', onClick: trainStart },
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
    if (trainRaf) cancelAnimationFrame(trainRaf);
    off(); window.removeEventListener('resize', onResize);
  };
}

window.Demos.register('bc-clone', mount);
