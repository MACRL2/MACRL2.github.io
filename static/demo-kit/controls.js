// controls.js — render a small control panel bound to a state object.
// spec: array of { type:'slider'|'toggle'|'button', key, label, ... }
export function Controls(container, spec, state, onChange = () => {}) {
  container.classList.add('demo-controls');
  container.replaceChildren();
  const readouts = {};
  for (const c of spec) {
    const row = document.createElement('label');
    row.className = 'demo-control';
    if (c.type === 'slider') {
      const id = `ctl-${c.key}-${Math.floor(performance.now())}-${Math.floor(Math.random()*1e4)}`;
      row.htmlFor = id;
      const name = document.createElement('span'); name.className='ctl-label'; name.textContent = c.label;
      const input = document.createElement('input');
      Object.assign(input, { type:'range', id, min:c.min, max:c.max, step:c.step ?? 'any', value: state[c.key] ?? c.value });
      const out = document.createElement('output'); out.className='ctl-out';
      const fmt = (v) => `${(+v).toFixed(c.dp ?? 2)}${c.unit ? ' '+c.unit : ''}`;
      out.textContent = fmt(input.value); readouts[c.key]=()=>out.textContent=fmt(state[c.key]);
      input.addEventListener('input', () => { state[c.key]=+input.value; out.textContent=fmt(input.value); onChange(c.key, state[c.key]); });
      row.append(name, input, out);
    } else if (c.type === 'toggle') {
      const input = document.createElement('input'); input.type='checkbox'; input.checked = !!(state[c.key] ?? c.value);
      const name = document.createElement('span'); name.className='ctl-label'; name.textContent=c.label;
      input.addEventListener('change', ()=>{ state[c.key]=input.checked; onChange(c.key, input.checked); });
      row.append(input, name);
    } else if (c.type === 'button') {
      const btn = document.createElement('button'); btn.type='button'; btn.className='ctl-btn'; btn.textContent=c.label;
      btn.addEventListener('click', ()=> c.onClick && c.onClick());
      row.replaceChildren(btn);
    }
    container.append(row);
  }
  return { refresh() { Object.values(readouts).forEach(fn=>fn()); } };
}
