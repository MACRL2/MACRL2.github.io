// cartpole-diagram.js — annotated, progressively-revealed cart-pole schematic.
const SVG = `
<svg viewBox="0 0 360 200" class="cp-diagram" role="img" aria-label="Cart-pole schematic" style="max-width:420px;width:100%;color:var(--fg)">
  <line x1="20" y1="150" x2="340" y2="150" stroke="currentColor" stroke-opacity="0.4"/>
  <g data-tip="cart position x (control acts here)">
    <rect x="150" y="130" width="60" height="20" rx="3" fill="currentColor" fill-opacity="0.15" stroke="currentColor"/>
    <circle cx="163" cy="152" r="5" fill="currentColor"/><circle cx="197" cy="152" r="5" fill="currentColor"/>
  </g>
  <line x1="180" y1="130" x2="220" y2="60" stroke="currentColor" stroke-width="3" data-tip="pole angle θ from upright"/>
  <circle cx="220" cy="60" r="8" fill="currentColor" data-tip="pole mass m"/>
  <line x1="150" y1="140" x2="110" y2="140" stroke="currentColor" stroke-width="2" marker-end="url(#arr)" data-tip="control force F"/>
  <g data-reveal="loop" opacity="0">
    <text x="20" y="28" font-size="11" fill="currentColor">controller → F → plant → state → (back to controller)</text>
  </g>
  <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="currentColor"/></marker></defs>
</svg>`;

function mount(el, params, ctx) {
  el.innerHTML = SVG + `<p><button type="button" class="ctl-btn" data-reveal-trigger="loop">show control loop</button></p>`;
  ctx.Diagram(el.querySelector('svg'));
}
window.Demos.register('cartpole-diagram', mount);
