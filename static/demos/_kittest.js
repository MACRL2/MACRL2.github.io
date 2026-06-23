// _kittest.js — temporary demo used to verify the kit loader (removed later).
window.Demos.register('_kittest', (el, params, ctx) => {
  window.__kitMounts = (window.__kitMounts || 0) + 1;
  el.textContent = 'mounted; ctx=' + Object.keys(ctx).join(',');
  el.setAttribute('data-mounted', '1');
});
