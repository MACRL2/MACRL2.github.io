// bc-net.js — inference-only runtime for the driving policy. The network is
// TRAINED offline in PyTorch (tools/bc-lab/train_bc.py); this file just runs
// the exported weights forward — two convolutions and two dense layers — so
// the trained policy can drive live in the page. No learning code here, and
// JS-vs-PyTorch agreement is pinned by tests/bc-net.test.mjs.

// Build a net from one variant of static/demos/bc-weights.json.
export function buildNet(arch, w) {
  const net = { ...arch };
  for (const k of ['W1', 'b1', 'W2', 'b2', 'W3', 'b3', 'W4', 'b4']) net[k] = Float32Array.from(w[k]);
  return net;
}

export function paramCount(net) {
  return ['W1', 'b1', 'W2', 'b2', 'W3', 'b3', 'W4', 'b4'].reduce((n, k) => n + net[k].length, 0);
}

// valid-padding strided convolution + ReLU, HWC layout (matches the export)
function convRelu(x, W, H, C, wt, b, F, K, S) {
  const oW = (((W - K) / S) | 0) + 1, oH = (((H - K) / S) | 0) + 1;
  const out = new Float64Array(oW * oH * F);
  for (let oy = 0; oy < oH; oy++) for (let ox = 0; ox < oW; ox++) for (let oc = 0; oc < F; oc++) {
    let s = b[oc];
    for (let ky = 0; ky < K; ky++) for (let kx = 0; kx < K; kx++) {
      const xi = ((oy * S + ky) * W + (ox * S + kx)) * C, wi = ((oc * K + ky) * K + kx) * C;
      for (let ic = 0; ic < C; ic++) s += x[xi + ic] * wt[wi + ic];
    }
    out[(oy * oW + ox) * F + oc] = s > 0 ? s : 0;
  }
  return out;
}

export function forward(net, x) {
  const a1 = convRelu(x, net.inW, net.inH, 1, net.W1, net.b1, net.F1, net.K1, net.S);
  const a2 = convRelu(a1, net.o1, net.o1, net.F1, net.W2, net.b2, net.F2, net.K2, net.S);
  const h = new Float64Array(net.H);
  for (let j = 0; j < net.H; j++) {
    let s = net.b3[j];
    const row = j * net.flat;
    for (let i = 0; i < net.flat; i++) s += net.W3[row + i] * a2[i];
    h[j] = s > 0 ? s : 0;
  }
  let y = net.b4[0];
  for (let j = 0; j < net.H; j++) y += net.W4[j] * h[j];
  return y;
}

export function predict(net, x) {
  return Math.min(1, Math.max(-1, forward(net, x)));
}
