// dagger-run.js — the DAgger loop, live. Each round: roll out the CURRENT
// policy under the deployment gauntlet while the expert rides along labeling
// every visited state (it never touches the wheel), aggregate, refit, and
// score the new policy on the gauntlet. The rollouts run live in this page —
// same seeds as tools/bc-lab/run_dagger.mjs, so what you watch is exactly the
// run that produced the training data. The fits are PyTorch, replayed from
// the recorded curves; the weights are the real ones (dagger-run.json).
import {
  makeTrack, makeField, observe, expertSteer, stepCar, startState,
  CAR, OBS, rng, gauss, clamp,
} from '/static/demos/bc-car.js';
import { buildNet, predict } from '/static/demos/bc-net.js';
import {
  fitWorld, drawTrack, drawTrail, drawCar, drawObsView, drawHist,
} from '/static/demos/bc-render.js';

const HIST_RANGE = 1.225;

function mount(el, params, ctx) {
  const { Anim, Controls, Theme, Plot } = ctx;
  el.innerHTML = `
    <div style="display:flex;gap:1.25rem;flex-wrap:wrap;align-items:flex-start;justify-content:center">
      <div style="flex:1 1 320px;min-width:250px;max-width:640px"><div style="height:340px">
        <canvas class="dg-track" style="width:100%;height:100%"></canvas>
      </div></div>
      <div style="flex:0 0 170px;display:flex;flex-direction:column;gap:.45rem">
        <canvas class="dg-obs" style="width:170px;height:170px"></canvas>
        <div style="font-size:.72rem;color:var(--fg-muted);line-height:1.35">the policy's camera</div>
        <div class="dg-meters" style="display:flex;flex-direction:column;gap:2px">
          <div style="font-size:.72rem;color:var(--fg-muted)">steering: policy (top) vs expert's label</div>
          <div style="position:relative;height:10px;background:var(--surface);border:1px solid var(--rule);border-radius:3px">
            <div class="dg-mpol" style="position:absolute;top:1px;bottom:1px;left:50%;width:0;background:var(--accent)"></div></div>
          <div style="position:relative;height:10px;background:var(--surface);border:1px solid var(--rule);border-radius:3px">
            <div class="dg-mexp" style="position:absolute;top:1px;bottom:1px;left:50%;width:0;background:var(--fg-muted)"></div></div>
        </div>
        <canvas class="dg-hist" style="width:170px;height:64px"></canvas>
        <div style="font-size:.72rem;color:var(--fg-muted);line-height:1.35">
          the aggregated dataset's cross-track error — watch it widen as the
          learner's excursions get labeled</div>
      </div>
    </div>
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:.6rem">
      <div style="flex:1 1 240px;min-width:220px">
        <div style="height:165px"><canvas class="dg-surv" style="width:100%;height:100%"></canvas></div>
        <div style="font-size:.72rem;color:var(--fg-muted)">the headline: seconds surviving the 180 s gauntlet, per round (round 0 = the chapter-4 clone)</div>
      </div>
      <div style="flex:1 1 240px;min-width:220px">
        <div style="height:165px"><canvas class="dg-side" style="width:100%;height:100%"></canvas></div>
        <div class="dg-side-cap" style="font-size:.72rem;color:var(--fg-muted)">rollout / drive: |cross-track error| vs seconds — resets mark crashes; during a fit: the recorded PyTorch loss curve</div>
      </div>
    </div>
    <div class="bc-controls" style="display:flex;flex-wrap:wrap;gap:.5rem .75rem;align-items:center"></div>
    <p class="bc-status" style="color:var(--fg-muted);font-size:.85rem"></p>`;

  const track = makeTrack();
  const field = makeField(track);
  const statusEl = el.querySelector('.bc-status');
  const obsCanvas = el.querySelector('.dg-obs');
  const histCanvas = el.querySelector('.dg-hist');
  const mPol = el.querySelector('.dg-mpol');
  const mExp = el.querySelector('.dg-mexp');
  const dpr = window.devicePixelRatio || 1;
  obsCanvas.width = 170 * dpr; obsCanvas.height = 170 * dpr;
  histCanvas.width = 170 * dpr; histCanvas.height = 64 * dpr;

  const survPlot = Plot(el.querySelector('.dg-surv'), {
    xlim: [-0.2, 3.2], ylim: [0, 195],
    series: [{ color: 'faint', width: 1 }, { color: 'accent', width: 2 }],
  });
  const sidePlot = Plot(el.querySelector('.dg-side'), {
    ylim: [0, 1.25],
    series: [{ color: 'accent', width: 1.75 }, { color: 'faint', width: 1 }],
  });
  const sideLoss = Plot(el.querySelector('.dg-side'), {
    ylim: [-6, 0], series: [{ color: 'accent', width: 1.5 }, { color: 'muted', width: 2 }],
  });

  const status = (m) => { statusEl.textContent = m; };
  const meter = (elm, u) => {
    const w = clamp(u, -1, 1) * -50;          // u > 0 steers left → bar extends left
    elm.style.left = `${Math.min(50, 50 + w)}%`;
    elm.style.width = `${Math.abs(w)}%`;
  };

  // --- run data ---
  let RUN = null, runErr = null;
  fetch(`/static/demos/dagger-run.json?v=${document.documentElement.dataset.build || ''}`)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((j) => { RUN = j; init(); })
    .catch((e) => { runErr = e; status(`could not load dagger-run.json (${e.message}) — regenerate with tools/bc-lab/run_dagger.mjs.`); });

  // --- state ---
  let mode = 'loading';   // loading | idle | rollout | fit | drive | done
  let round = 0;          // index of the CURRENT policy
  let net = null;
  let bins = new Float64Array(49);
  let car = startState(track, 0.15), segs = [[]], crashPts = [], curE = 0, lastObs = null;
  let gauntlet = null, frames = 0, framesGoal = 0, crashes = 0, rollT = 0;
  let fitRaf = null, uPol = 0, uExp = 0, nudgeSign = 1;
  const G = () => RUN.gauntlet;

  // The gauntlet stepper — must match run_dagger.mjs exactly: kick first, then
  // the state is observed/labeled, then the action executes (same rng draws).
  function makeGauntlet(seed) {
    const r = rng(seed);
    let sign = 1, t = 0;
    const per = Math.round(G().bumpEvery / CAR.dt);
    return {
      preKick() {
        const stepIdx = Math.round(t / CAR.dt);
        if (stepIdx > 0 && stepIdx % per === 0) { car.psi += G().bump * sign; sign = -sign; }
      },
      act(u) {
        car = stepCar(car, clamp(u + G().noise * gauss(r), -1, 1));
        t += CAR.dt;
        if (Math.abs(track.nearest(car.x, car.y).e) > track.halfWidth) {
          crashPts.push([car.x, car.y]);
          car = startState(track, G().offset);
          segs.push([]);
          return 'crash';
        }
        return null;
      },
      get t() { return t; },
    };
  }

  function setNet(i) {
    round = i;
    net = buildNet(RUN.arch, RUN.rounds[i].weights);
    bins = Float64Array.from(RUN.rounds[i].histBins);
  }

  function plotSurvival(upto) {
    survPlot.setData(0, [-0.2, 3.2], [G().cap, G().cap]);
    const xs = [], ys = [];
    for (let i = 0; i <= upto; i++) { xs.push(i); ys.push(RUN.rounds[i].evalSurvival); }
    survPlot.setData(1, xs, ys).render();
  }

  function simStep(s) {
    if (mode === 'rollout' && frames < framesGoal) {
      gauntlet.preKick();
      lastObs = observe(car, field, track.halfWidth, OBS, obsBuf);
      uExp = expertSteer(car, track);                    // the label
      uPol = predict(net, lastObs);                      // the action
      binE(track.nearest(car.x, car.y).e);
      frames++;
      const ev = gauntlet.act(uPol);
      if (ev === 'crash') crashes++;
      rollT = gauntlet.t;
      curE = track.nearest(car.x, car.y).e;
      sidePlot.push(0, rollT, Math.min(Math.abs(curE), 1.25));
      if (frames >= framesGoal) {
        anim.pause();
        status(`rollout done: ${framesGoal} states labeled, ${crashes} crash${crashes === 1 ? '' : 'es'} (recorded run: ${RUN.rounds[round + 1].crashes}) — now refit on the aggregate…`);
        fitStart();
      }
    } else if (mode === 'drive') {
      gauntlet.preKick();
      lastObs = observe(car, field, track.halfWidth, OBS, obsBuf);
      uExp = expertSteer(car, track);
      uPol = predict(net, lastObs);
      const ev = gauntlet.act(uPol);
      rollT = gauntlet.t;
      curE = track.nearest(car.x, car.y).e;
      sidePlot.push(0, rollT, Math.min(Math.abs(curE), 1.25));
      sidePlot.setData(1, [0, rollT], [1, 1]);
      if (ev === 'crash') {
        mode = 'idle'; anim.pause();
        status(`round-${round} policy: off the road after ${rollT.toFixed(1)} s.`);
      } else if (rollT >= G().cap) {
        mode = 'idle'; anim.pause();
        status(`round-${round} policy: survived the full ${G().cap} s gauntlet (${Math.floor(G().cap / G().bumpEvery)} kicks).`);
      }
    }
    const seg = segs[segs.length - 1];
    seg.push([car.x, car.y]);
    if (seg.length > 900) seg.shift();
    return s;
  }
  const obsBuf = new Float32Array(OBS.w * OBS.h);
  const uExpE = () => track.nearest(car.x, car.y).e;
  function binE(e) {
    const i = Math.round(((e + HIST_RANGE) / (2 * HIST_RANGE)) * 48);
    if (i >= 0 && i < 49) bins[i]++;
  }

  function draw(g) {
    const t = Theme.tokens();
    g.fit(); g.clear();
    fitWorld(g, track.bounds);
    drawTrack(g, track, t);
    for (const seg of segs) drawTrail(g, seg, mode === 'rollout' ? t.muted : t.accent);
    // the learner's failures, marked
    const c = g.ctx;
    c.strokeStyle = t.accent; c.lineWidth = g.px(2);
    for (const [x, y] of crashPts) {
      const px = g.sx(x), py = g.sy(y), r = g.px(5);
      c.beginPath(); c.moveTo(px - r, py - r); c.lineTo(px + r, py + r);
      c.moveTo(px + r, py - r); c.lineTo(px - r, py + r); c.stroke();
    }
    drawCar(g, car, mode === 'rollout' ? t.muted : t.accent);
    drawObsView(obsCanvas, lastObs || observe(car, field, track.halfWidth, OBS, obsBuf), OBS, t);
    drawHist(histCanvas, bins, HIST_RANGE, t, (mode === 'rollout' || mode === 'drive') ? curE : null, track.halfWidth);
    meter(mPol, uPol); meter(mExp, uExp);
    if (mode === 'rollout') status(`round ${round + 1} rollout: the round-${round} policy drives, the expert labels — ${frames}/${framesGoal} states · ${crashes} crash${crashes === 1 ? '' : 'es'}`);
    if (mode === 'rollout' || mode === 'drive') sidePlot.render();
  }

  const anim = Anim({ state: { t: 0 }, step: simStep, dt: CAR.dt, canvas: el.querySelector('.dg-track'), draw, autoplay: false });

  function roundStart() {
    if (mode !== 'idle') return;
    if (round >= RUN.rounds.length - 1) {
      status(`all ${RUN.rounds.length - 1} recorded rounds are done — drive the final policy, or reset to round 0 and watch again.`);
      mode = 'done'; return;
    }
    segs = [[]]; crashPts = []; frames = 0; crashes = 0;
    car = startState(track, G().offset); curE = G().offset;
    gauntlet = makeGauntlet(RUN.rounds[round + 1].rolloutSeed);
    framesGoal = RUN.config.framesPerRound;
    sidePlot.clear().render();
    setSideCaption('rollout');
    mode = 'rollout'; anim.speed = 24; anim.play();
  }

  function fitStart() {
    mode = 'fit';
    setSideCaption('fit');
    const rd = RUN.rounds[round + 1];
    sideLoss.clear();
    let i = 0, vi = 0;
    (function frame() {
      for (let k = 0; k < 10 && i < rd.lossCurve.length; k++, i++) {
        sideLoss.push(0, rd.lossCurve[i][0], Math.log10(Math.max(1e-8, rd.lossCurve[i][1])));
        while (vi < rd.valCurve.length && rd.valCurve[vi][0] <= rd.lossCurve[i][0]) {
          sideLoss.push(1, rd.valCurve[vi][0], Math.log10(Math.max(1e-8, rd.valCurve[vi][1])));
          vi++;
        }
      }
      sideLoss.render();
      if (i < rd.lossCurve.length) { fitRaf = requestAnimationFrame(frame); return; }
      fitRaf = null;
      setNet(round + 1);
      plotSurvival(round);
      setSideCaption('rollout');      // leave the rollout trace (and its crashes) on display
      sidePlot.render();
      anim.redraw();
      mode = 'idle';
      status(`round ${round} fit (PyTorch, ${rd.steps ?? rd.lossCurve.length * 5} steps on ${rd.aggregateSize} frames): held-out MSE ${rd.valMSE.toExponential(1)} · gauntlet eval: ${rd.evalSurvival >= G().cap ? `survived all ${G().cap} s ✓` : rd.evalSurvival.toFixed(1) + ' s'}`);
    })();
  }

  function driveStart() {
    if (mode === 'rollout' || mode === 'fit') return;
    segs = [[]]; crashPts = [];
    car = startState(track, G().offset); curE = G().offset;
    gauntlet = makeGauntlet((Math.random() * 2 ** 31) | 0);
    sidePlot.clear().render();
    setSideCaption('drive');
    mode = 'drive'; anim.speed = 2; anim.play();
    status(`driving the round-${round} policy on a fresh gauntlet…`);
  }

  function nudge() {
    if (mode !== 'drive') { status('nudge works while the policy is driving.'); return; }
    car.psi += 0.25 * nudgeSign; nudgeSign = -nudgeSign;
  }

  const sideCap = el.querySelector('.dg-side-cap');
  function setSideCaption(kind) {
    sideCap.textContent = kind === 'fit'
      ? 'the fit, replayed from the recorded PyTorch run: log₁₀ steering MSE vs gradient step (gray: held-out)'
      : '|cross-track error| vs seconds — a reset to small error marks a crash (✕ on the map)';
  }

  function init() {
    setNet(0);
    plotSurvival(0);
    mode = 'idle';
    anim.redraw();
    status(`round 0 is the chapter-4 clone: ${RUN.rounds[0].evalSurvival.toFixed(1)} s on the gauntlet. Run a DAgger round.`);
  }

  function resetAll() {
    if (mode === 'loading') return;
    anim.pause();
    if (fitRaf) { cancelAnimationFrame(fitRaf); fitRaf = null; }
    segs = [[]]; crashPts = []; car = startState(track, 0.15); curE = 0; lastObs = null;
    sidePlot.clear().render(); sideLoss.clear();
    uPol = 0; uExp = 0;
    init();
  }

  Controls(el.querySelector('.bc-controls'), [
    { type: 'button', label: 'run a DAgger round', onClick: roundStart },
    { type: 'button', label: 'drive current policy', onClick: driveStart },
    { type: 'button', label: 'nudge', onClick: nudge },
    { type: 'button', label: 'reset to round 0', onClick: resetAll },
  ], {});

  status('loading the recorded run…');
  const off = Theme.onChange(() => { anim.redraw(); survPlot.render(); (mode === 'fit' ? sideLoss : sidePlot).render(); });
  const onResize = () => { anim.redraw(); survPlot.resize(); (mode === 'fit' ? sideLoss : sidePlot).resize(); };
  window.addEventListener('resize', onResize);
  return () => {
    anim.pause();
    if (fitRaf) cancelAnimationFrame(fitRaf);
    off(); window.removeEventListener('resize', onResize);
  };
}

window.Demos.register('dagger-run', mount);
