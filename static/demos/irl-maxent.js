// irl-maxent.js — visualization only. The heading-aware grid model and
// MaxEnt optimization run in tools/irl-lab/maxent_irl.py (PyTorch), which
// exports the checkpoints and paths in irl-maxent.json.

function canvasContext(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, width: rect.width, height: rect.height };
}

function mount(el, params, ctx) {
  const { Controls, Theme } = ctx;
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.1rem;align-items:start">
      <section>
        <div style="font-size:.78rem;color:var(--fg-muted);margin-bottom:.35rem">8-connected grass grid · pond in the middle · tree stands on both sides</div>
        <canvas class="irl-grid" role="img" aria-label="Grid world with grass, a central pond, trees, and expert and learned bicycle paths" style="display:block;width:100%;height:455px"></canvas>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;font-size:.72rem;color:var(--fg-muted);margin-top:.25rem">
          <span>solid accent: learned best path</span><span>dashed: one expert trip</span><span>◎: bicycle</span>
        </div>
      </section>
      <section style="display:grid;gap:.8rem">
        <div>
          <div style="font-size:.78rem;color:var(--fg-muted);margin-bottom:.25rem">reward weights · vertical rule = zero</div>
          <canvas class="irl-weights" role="img" aria-label="Learned terrain and motion reward weights" style="display:block;width:100%;height:190px"></canvas>
        </div>
        <div>
          <div style="font-size:.78rem;color:var(--fg-muted);margin-bottom:.25rem">mean feature counts · expert data (gray) vs reward model (accent)</div>
          <canvas class="irl-counts" role="img" aria-label="Demonstrated and learned model feature counts" style="display:block;width:100%;height:190px"></canvas>
        </div>
      </section>
    </div>
    <div class="irl-controls"></div>
    <p class="irl-status" aria-live="polite" style="color:var(--fg-muted);font-size:.85rem;margin-bottom:0">loading the recorded PyTorch run…</p>`;

  const gridCanvas = el.querySelector('.irl-grid');
  const weightCanvas = el.querySelector('.irl-weights');
  const countCanvas = el.querySelector('.irl-counts');
  const statusEl = el.querySelector('.irl-status');
  let data = null;
  let sample = 0;
  let bikeStep = 0;
  let replayTimer = null;
  let rideTimer = null;
  let alive = true;
  const state = { checkpoint: 0, reveal: false };

  function cellKey(x, y) { return `${x},${y}`; }

  function drawBicycle(g, point, cx, cy, cell, tokens) {
    const direction = data.config.directions[point[2]];
    const angle = Math.atan2(direction[1], direction[0]);
    const size = Math.max(5, cell * 0.22);
    g.save();
    g.translate(cx, cy); g.rotate(angle);
    g.strokeStyle = tokens.fg; g.fillStyle = tokens.bg; g.lineWidth = Math.max(1.5, cell * 0.06);
    // Top-down bicycle: wheels fore/aft, frame triangle, and a heading nose.
    for (const x of [-size, size]) {
      g.beginPath(); g.arc(x, 0, size * 0.34, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.beginPath(); g.moveTo(-size * 0.7, 0); g.lineTo(0, -size * 0.55);
    g.lineTo(size * 0.55, 0); g.lineTo(-size * 0.7, 0); g.stroke();
    g.beginPath(); g.moveTo(size * 0.5, -size * 0.48); g.lineTo(size * 1.08, 0);
    g.lineTo(size * 0.5, size * 0.48); g.stroke();
    g.restore();
  }

  function drawGrid(path, expertPath, tokens) {
    const { g, width, height } = canvasContext(gridCanvas);
    g.clearRect(0, 0, width, height);
    const pad = 18;
    const cell = Math.min((width - 2 * pad) / data.config.width, (height - 2 * pad) / data.config.height);
    const boardW = cell * data.config.width, boardH = cell * data.config.height;
    const left = (width - boardW) / 2, top = (height - boardH) / 2;
    const center = (x, y) => [left + (x + 0.5) * cell, top + (y + 0.5) * cell];
    const water = new Set(data.config.water.map(([x, y]) => cellKey(x, y)));
    const trees = new Set(data.config.trees.map(([x, y]) => cellKey(x, y)));

    g.fillStyle = tokens.surface;
    g.fillRect(left, top, boardW, boardH);
    for (let y = 0; y < data.config.height; y++) {
      for (let x = 0; x < data.config.width; x++) {
        const x0 = left + x * cell, y0 = top + y * cell;
        if (water.has(cellKey(x, y))) {
          g.fillStyle = tokens.accent; g.globalAlpha = 0.18;
          g.fillRect(x0, y0, cell, cell); g.globalAlpha = 1;
          g.strokeStyle = tokens.accent; g.lineWidth = 1;
          for (let k = 0; k < 2; k++) {
            const wy = y0 + cell * (0.36 + k * 0.3);
            g.beginPath();
            g.moveTo(x0 + cell * 0.18, wy);
            g.quadraticCurveTo(x0 + cell * 0.38, wy - cell * 0.12, x0 + cell * 0.55, wy);
            g.quadraticCurveTo(x0 + cell * 0.72, wy + cell * 0.12, x0 + cell * 0.88, wy);
            g.stroke();
          }
        } else if (trees.has(cellKey(x, y))) {
          const [cx, cy] = center(x, y);
          g.strokeStyle = tokens.muted; g.fillStyle = tokens.muted; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(cx, cy + cell * 0.3); g.lineTo(cx, cy - cell * 0.03); g.stroke();
          g.globalAlpha = 0.28;
          g.beginPath(); g.arc(cx, cy - cell * 0.14, cell * 0.28, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
          g.beginPath(); g.arc(cx, cy - cell * 0.14, cell * 0.28, 0, Math.PI * 2); g.stroke();
        } else {
          // Sparse grass strokes make the base terrain legible without a new color.
          g.strokeStyle = tokens.faint; g.globalAlpha = 0.45; g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x0 + cell * 0.42, y0 + cell * 0.68); g.lineTo(x0 + cell * 0.5, y0 + cell * 0.48);
          g.moveTo(x0 + cell * 0.5, y0 + cell * 0.58); g.lineTo(x0 + cell * 0.6, y0 + cell * 0.43);
          g.stroke(); g.globalAlpha = 1;
        }
      }
    }

    g.strokeStyle = tokens.rule; g.lineWidth = 1; g.globalAlpha = 0.65;
    for (let x = 0; x <= data.config.width; x++) {
      g.beginPath(); g.moveTo(left + x * cell, top); g.lineTo(left + x * cell, top + boardH); g.stroke();
    }
    for (let y = 0; y <= data.config.height; y++) {
      g.beginPath(); g.moveTo(left, top + y * cell); g.lineTo(left + boardW, top + y * cell); g.stroke();
    }
    g.globalAlpha = 1;

    function drawPath(points, color, dashed, lineWidth) {
      if (!points.length) return;
      g.strokeStyle = color; g.fillStyle = color; g.lineWidth = lineWidth;
      g.setLineDash(dashed ? [5, 5] : []);
      g.beginPath();
      points.forEach((point, i) => {
        const [px, py] = center(point[0], point[1]);
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      });
      g.stroke(); g.setLineDash([]);
      points.forEach((point) => {
        const [px, py] = center(point[0], point[1]);
        g.beginPath(); g.arc(px, py, dashed ? 2.2 : 3.1, 0, Math.PI * 2); g.fill();
      });
    }
    drawPath(expertPath, tokens.muted, true, 2);
    drawPath(path, tokens.accent, false, 3);

    const [gx, gy] = center(data.config.goal[0], data.config.goal[1]);
    g.strokeStyle = tokens.accent; g.fillStyle = tokens.bg; g.lineWidth = 2;
    g.beginPath(); g.arc(gx, gy, cell * 0.28, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = tokens.accent; g.font = `700 ${Math.max(10, cell * 0.34)}px ui-monospace, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('G', gx, gy + 1);

    const shownStep = Math.min(bikeStep, path.length - 1);
    const point = path[shownStep];
    const [bx, by] = center(point[0], point[1]);
    drawBicycle(g, point, bx, by, cell, tokens);
  }

  function weightExtent() {
    const all = [...data.config.trueWeights];
    data.checkpoints.forEach(checkpoint => all.push(...checkpoint.weights));
    return [Math.floor(Math.min(...all) - 1), Math.ceil(Math.max(...all) + 1)];
  }

  function drawWeights(checkpoint, tokens) {
    const { g, width, height } = canvasContext(weightCanvas);
    g.clearRect(0, 0, width, height);
    const labelW = 78, x0 = labelW, x1 = width - 14;
    const [lo, hi] = weightExtent();
    const sx = (value) => x0 + ((value - lo) / (hi - lo)) * (x1 - x0);
    const zero = sx(0), rowH = (height - 18) / data.config.featureNames.length;
    g.strokeStyle = tokens.rule; g.lineWidth = 1;
    g.beginPath(); g.moveTo(zero, 5); g.lineTo(zero, height - 8); g.stroke();
    g.font = '11px ui-monospace, monospace';
    checkpoint.weights.forEach((value, i) => {
      const y = 13 + (i + 0.5) * rowH;
      g.fillStyle = tokens.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(data.config.featureNames[i], labelW - 7, y);
      g.fillStyle = tokens.accent;
      g.fillRect(Math.min(zero, sx(value)), y - 7, Math.max(2, Math.abs(sx(value) - zero)), 14);
      g.fillStyle = tokens.fg; g.textAlign = value < 0 ? 'right' : 'left';
      g.fillText(value.toFixed(2), sx(value) + (value < 0 ? -4 : 4), y);
      if (state.reveal) {
        const tx = sx(data.config.trueWeights[i]);
        g.strokeStyle = tokens.fg; g.lineWidth = 2;
        g.beginPath(); g.moveTo(tx, y - 10); g.lineTo(tx, y + 10); g.stroke();
      }
    });
  }

  function drawCounts(checkpoint, tokens) {
    const { g, width, height } = canvasContext(countCanvas);
    g.clearRect(0, 0, width, height);
    const labelW = 78, x0 = labelW, x1 = width - 14;
    const maximum = Math.max(1, ...data.demonstrationFeatureMean, ...checkpoint.modelFeatureMean);
    const sx = (value) => x0 + (value / maximum) * (x1 - x0) * 0.72;
    const rowH = (height - 18) / data.config.featureNames.length;
    g.font = '11px ui-monospace, monospace'; g.textBaseline = 'middle';
    checkpoint.modelFeatureMean.forEach((model, i) => {
      const expert = data.demonstrationFeatureMean[i];
      const y = 13 + (i + 0.5) * rowH;
      g.fillStyle = tokens.muted; g.textAlign = 'right';
      g.fillText(data.config.featureNames[i], labelW - 7, y);
      g.fillStyle = tokens.muted; g.globalAlpha = 0.28;
      g.fillRect(x0, y - 9, Math.max(1, sx(expert) - x0), 7);
      g.globalAlpha = 1; g.fillStyle = tokens.accent;
      g.fillRect(x0, y + 2, Math.max(1, sx(model) - x0), 7);
      g.fillStyle = tokens.fg; g.textAlign = 'left';
      g.fillText(`${expert.toFixed(2)} / ${model.toFixed(2)}`, Math.max(x0 + 4, sx(Math.max(expert, model)) + 4), y);
    });
  }

  function render() {
    if (!data || !alive) return;
    const checkpoint = data.checkpoints[state.checkpoint];
    bikeStep = Math.min(bikeStep, checkpoint.bestPath.length - 1);
    const tokens = Theme.tokens();
    drawGrid(checkpoint.bestPath, data.sampleDemonstrations[sample], tokens);
    drawWeights(checkpoint, tokens);
    drawCounts(checkpoint, tokens);
    const final = state.checkpoint === data.checkpoints.length - 1;
    statusEl.textContent = `PyTorch step ${checkpoint.step}: water ${checkpoint.weights[0].toFixed(2)}, trees ${checkpoint.weights[1].toFixed(2)}, goal ${checkpoint.weights[2].toFixed(2)}, steering ${checkpoint.weights[3].toFixed(2)}${final ? ' · the learned bicycle route avoids both pond and trees.' : ''}`;
  }

  let controlApi = null;
  function stopTimers() {
    if (replayTimer) { clearInterval(replayTimer); replayTimer = null; }
    if (rideTimer) { clearInterval(rideTimer); rideTimer = null; }
  }
  function replay() {
    if (!data) return;
    stopTimers(); state.checkpoint = 0; bikeStep = 0; controlApi.refresh(); render();
    replayTimer = setInterval(() => {
      if (!alive || state.checkpoint >= data.checkpoints.length - 1) {
        clearInterval(replayTimer); replayTimer = null; return;
      }
      state.checkpoint += 1; bikeStep = 0; controlApi.refresh(); render();
    }, 90);
  }
  function ride() {
    if (!data) return;
    stopTimers(); bikeStep = 0; render();
    rideTimer = setInterval(() => {
      const path = data.checkpoints[state.checkpoint].bestPath;
      if (!alive || bikeStep >= path.length - 1) {
        clearInterval(rideTimer); rideTimer = null; return;
      }
      bikeStep += 1; render();
    }, 220);
  }
  function nextExpert() {
    if (!data) return;
    sample = (sample + 1) % data.sampleDemonstrations.length;
    render();
  }

  fetch(`/static/demos/irl-maxent.json?v=${document.documentElement.dataset.build || ''}`)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((json) => {
      if (!alive) return;
      data = json;
      state.checkpoint = data.checkpoints.length - 1;
      controlApi = Controls(el.querySelector('.irl-controls'), [
        { type: 'slider', key: 'checkpoint', label: 'training checkpoint', min: 0, max: data.checkpoints.length - 1, step: 1, dp: 0 },
        { type: 'toggle', key: 'reveal', label: 'reveal hidden reward' },
        { type: 'button', label: 'replay reward learning', onClick: replay },
        { type: 'button', label: 'ride learned route', onClick: ride },
        { type: 'button', label: 'another expert trip', onClick: nextExpert },
      ], state, (key) => { if (key === 'checkpoint') bikeStep = 0; render(); });
      render();
    })
    .catch((error) => {
      if (alive) statusEl.textContent = `could not load irl-maxent.json (${error.message}) — regenerate it with tools/irl-lab/maxent_irl.py.`;
    });

  const offTheme = Theme.onChange(render);
  const onResize = () => render();
  window.addEventListener('resize', onResize);
  return () => {
    alive = false; stopTimers(); offTheme();
    window.removeEventListener('resize', onResize);
  };
}

window.Demos.register('irl-maxent', mount);
