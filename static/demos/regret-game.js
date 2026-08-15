// regret-game.js — no-regret online learning, made tactile. A repeated game:
// each round the learner commits to a steering correction w, then the world
// reveals this round's "right answer" c_i — chosen ADVERSARIALLY against the
// learner's current commitment, the way a policy's own rollout distribution
// answers back in DAgger. Loss: (w − c_i)².
//
// Two learners on the identical revealed sequence:
//   fit-latest  : w_{i+1} = c_i            (chase the newest data — oscillates)
//   fit-all     : w_{i+1} = mean(c_1..c_i)  (Follow-The-Leader — no-regret)
// The plot shows AVERAGE REGRET vs rounds: cumulative loss minus the best
// fixed w in hindsight, divided by rounds. One curve refuses to go to zero.
import { rng } from '/static/demos/bc-car.js';

const N_MAX = 300;

function mount(el, params, ctx) {
  const { Plot, Controls, Theme } = ctx;
  el.innerHTML = `
    <div style="height:220px"><canvas style="width:100%;height:100%"></canvas></div>
    <div style="font-size:.75rem;color:var(--fg-muted)">x: rounds played · y: average regret —
      accent: fit ALL past rounds (Follow-The-Leader) · gray: fit only the latest round · dotted zero = no regret</div>
    <div class="bc-controls"></div>
    <p class="bc-status" style="color:var(--fg-muted);font-size:.85rem"></p>`;

  const plot = Plot(el.querySelector('canvas'), {
    xlim: [0, N_MAX],
    series: [{ color: 'faint', width: 1 }, { color: 'muted', width: 1.75 }, { color: 'accent', width: 2.25 }],
  });
  const statusEl = el.querySelector('.bc-status');
  const opts = { adv: 0.6 };

  function play() {
    const rand = rng(11);
    const a = opts.adv;
    const cs = [];
    let wLast = 0, wAll = 0, sumC = 0;
    let lossLast = 0, lossAll = 0;
    const xs = [0], yLast = [0], yAll = [0];
    for (let i = 1; i <= N_MAX; i++) {
      // the world answers the CURRENT commitments, adversarially, with jitter:
      // it pushes the target to the far side of wherever the learner stands.
      const jitter = (rand() - 0.5) * 0.2;
      const cLast = -Math.sign(wLast || (i % 2 ? 1 : -1)) * a + jitter;
      const cAll = -Math.sign(wAll || (i % 2 ? 1 : -1)) * a + jitter;
      // both learners face statistically identical adversaries; regret is
      // measured against each learner's own revealed sequence
      lossLast += (wLast - cLast) ** 2;
      lossAll += (wAll - cAll) ** 2;
      cs.push({ cLast, cAll });
      // updates
      wLast = cLast;                                  // fit the newest round only
      sumC += cAll; wAll = sumC / i;                  // fit the aggregate (FTL)
      // best fixed w in hindsight for each sequence = mean; its cumulative loss:
      if (i % 2 === 0 || i === N_MAX) {
        const best = (seq, key) => {
          const m = seq.reduce((s, c) => s + c[key], 0) / seq.length;
          return seq.reduce((s, c) => s + (m - c[key]) ** 2, 0);
        };
        xs.push(i);
        yLast.push((lossLast - best(cs, 'cLast')) / i);
        yAll.push((lossAll - best(cs, 'cAll')) / i);
      }
    }
    plot.setData(0, [0, N_MAX], [0, 0]);              // the no-regret line
    plot.setData(1, xs, yLast);
    plot.setData(2, xs, yAll);
    plot.render();
    statusEl.textContent =
      `after ${N_MAX} rounds: average regret ${yAll[yAll.length - 1].toFixed(3)} (fit-all, still falling) vs ` +
      `${yLast[yLast.length - 1].toFixed(3)} (fit-latest, stuck) — aggregation is what makes the average go to zero.`;
  }

  Controls(el.querySelector('.bc-controls'), [
    { type: 'slider', key: 'adv', label: 'adversary strength', min: 0.2, max: 1.0, step: 0.05, dp: 2 },
  ], opts, play);

  play();
  const off = Theme.onChange(() => plot.render());
  const onResize = () => plot.resize();
  window.addEventListener('resize', onResize);
  return () => { off(); window.removeEventListener('resize', onResize); };
}

window.Demos.register('regret-game', mount);
