// plot.js — pure scaling helpers + a small Canvas2D line/scatter plotter.
import { Theme } from './theme.js';

export function scale(domain, range) {
  const [d0,d1]=domain, [r0,r1]=range; const span=(d1-d0)||1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}
export function niceTicks(min, max, count = 5) {
  const span = (max - min) || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let t = start; t <= max + step*0.5; t += step) ticks.push(Number(t.toFixed(10)));
  return ticks;
}

export function Plot(canvas, opts = {}) {
  const o = Object.assign({ xLabel:'', yLabel:'', xlim:null, ylim:null, series:[] }, opts);
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');
  const data = o.series.map(() => ({ xs: [], ys: [] }));
  const pad = { l: 44*dpr, r: 10*dpr, t: 10*dpr, b: 28*dpr };

  function fit() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width*dpr); canvas.height = Math.round(r.height*dpr);
  }
  function bounds() {
    let xs = [].concat(...data.map(d=>d.xs)), ys = [].concat(...data.map(d=>d.ys));
    const xlim = o.xlim || [Math.min(...xs, 0), Math.max(...xs, 1)];
    const ylim = o.ylim || [Math.min(...ys, 0), Math.max(...ys, 1)];
    return { xlim, ylim };
  }
  function color(name, t) { return t[name] || name; }

  function render() {
    const t = Theme.tokens();
    const { xlim, ylim } = bounds();
    const W = canvas.width, H = canvas.height;
    const X = scale(xlim, [pad.l, W - pad.r]);
    const Y = scale(ylim, [H - pad.b, pad.t]);
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,W,H);
    ctx.strokeStyle = t.rule; ctx.fillStyle = t.muted;
    ctx.lineWidth = 1*dpr; ctx.font = `${12*dpr}px ui-serif, Georgia, serif`;
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, H-pad.b); ctx.lineTo(W-pad.r, H-pad.b); ctx.stroke();
    ctx.textAlign='right'; ctx.textBaseline='middle';
    niceTicks(ylim[0], ylim[1]).forEach(v=>{ const y=Y(v); ctx.fillText(String(v), pad.l-6*dpr, y); });
    ctx.textAlign='center'; ctx.textBaseline='top';
    niceTicks(xlim[0], xlim[1]).forEach(v=>{ const x=X(v); ctx.fillText(String(v), x, H-pad.b+6*dpr); });
    o.series.forEach((s, i) => {
      const d = data[i]; if (!d.xs.length) return;
      ctx.strokeStyle = color(s.color || 'accent', t); ctx.lineWidth = (s.width||1.5)*dpr;
      ctx.beginPath();
      d.xs.forEach((x, k) => { const px=X(x), py=Y(d.ys[k]); k? ctx.lineTo(px,py):ctx.moveTo(px,py); });
      ctx.stroke();
    });
  }

  fit();
  const api = {
    setData(i, xs, ys) { data[i] = { xs: xs.slice(), ys: ys.slice() }; return api; },
    push(i, x, y) { data[i].xs.push(x); data[i].ys.push(y); return api; },
    clear(i) { if (i==null) data.forEach(d=>{d.xs=[];d.ys=[];}); else data[i]={xs:[],ys:[]}; return api; },
    render, resize() { fit(); render(); }, onTheme: render,
  };
  return api;
}
