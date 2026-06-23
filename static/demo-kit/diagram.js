// diagram.js — make an inline SVG interactive: hover tooltips on [data-tip],
// and click reveal of [data-reveal="ID"] via [data-reveal-trigger="ID"].
export function Diagram(svg, opts = {}) {
  const host = svg.closest('.demo') || svg.parentElement;
  host.classList.add('demo-diagram');
  let tip = host.querySelector('.diagram-tip');
  if (!tip) { tip = document.createElement('div'); tip.className='diagram-tip'; tip.hidden=true; host.append(tip); }

  svg.querySelectorAll('[data-tip]').forEach(el => {
    el.style.cursor = 'help';
    el.addEventListener('mouseenter', () => {
      tip.textContent = el.getAttribute('data-tip'); tip.hidden = false;
      const r = host.getBoundingClientRect(), b = el.getBoundingClientRect();
      tip.style.left = (b.left - r.left + b.width/2) + 'px';
      tip.style.top = (b.top - r.top) + 'px';
    });
    el.addEventListener('mouseleave', () => { tip.hidden = true; });
  });

  svg.querySelectorAll('[data-reveal]').forEach(el => { el.style.opacity = opts.startRevealed ? 1 : 0; });
  host.querySelectorAll('[data-reveal-trigger]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-reveal-trigger');
      svg.querySelectorAll(`[data-reveal="${id}"]`).forEach(el => {
        el.style.transition = 'opacity 250ms ease';
        el.style.opacity = el.style.opacity === '1' ? '0' : '1';
      });
      btn.classList.toggle('is-on');
    });
  });
  return { };
}
