// cartpole-learn.js — improve a linear policy u=-K·s by random search over
// episodes; plot best-so-far return (seconds balanced) vs episode.
import { DEFAULTS, deriv } from '/static/demos/cartpole-dynamics.js';

export function rollout(K, p, integrate, maxT = 6, dt = 0.02) {
  let s = [0, 0, 0.08, 0]; let ret = 0;
  for (let t = 0; t < maxT; t += dt) {
    const u = -(K[0] * s[0] + K[1] * s[1] + K[2] * s[2] + K[3] * s[3]);
    s = integrate((x) => deriv(x, u, p), s, dt, 'rk4');
    if (Math.abs(s[2]) > 0.6 || Math.abs(s[0]) > 2.4) break;
    ret += dt;
  }
  return ret;
}

function mount(el, params, ctx) {
  const { Plot, Controls, Theme, integrate } = ctx;
  el.innerHTML = `<div style="height:200px"><canvas style="width:100%;height:100%"></canvas></div>
    <div class="cp-controls"></div>
    <p class="cp-learn-status" style="color:var(--fg-muted);font-size:0.85rem"></p>`;
  const plot = Plot(el.querySelector('canvas'), { xLabel: 'episode', yLabel: 'best return (s)', ylim: [0, 6], series: [{ color: 'accent' }] });
  const p = { ...DEFAULTS };
  const SIGMA = 6;
  let K, best, ep; const xs = [], ys = [];
  function status() {
    el.querySelector('.cp-learn-status').textContent =
      `episode ${ep} · best return ${best.toFixed(2)}s · K=[${K.map(k => k.toFixed(1)).join(', ')}]`;
  }
  function reset() {
    K = [0, 0, 0, 0]; best = rollout(K, p, integrate); ep = 0;
    xs.length = 0; ys.length = 0; xs.push(0); ys.push(best);
    plot.setData(0, xs, ys).render(); status();
  }
  function stepEpisode() {
    ep++;
    const cand = K.map(k => k + (Math.random() * 2 - 1) * SIGMA);
    const r = rollout(cand, p, integrate);
    if (r > best) { best = r; K = cand; }
    xs.push(ep); ys.push(best); plot.setData(0, xs, ys).render(); status();
  }
  reset();
  Controls(el.querySelector('.cp-controls'), [
    { type: 'button', label: 'step episode', onClick: stepEpisode },
    { type: 'button', label: 'run 30', onClick: () => { for (let i = 0; i < 30; i++) stepEpisode(); } },
    { type: 'button', label: 'reset', onClick: reset },
  ], {});
  const off = Theme.onChange(() => plot.onTheme());
  const onResize = () => plot.resize();
  window.addEventListener('resize', onResize);
  return () => { off(); window.removeEventListener('resize', onResize); };
}
window.Demos.register('cartpole-learn', mount);
