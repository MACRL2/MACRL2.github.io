// bc-compounding.js — the tightrope-walker picture of compounding error.
// A policy that errs with probability ε per step, where one mistake leaves the
// data distribution for good: accumulated cost grows like εT² — not the εT
// that a held-out validation set promises.
import { rng } from '/static/demos/bc-car.js';

const T = 150, PATHS = 12;

function mount(el, params, ctx) {
  const { Plot, Controls, Theme } = ctx;
  el.innerHTML = `
    <div style="height:230px"><canvas style="width:100%;height:100%"></canvas></div>
    <div style="font-size:.75rem;color:var(--fg-muted)">x: time step · y: accumulated mistakes —
      thin lines: individual rollouts · thick line: their average · gray line: the εt an i.i.d. test set predicts</div>
    <div class="bc-controls"></div>
    <p class="bc-status" style="color:var(--fg-muted);font-size:.85rem"></p>`;

  const series = [];
  for (let i = 0; i < PATHS; i++) series.push({ color: 'faint', width: 1 });
  series.push({ color: 'muted', width: 1.5 });   // i.i.d. promise: εt
  series.push({ color: 'accent', width: 2.25 }); // closed-loop mean
  const plot = Plot(el.querySelector('canvas'), { xlim: [0, T], series });
  const statusEl = el.querySelector('.bc-status');
  const opts = { eps: 0.01 };

  function recompute() {
    const rand = rng(7);
    const xs = Array.from({ length: T + 1 }, (_, t) => t);
    for (let k = 0; k < PATHS; k++) {
      let off = false, cost = 0;
      const ys = xs.map((t) => {
        if (t === 0) return 0;
        if (!off && rand() < opts.eps) off = true; // one mistake → off the data manifold
        if (off) cost += 1;                        // …and every step out there is wrong
        return cost;
      });
      plot.setData(k, xs, ys);
    }
    plot.setData(PATHS, xs, xs.map((t) => opts.eps * t));
    let cum = 0;
    const mean = xs.map((t) => (t === 0 ? 0 : (cum += 1 - Math.pow(1 - opts.eps, t))));
    plot.setData(PATHS + 1, xs, mean);
    plot.render();
    const iid = opts.eps * T, closed = mean[T];
    statusEl.textContent =
      `ε = ${opts.eps.toFixed(3)}: after ${T} steps, i.i.d. reasoning predicts ≈ ${iid.toFixed(1)} mistakes; ` +
      `the closed loop averages ${closed.toFixed(1)} — a ×${(closed / iid).toFixed(0)} blow-up.`;
  }

  Controls(el.querySelector('.bc-controls'), [
    { type: 'slider', key: 'eps', label: 'per-step mistake rate ε', min: 0.002, max: 0.05, step: 0.002, dp: 3 },
  ], opts, recompute);

  recompute();
  const off = Theme.onChange(() => plot.render());
  const onResize = () => plot.resize();
  window.addEventListener('resize', onResize);
  return () => { off(); window.removeEventListener('resize', onResize); };
}

window.Demos.register('bc-compounding', mount);
