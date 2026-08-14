// bc-cnn.js — a miniature PilotNet in plain JS: two strided conv layers, two
// dense layers, ~5.5k parameters, trained with Adam on mean-squared steering
// error. No framework, no DOM — Node-testable.
import { rng, gauss, clamp } from './bc-car.js';

const KEYS = ['W1', 'b1', 'W2', 'b2', 'W3', 'b3', 'W4', 'b4'];
const outDim = (n, k, s) => (((n - k) / s) | 0) + 1;

// image 24×24×1 → conv 5×5, stride 2, 6 ch → conv 3×3, stride 2, 12 ch
//               → dense 192→24 → dense 24→1 (steering)
export function createNet(seed = 1, inW = 24, inH = 24) {
  const r = rng(seed);
  const he = (n, fanIn) => {
    const a = new Float64Array(n), s = Math.sqrt(2 / fanIn);
    for (let i = 0; i < n; i++) a[i] = s * gauss(r);
    return a;
  };
  const F1 = 6, K1 = 5, F2 = 12, K2 = 3, S = 2, H = 24;
  const o1 = outDim(inW, K1, S), o2 = outDim(o1, K2, S), flat = o2 * o2 * F2;
  return {
    inW, inH, F1, K1, F2, K2, S, H, o1, o2, flat,
    W1: he(F1 * K1 * K1, K1 * K1), b1: new Float64Array(F1),
    W2: he(F2 * K2 * K2 * F1, K2 * K2 * F1), b2: new Float64Array(F2),
    W3: he(H * flat, flat), b3: new Float64Array(H),
    W4: he(H, H), b4: new Float64Array(1),
  };
}

export function paramCount(net) {
  return KEYS.reduce((n, k) => n + net[k].length, 0);
}

// --- conv primitives (valid padding, square kernel, HWC layout) ---------------
function convFwd(x, W, H, C, wt, b, F, K, S, out) {
  const oW = outDim(W, K, S), oH = outDim(H, K, S);
  for (let oy = 0; oy < oH; oy++) for (let ox = 0; ox < oW; ox++) for (let oc = 0; oc < F; oc++) {
    let s = b[oc];
    for (let ky = 0; ky < K; ky++) for (let kx = 0; kx < K; kx++) {
      const xi = ((oy * S + ky) * W + (ox * S + kx)) * C, wi = ((oc * K + ky) * K + kx) * C;
      for (let ic = 0; ic < C; ic++) s += x[xi + ic] * wt[wi + ic];
    }
    out[(oy * oW + ox) * F + oc] = s;
  }
}
function convBwd(x, W, H, C, wt, F, K, S, dout, gW, gb, dx) {
  const oW = outDim(W, K, S), oH = outDim(H, K, S);
  if (dx) dx.fill(0);
  for (let oy = 0; oy < oH; oy++) for (let ox = 0; ox < oW; ox++) for (let oc = 0; oc < F; oc++) {
    const d = dout[(oy * oW + ox) * F + oc];
    gb[oc] += d;
    for (let ky = 0; ky < K; ky++) for (let kx = 0; kx < K; kx++) {
      const xi = ((oy * S + ky) * W + (ox * S + kx)) * C, wi = ((oc * K + ky) * K + kx) * C;
      for (let ic = 0; ic < C; ic++) {
        gW[wi + ic] += d * x[xi + ic];
        if (dx) dx[xi + ic] += d * wt[wi + ic];
      }
    }
  }
}

export function makeCache(net) {
  const n1 = net.o1 * net.o1 * net.F1, n2 = net.flat;
  return {
    x: null, y: 0,
    z1: new Float64Array(n1), a1: new Float64Array(n1),
    z2: new Float64Array(n2), a2: new Float64Array(n2),
    z3: new Float64Array(net.H), h: new Float64Array(net.H),
    dz3: new Float64Array(net.H), da2: new Float64Array(n2), da1: new Float64Array(n1),
  };
}

