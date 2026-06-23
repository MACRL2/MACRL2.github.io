// kit.js — the demo registry + lazy auto-mount loader. Auto-runs on load.
import { Theme } from './theme.js';
import { Plot } from './plot.js';
import { Anim, CanvasDraw, integrate } from './sim.js';
import { Controls } from './controls.js';
import { Diagram } from './diagram.js';
import * as linalg from './linalg.js';

const registry = new Map();          // name -> mountFn
const pending = new Map();           // name -> [els awaiting registration]
const mounted = new WeakMap();       // el -> { cleanup }

const ctx = { Theme, Plot, Anim, CanvasDraw, integrate, Controls, Diagram, linalg };

function parseParams(el) {
  try { return el.dataset.params ? JSON.parse(el.dataset.params) : {}; }
  catch (e) { console.error('[demo] bad data-params on', el, e); return {}; }
}

function mount(el) {
  if (mounted.has(el)) return;
  const name = el.dataset.demo;
  const fn = registry.get(name);
  if (!fn) {
    if (!pending.has(name)) pending.set(name, []);
    pending.get(name).push(el);
    ensureLoaded(name);
    return;
  }
  const cleanup = fn(el, parseParams(el), ctx) || null;
  mounted.set(el, { cleanup });
}

const loading = new Set();
function ensureLoaded(name) {
  if (loading.has(name) || registry.has(name)) return;
  loading.add(name);
  import(`/static/demos/${name}.js?v=${document.documentElement.dataset.build || ''}`)
    .catch(e => console.error(`[demo] failed to load ${name}`, e));
}

export const Demos = {
  register(name, mountFn) {
    registry.set(name, mountFn);
    const waiting = pending.get(name) || [];
    pending.delete(name);
    waiting.forEach(el => mount(el));
  },
  mountAll(root = document) {
    const els = root.querySelectorAll('.demo[data-demo]');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const el = entry.target;
        if (entry.isIntersecting) mount(el);
        else if (mounted.has(el) && entry.intersectionRatio === 0) {
          const rec = mounted.get(el);
          if (rec.cleanup) { rec.cleanup(); mounted.delete(el); }
        }
      });
    }, { rootMargin: '200px 0px' });
    els.forEach(el => io.observe(el));
  },
};

window.Demos = Demos;
if (document.readyState !== 'loading') Demos.mountAll();
else document.addEventListener('DOMContentLoaded', () => Demos.mountAll());
