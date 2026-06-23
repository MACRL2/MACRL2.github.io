// cartpole-sim.js — an animated cart-pole the reader controls.
import { DEFAULTS, deriv, feedback, K_DEFAULT } from '/static/demos/cartpole-dynamics.js';

function mount(el, params, ctx) {
  const { Anim, Controls, Theme } = ctx;
  el.innerHTML = `<div style="height:240px"><canvas style="width:100%;height:100%"></canvas></div><div class="cp-controls"></div>`;
  const canvas = el.querySelector('canvas');
  const p = { ...DEFAULTS };
  const opts = { control: true, kth: -K_DEFAULT[2] }; // positive magnitude; applied as -kth

  function gainVec() { const K = [...K_DEFAULT]; K[2] = -opts.kth; return K; }

  const draw = (g, s) => {
    const t = Theme.tokens();
    g.fit(); g.setWorld({ x0: -2.4, x1: 2.4, y0: -0.6, y1: 1.6 }); g.clear();
    const c = g.ctx;
    const trackY = g.sy(0);
    c.strokeStyle = t.rule; c.lineWidth = g.px(1.5);
    c.beginPath(); c.moveTo(g.sx(-2.4), trackY); c.lineTo(g.sx(2.4), trackY); c.stroke();
    const cartW = g.sx(0.4) - g.sx(0), cartH = g.px(22), cx = g.sx(s[0]);
    c.fillStyle = t.surface; c.strokeStyle = t.fg; c.lineWidth = g.px(1.5);
    c.beginPath(); c.rect(cx - cartW / 2, trackY - cartH, cartW, cartH); c.fill(); c.stroke();
    const pivotY = trackY - cartH;
    const poleLen = g.sy(0) - g.sy(p.l * 2);          // pixels, positive
    const ex = cx + Math.sin(s[2]) * poleLen;
    const ey = pivotY - Math.cos(s[2]) * poleLen;
    c.strokeStyle = t.accent; c.lineWidth = g.px(4); c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx, pivotY); c.lineTo(ex, ey); c.stroke();
    c.fillStyle = t.accent; c.beginPath(); c.arc(ex, ey, g.px(8), 0, Math.PI * 2); c.fill();
  };

  const anim = Anim({
    state: [0, 0, 0.05, 0],
    deriv: (s) => deriv(s, opts.control ? feedback(s, gainVec()) : 0, p),
    dt: 0.01, integrator: 'rk4', canvas, draw, autoplay: false,
  });

  Controls(el.querySelector('.cp-controls'), [
    { type: 'button', label: 'play', onClick: () => anim.play() },
    { type: 'button', label: 'pause', onClick: () => anim.pause() },
    { type: 'button', label: 'reset', onClick: () => anim.reset() },
    { type: 'button', label: 'nudge', onClick: () => { anim.state[3] += 1.5; anim.redraw(); } },
    { type: 'toggle', key: 'control', value: true, label: 'controller on' },
    { type: 'slider', key: 'kth', min: 0, max: 60, step: 1, value: opts.kth, label: 'θ gain' },
  ], opts);

  const off = Theme.onChange(() => anim.redraw());
  return () => { anim.pause(); off(); };
}
window.Demos.register('cartpole-sim', mount);
