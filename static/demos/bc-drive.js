// bc-drive.js — the driving lab, before any learning: a closed road, a
// pure-pursuit expert, and the egocentric camera image that will be the
// policy's entire sensorium. Nudge the car to see that the expert can recover
// — then notice it never needs to, which is exactly what poisons the dataset.
import {
  makeTrack, makeField, observe, expertSteer, stepCar, startState, CAR, OBS,
} from '/static/demos/bc-car.js';
import {
  fitWorld, drawTrack, drawTrail, drawCar, drawObsView,
} from '/static/demos/bc-render.js';

function mount(el, params, ctx) {
  const { Anim, Controls, Theme } = ctx;
  el.innerHTML = `
    <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-start">
      <div style="flex:1 1 300px;min-width:240px"><div style="height:300px">
        <canvas class="bc-track" style="width:100%;height:100%"></canvas>
      </div></div>
      <div style="flex:0 0 170px;display:flex;flex-direction:column;gap:.5rem">
        <canvas class="bc-obs" style="width:170px;height:170px"></canvas>
        <div style="font-size:.75rem;color:var(--fg-muted);line-height:1.4">
          what the policy will see: a 24×24 egocentric patch, car (▲) at
          bottom-center, always heading up
        </div>
      </div>
    </div>
    <div class="bc-controls" style="display:flex;flex-wrap:wrap;gap:.5rem .75rem;align-items:center"></div>
    <p class="bc-status" style="color:var(--fg-muted);font-size:.85rem"></p>`;

  const track = makeTrack();
  const field = makeField(track);
  const trackCanvas = el.querySelector('.bc-track');
  const obsCanvas = el.querySelector('.bc-obs');
  const statusEl = el.querySelector('.bc-status');
  const dpr = window.devicePixelRatio || 1;
  obsCanvas.width = 170 * dpr; obsCanvas.height = 170 * dpr;

  const obsBuf = new Float32Array(OBS.w * OBS.h);
  let nudgeSign = 1, lastU = 0;

  const step = (s) => {
    lastU = expertSteer(s.car, track);
    s.car = stepCar(s.car, lastU);
    s.trail.push([s.car.x, s.car.y]);
    if (s.trail.length > 500) s.trail.shift();
    return s;
  };

  const draw = (g, s) => {
    const t = Theme.tokens();
    g.fit(); g.clear();
    fitWorld(g, track.bounds);
    drawTrack(g, track, t);
    drawTrail(g, s.trail, t.accent);
    drawCar(g, s.car, t.accent);
    drawObsView(obsCanvas, observe(s.car, field, track.halfWidth, OBS, obsBuf), OBS, t);
    const e = track.nearest(s.car.x, s.car.y).e;
    statusEl.textContent =
      `cross-track error e = ${e >= 0 ? '+' : ''}${e.toFixed(2)} · steering u = ${lastU >= 0 ? '+' : ''}${lastU.toFixed(2)}`;
  };

  const anim = Anim({
    state: { car: startState(track, 0), trail: [] },
    step, dt: CAR.dt, canvas: trackCanvas, draw, autoplay: false,
  });

  Controls(el.querySelector('.bc-controls'), [
    { type: 'button', label: 'play', onClick: () => anim.play() },
    { type: 'button', label: 'pause', onClick: () => anim.pause() },
    { type: 'button', label: 'reset', onClick: () => anim.reset() },
    { type: 'button', label: 'nudge', onClick: () => { anim.state.car.psi += 0.25 * nudgeSign; nudgeSign = -nudgeSign; anim.redraw(); } },
  ], {});

  const off = Theme.onChange(() => anim.redraw());
  const onResize = () => anim.redraw();
  window.addEventListener('resize', onResize);
  return () => { anim.pause(); off(); window.removeEventListener('resize', onResize); };
}

window.Demos.register('bc-drive', mount);
