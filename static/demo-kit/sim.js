// sim.js — numerical integration + a requestAnimationFrame loop for live demos.
// integrate() is pure (Node-testable). Anim/CanvasDraw use browser APIs only
// inside methods, so this module imports cleanly under Node.

// --- pure: fixed-step integrators -------------------------------------------
export function integrate(deriv, state, dt, method = 'rk4') {
  if (method === 'euler') {
    const d = deriv(state);
    return state.map((s, i) => s + dt * d[i]);
  }
  const add = (a, b, h) => a.map((x, i) => x + h * b[i]);
  const k1 = deriv(state);
  const k2 = deriv(add(state, k1, dt / 2));
  const k3 = deriv(add(state, k2, dt / 2));
  const k4 = deriv(add(state, k3, dt));
  return state.map((s, i) => s + (dt / 6) * (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]));
}

// --- browser: animation loop ------------------------------------------------
const REDUCED = () => typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Anim(opts) {
  // opts: { state, step(state, dt)->state OR deriv(state)->dstate, draw(g, state),
  //         dt=0.01, speed=1, autoplay=false, integrator='rk4', canvas }
  const o = Object.assign({ dt: 0.01, speed: 1, autoplay: false, integrator: 'rk4' }, opts);
  const initial = JSON.parse(JSON.stringify(o.state));
  let state = o.state, raf = null, last = null, acc = 0;
  const listeners = { tick: [] };
  const g = o.canvas ? CanvasDraw(o.canvas) : null;

  const advance = () => o.step
    ? o.step(state, o.dt)
    : integrate(o.deriv, state, o.dt, o.integrator);

  function frame(ts) {
    if (last == null) last = ts;
    acc += Math.min(0.05, (ts - last) / 1000) * o.speed;
    last = ts;
    while (acc >= o.dt) { state = advance(); acc -= o.dt; }
    redraw();
    listeners.tick.forEach((f) => f(state));
    raf = requestAnimationFrame(frame);
  }
  function redraw() { if (o.draw) o.draw(g, state); }
  const api = {
    play() { if (raf == null) { last = null; raf = requestAnimationFrame(frame); } },
    pause() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } },
    reset() { state = JSON.parse(JSON.stringify(initial)); redraw(); listeners.tick.forEach((f)=>f(state)); },
    step1() { state = advance(); redraw(); listeners.tick.forEach((f)=>f(state)); },
    redraw,
    get state() { return state; },
    set state(v) { state = v; },
    set speed(v) { o.speed = v; },
    on(evt, fn) { (listeners[evt] ||= []).push(fn); },
  };
  redraw();
  if (o.autoplay && !REDUCED()) api.play();
  return api;
}

// --- browser: thin Canvas2D wrapper with world->pixel mapping ---------------
export function CanvasDraw(canvas) {
  const dpr = window.devicePixelRatio || 1;
  function fit() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }
  fit();
  const ctx = canvas.getContext('2d');
  let world = { x0: -1, x1: 1, y0: -1, y1: 1 };
  const W = () => canvas.width, H = () => canvas.height;
  return {
    ctx,
    fit,
    setWorld(b) { world = b; },
    clear() { ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,W(),H()); },
    sx(x) { return ((x - world.x0) / (world.x1 - world.x0)) * W(); },
    sy(y) { return H() - ((y - world.y0) / (world.y1 - world.y0)) * H(); },
    px(p) { return p * dpr; },
  };
}