export function forward(net, x, c) {
  c.x = x;
  convFwd(x, net.inW, net.inH, 1, net.W1, net.b1, net.F1, net.K1, net.S, c.z1);
  for (let i = 0; i < c.z1.length; i++) c.a1[i] = c.z1[i] > 0 ? c.z1[i] : 0;
  convFwd(c.a1, net.o1, net.o1, net.F1, net.W2, net.b2, net.F2, net.K2, net.S, c.z2);
  for (let i = 0; i < c.z2.length; i++) c.a2[i] = c.z2[i] > 0 ? c.z2[i] : 0;
  for (let j = 0; j < net.H; j++) {
    let s = net.b3[j];
    const row = j * net.flat;
    for (let i = 0; i < net.flat; i++) s += net.W3[row + i] * c.a2[i];
    c.z3[j] = s; c.h[j] = s > 0 ? s : 0;
  }
  let y = net.b4[0];
  for (let j = 0; j < net.H; j++) y += net.W4[j] * c.h[j];
  return (c.y = y);
}

export function backward(net, c, dy, g) {
  g.b4[0] += dy;
  for (let j = 0; j < net.H; j++) {
    g.W4[j] += dy * c.h[j];
    c.dz3[j] = c.z3[j] > 0 ? dy * net.W4[j] : 0;
  }
  c.da2.fill(0);
  for (let j = 0; j < net.H; j++) {
    const d = c.dz3[j]; if (!d) continue;
    const row = j * net.flat;
    g.b3[j] += d;
    for (let i = 0; i < net.flat; i++) {
      g.W3[row + i] += d * c.a2[i];
      c.da2[i] += d * net.W3[row + i];
    }
  }
  for (let i = 0; i < c.da2.length; i++) if (c.z2[i] <= 0) c.da2[i] = 0;
  convBwd(c.a1, net.o1, net.o1, net.F1, net.W2, net.F2, net.K2, net.S, c.da2, g.W2, g.b2, c.da1);
  for (let i = 0; i < c.da1.length; i++) if (c.z1[i] <= 0) c.da1[i] = 0;
  convBwd(c.x, net.inW, net.inH, 1, net.W1, net.F1, net.K1, net.S, c.da1, g.W1, g.b1, null);
}

// --- optimizer -----------------------------------------------------------------
export function gradsInit(net) {
  const g = {};
  for (const k of KEYS) g[k] = new Float64Array(net[k].length);
  return g;
}
export function adamInit(net) {
  const o = { t: 0, m: {}, v: {} };
  for (const k of KEYS) { o.m[k] = new Float64Array(net[k].length); o.v[k] = new Float64Array(net[k].length); }
  return o;
}
export function adamStep(net, g, o, lr = 2e-3, b1 = 0.9, b2 = 0.999, eps = 1e-8) {
  o.t++;
  const c1 = 1 - Math.pow(b1, o.t), c2 = 1 - Math.pow(b2, o.t);
  for (const k of KEYS) {
    const p = net[k], gr = g[k], m = o.m[k], v = o.v[k];
    for (let i = 0; i < p.length; i++) {
      m[i] = b1 * m[i] + (1 - b1) * gr[i];
      v[i] = b2 * v[i] + (1 - b2) * gr[i] * gr[i];
      p[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + eps);
    }
  }
}

// --- training loop ---------------------------------------------------------------
// One SGD step: sample a minibatch, average ∂/∂θ ‖π_θ(obs) − u_expert‖², Adam.
export function trainSteps(net, X, y, opt, g, cache, steps = 1, batch = 32, rand = Math.random, lr = 2e-3) {
  let lossSum = 0;
  for (let s = 0; s < steps; s++) {
    for (const k of KEYS) g[k].fill(0);
    let loss = 0;
    for (let b = 0; b < batch; b++) {
      const i = (rand() * X.length) | 0;
      const err = forward(net, X[i], cache) - y[i];
      loss += err * err;
      backward(net, cache, (2 * err) / batch, g);
    }
    adamStep(net, g, opt, lr);
    lossSum += loss / batch;
  }
  return lossSum / steps;
}

export function evalMSE(net, X, y, idx, cache) {
  let s = 0;
  for (const i of idx) { const e = forward(net, X[i], cache) - y[i]; s += e * e; }
  return s / (idx.length || 1);
}

export function predict(net, x, cache) {
  return clamp(forward(net, x, cache), -1, 1);
}
