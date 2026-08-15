// export-dataset.mjs — generate the behavior-cloning datasets for training.
//
// Runs the SAME simulator the browser demo runs (static/demos/bc-car.js, seeded)
// so the exported frames are bit-identical to what a reader watches being
// collected on the page. Two variants:
//   clean : the expert drives perfectly            (seed 11, sigma 0.0)
//   dart  : execution noise widens the distribution (seed 12, sigma 0.7)
//
// Usage:  node tools/bc-lab/export-dataset.mjs
// Output: tools/bc-lab/out/{X-<variant>.bin (f32), y-<variant>.bin (f32), meta.json}
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeTrack, makeField, observe, expertSteer, stepCar, startState, CAR, OBS,
  rng, gauss, clamp,
} from '../../static/demos/bc-car.js';

const N_FRAMES = 2000;
const VARIANTS = { clean: { seed: 11, sigma: 0.0 }, dart: { seed: 12, sigma: 0.7 } };

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(outDir, { recursive: true });

const track = makeTrack();
const field = makeField(track);

for (const [name, v] of Object.entries(VARIANTS)) {
  const rand = rng(v.seed);
  let car = startState(track, 0);
  const X = new Float32Array(N_FRAMES * OBS.w * OBS.h);
  const y = new Float32Array(N_FRAMES);
  for (let i = 0; i < N_FRAMES; i++) {
    const u = expertSteer(car, track);                       // label: clean expert action
    X.set(observe(car, field, track.halfWidth), i * OBS.w * OBS.h);
    y[i] = u;
    const exec = v.sigma ? clamp(u + v.sigma * gauss(rand), -1, 1) : u;
    car = stepCar(car, exec);                                // noise perturbs execution only
  }
  writeFileSync(join(outDir, `X-${name}.bin`), Buffer.from(X.buffer));
  writeFileSync(join(outDir, `y-${name}.bin`), Buffer.from(y.buffer));
  console.log(`${name}: ${N_FRAMES} frames (seed ${v.seed}, sigma ${v.sigma})`);
}

writeFileSync(join(outDir, 'meta.json'), JSON.stringify({
  nFrames: N_FRAMES, obsW: OBS.w, obsH: OBS.h, variants: VARIANTS,
  note: 'X: float32 [n, h, w] row-major; y: float32 [n]; produced by static/demos/bc-car.js',
}, null, 2));
console.log('wrote', outDir);
