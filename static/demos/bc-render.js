// bc-render.js — shared canvas drawing for the driving-lab demos: the top-down
// track view, the policy's camera view, and the dataset histogram. Pure
// functions of (drawing surface, data, theme tokens) — no imports, no globals.

// Expand the track bounds to the canvas aspect ratio (centered) so the world
// isn't distorted, then hand the box to CanvasDraw.
export function fitWorld(g, bounds, pad = 1.2) {
  const c = g.ctx.canvas;
  const cx = (bounds.x0 + bounds.x1) / 2, cy = (bounds.y0 + bounds.y1) / 2;
  let sx = bounds.x1 - bounds.x0 + 2 * pad, sy = bounds.y1 - bounds.y0 + 2 * pad;
  const aspect = c.width / (c.height || 1);
  if (sx / sy < aspect) sx = sy * aspect; else sy = sx / aspect;
  g.setWorld({ x0: cx - sx / 2, x1: cx + sx / 2, y0: cy - sy / 2, y1: cy + sy / 2 });
}

function tracePath(g, pts, close) {
  const c = g.ctx;
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(g.sx(p[0]), g.sy(p[1])) : c.moveTo(g.sx(p[0]), g.sy(p[1]))));
  if (close) c.closePath();
}

export function drawTrack(g, track, t) {
  const c = g.ctx;
  const pxPerUnit = Math.abs(g.sx(1) - g.sx(0));
  // road surface: the centerline stroked at full road width
  tracePath(g, track.pts, true);
  c.strokeStyle = t.rule; c.lineJoin = 'round'; c.lineCap = 'round';
  c.lineWidth = 2 * track.halfWidth * pxPerUnit;
  c.stroke();
  // dashed centerline
  tracePath(g, track.pts, true);
  c.setLineDash([g.px(5), g.px(7)]);
  c.strokeStyle = t.faint; c.lineWidth = g.px(1);
  c.stroke();
  c.setLineDash([]);
  // start line
  const [ax, ay] = track.pointAt(0), h = track.headingAt(0);
  const nx = -Math.sin(h) * track.halfWidth, ny = Math.cos(h) * track.halfWidth;
  c.beginPath();
  c.moveTo(g.sx(ax - nx), g.sy(ay - ny)); c.lineTo(g.sx(ax + nx), g.sy(ay + ny));
  c.strokeStyle = t.muted; c.lineWidth = g.px(1.5);
  c.stroke();
}

export function drawTrail(g, trail, color, alpha = 0.45) {
  if (trail.length < 2) return;
  const c = g.ctx;
  tracePath(g, trail, false);
  c.globalAlpha = alpha;
  c.strokeStyle = color; c.lineWidth = g.px(1.5); c.lineJoin = 'round';
  c.stroke();
  c.globalAlpha = 1;
}

export function drawCar(g, car, color) {
  const c = g.ctx;
  const cos = Math.cos(car.psi), sin = Math.sin(car.psi);
  const local = [[0.62, 0], [-0.38, 0.3], [-0.2, 0], [-0.38, -0.3]];
  c.beginPath();
  local.forEach(([fx, fy], i) => {
    const x = g.sx(car.x + fx * cos - fy * sin), y = g.sy(car.y + fx * sin + fy * cos);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  });
  c.closePath();
  c.fillStyle = color;
  c.fill();
}

// The policy's camera image, magnified: road = ink, off-road = page. The small
// marker at bottom-center is the car itself (always at the same pixel — the
// image is egocentric).
export function drawObsView(canvas, obs, o, t) {
  const c = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, cw = W / o.w, ch = H / o.h;
  c.clearRect(0, 0, W, H);
  c.fillStyle = t.fg;
  for (let r = 0; r < o.h; r++) for (let k = 0; k < o.w; k++) {
    const v = obs[r * o.w + k];
    if (v < 0.03) continue;
    c.globalAlpha = v * 0.85;
    c.fillRect(k * cw, r * ch, cw + 0.5, ch + 0.5);
  }
  c.globalAlpha = 1;
  // ego marker at the row where forward distance = 0
  const ey = ((o.ahead / (o.ahead + o.behind)) * o.h + 0.5) * ch, ex = W / 2;
  c.beginPath();
  c.moveTo(ex, ey - ch * 0.9); c.lineTo(ex + cw * 0.7, ey + ch * 0.7); c.lineTo(ex - cw * 0.7, ey + ch * 0.7);
  c.closePath();
  c.fillStyle = t.accent; c.fill();
  c.strokeStyle = t.rule; c.lineWidth = 1;
  c.strokeRect(0.5, 0.5, W - 1, H - 1);
}

// Histogram of cross-track error in the training data, with the deployed car's
// current e as a marker line: "here is everything the network has seen, and
// here is where you are now."
export function drawHist(canvas, bins, range, t, marker, roadEdge = 1) {
  const c = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const X = (e) => ((e + range) / (2 * range)) * W;
  c.clearRect(0, 0, W, H);
  const max = Math.max(1, ...bins);
  const bw = W / bins.length;
  c.fillStyle = t.muted; c.globalAlpha = 0.6;
  for (let i = 0; i < bins.length; i++) {
    const h = (bins[i] / max) * (H - 8);
    if (h > 0) c.fillRect(i * bw, H - 2 - h, Math.max(1, bw - 1), h);
  }
  c.globalAlpha = 1;
  // road edges
  c.strokeStyle = t.faint; c.lineWidth = 1; c.setLineDash([3, 3]);
  for (const e of [-roadEdge, roadEdge]) {
    c.beginPath(); c.moveTo(X(e), 2); c.lineTo(X(e), H - 2); c.stroke();
  }
  c.setLineDash([]);
  // baseline
  c.strokeStyle = t.rule;
  c.beginPath(); c.moveTo(0, H - 1.5); c.lineTo(W, H - 1.5); c.stroke();
  if (marker != null && isFinite(marker)) {
    const x = Math.min(W - 1.5, Math.max(1.5, X(marker)));
    c.strokeStyle = t.accent; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
  }
}
