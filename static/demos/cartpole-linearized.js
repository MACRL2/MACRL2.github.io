// cartpole-linearized.js — closed-loop step response + closed-loop poles as the
// reader tunes pole mass/length and the θ feedback-gain magnitude.
import { DEFAULTS, deriv, feedback, K_DEFAULT } from '/static/demos/cartpole-dynamics.js';

function mount(el, params, ctx) {
  const { Plot, Controls, Theme, integrate, linalg } = ctx;
  el.innerHTML = `<div style="height:220px"><canvas style="width:100%;height:100%"></canvas></div>
    <div class="cp-controls"></div>
    <p class="cp-poles" style="font-variant-numeric:tabular-nums;color:var(--fg-muted);font-size:0.85rem"></p>`;
  const plot = Plot(el.querySelector('canvas'), { xLabel:'t (s)', yLabel:'θ (rad)', xlim:[0,4], series:[{color:'accent'}] });
  // kth is a positive GAIN MAGNITUDE; the controller applies K[2] = -kth (stabilizing sign).
  const state = { m: DEFAULTS.m, l: DEFAULTS.l, kth: -K_DEFAULT[2] };

  function gainVec() { const K = [...K_DEFAULT]; K[2] = -state.kth; return K; }

  function recompute() {
    const p = { ...DEFAULTS, m: state.m, l: state.l };
    const K = gainVec();
    const u = (x) => feedback(x, K);
    let s = [0, 0, 0.15, 0]; const ts = [], ys = [];
    for (let t = 0; t <= 4; t += 0.02) { ts.push(t); ys.push(s[2]); s = integrate((x) => deriv(x, u(x), p), s, 0.02, 'rk4'); }
    plot.setData(0, ts, ys).render();
    const { A, B } = linalg.linearize((x, uu) => deriv(x, uu[0], p), [0, 0, 0, 0], [0]);
    const Acl = A.map((row, i) => row.map((a, j) => a - B[i][0] * K[j]));
    const roots = linalg.polyroots(linalg.charpoly(Acl));
    const stable = roots.every(r => r.re < 0);
    el.querySelector('.cp-poles').textContent =
      `closed-loop poles: ${roots.map(r => `${r.re.toFixed(2)}${r.im >= 0 ? '+' : '−'}${Math.abs(r.im).toFixed(2)}i`).join(',  ')}  — ${stable ? 'stable' : 'UNSTABLE'}`;
  }
  Controls(el.querySelector('.cp-controls'), [
    { type: 'slider', key: 'm', min: 0.05, max: 1.0, step: 0.01, value: state.m, label: 'pole mass m', unit: 'kg' },
    { type: 'slider', key: 'l', min: 0.25, max: 1.0, step: 0.01, value: state.l, label: 'pole length l', unit: 'm' },
    { type: 'slider', key: 'kth', min: 5, max: 60, step: 1, value: state.kth, label: 'θ gain', unit: '' },
  ], state, recompute);
  const off = Theme.onChange(() => plot.onTheme());
  const onResize = () => plot.resize();
  window.addEventListener('resize', onResize);
  recompute();
  return () => { off(); window.removeEventListener('resize', onResize); };
}
window.Demos.register('cartpole-linearized', mount);
