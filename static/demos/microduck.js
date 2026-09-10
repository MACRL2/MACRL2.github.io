// microduck.js — embeds the standalone microduck-viewer (a separate repo, same
// origin: macrl2.github.io/microduck-viewer/) as a lazy iframe, so this content
// repo carries no wasm/physics/render code. The heavy sim only loads once the
// panel scrolls near the viewport. Optional host-rendered Push/Reset drive the
// iframe over postMessage; the site theme is mirrored in too.
//
// params (data-params JSON):
//   route    — viewer route to embed (default "balance")
//   controls — "host" to render Push/Reset on the page (default: none; the
//              iframe shows its own controls)
//   ratio    — CSS aspect-ratio for the panel (default "16 / 9")

const VIEWER_BASE = 'https://macrl2.github.io/microduck-viewer';
const themeNow = () =>
  (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

// Resolve any CSS color (incl. oklch) to #rrggbb via a 1px canvas readback, so
// the embedded sim's background/ground can match the page exactly.
function toHex(cssColor) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillStyle = cssColor; ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}
const pageBg = () => toHex(getComputedStyle(document.body).backgroundColor);

window.Demos.register('microduck', (el, params, ctx) => {
  const route = params.route || 'balance';
  const wantHostControls = params.controls === 'host';
  const ratio = params.ratio || '16 / 9';

  el.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'microduck-panel';
  panel.style.cssText =
    `position:relative; aspect-ratio:${ratio}; width:100%; border-radius:12px;` +
    'overflow:hidden; border:1px solid var(--rule, rgba(128,128,128,.25));' +
    'background:var(--bg-soft, rgba(128,128,128,.06));';
  const hint = document.createElement('div');
  hint.textContent = 'microduck sim — scroll into view to load';
  hint.style.cssText =
    'position:absolute; inset:0; display:grid; place-items:center;' +
    'color:var(--fg-muted); font-size:.9rem;';
  panel.appendChild(hint);
  el.appendChild(panel);

  let iframe = null;
  const post = (type, value) => iframe && iframe.contentWindow &&
    iframe.contentWindow.postMessage({ type, value }, VIEWER_BASE);

  // Host-rendered controls (opt-in) — reuse the kit's demo-control styling.
  if (wantHostControls) {
    const bar = document.createElement('div');
    bar.className = 'demo-controls';
    bar.style.cssText = 'display:flex; gap:.5rem; margin-top:.6rem;';
    const mk = (label, type) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.style.cssText =
        'padding:.5rem .9rem; border:1px solid var(--rule,rgba(128,128,128,.3));' +
        'border-radius:8px; background:var(--bg-soft,transparent); color:var(--fg);' +
        'font:inherit; cursor:pointer;';
      b.addEventListener('click', () => post('microduck:' + type));
      return b;
    };
    bar.append(mk('Push ↯', 'push'), mk('Reset', 'reset'));
    el.appendChild(bar);
  }

  // Lazy-load the iframe when the panel nears the viewport.
  function load() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.title = 'microduck simulation';
    iframe.loading = 'lazy';
    iframe.allow = 'accelerometer; gyroscope';
    iframe.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; border:0;';
    iframe.src = `${VIEWER_BASE}/${route}/?theme=${themeNow()}&bg=${encodeURIComponent(pageBg())}`;
    iframe.addEventListener('load', () => hint.remove());
    panel.appendChild(iframe);
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { load(); io.disconnect(); break; }
  }, { rootMargin: '200px' });
  io.observe(panel);

  // Mirror the site's light/dark toggle (and the resolved page color) into the iframe.
  const mo = new MutationObserver(() => iframe && iframe.contentWindow &&
    iframe.contentWindow.postMessage({ type: 'microduck:theme', value: themeNow(), bg: pageBg() }, VIEWER_BASE));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  return () => { io.disconnect(); mo.disconnect(); if (iframe) iframe.remove(); };
});
