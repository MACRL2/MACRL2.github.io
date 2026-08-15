// run_dagger.mjs — the DAgger loop for chapter 5, orchestrated honestly:
// rollouts run in the SAME JavaScript simulator the page runs (bc-car.js,
// seeded, so the browser can replay them exactly), and each round's fit is
// PyTorch (train_round.py) on the aggregated dataset — Follow-The-Leader on
// the sequence of rollout losses.
//
//   round 0: the chapter-4 clean BC clone and its 2,000-frame dataset
//   round i: roll out pi_{i-1} under the deployment gauntlet, the expert
//            labels every visited state (it never drives), aggregate, refit
//
// Usage:  node tools/bc-lab/run_dagger.mjs     (after export-dataset + train_bc)
// Output: static/demos/dagger-run.json (weights, curves, metrics per round)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeTrack, makeField, observe, expertSteer, stepCar, startState, CAR, OBS,
  rng, gauss, clamp,
} from '../../static/demos/bc-car.js';
import { buildNet, forward, predict } from '../../static/demos/bc-net.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT = join(HERE, 'out', 'dagger');
const PY = join(REPO, '.venv', 'bin', 'python');

const ROUNDS = 3, FRAMES = 1500;                       // per-round labeling budget
const GAUNTLET = { offset: 0.15, noise: 0.02, bump: 0.2, bumpEvery: 10, evalSeed: 999, cap: 180 };
const HIST_BINS = 49, HIST_RANGE = 1.225;
const D = OBS.w * OBS.h;

const track = makeTrack();
const field = makeField(track);
mkdirSync(OUT, { recursive: true });

// --- the gauntlet (identical to the chapter-4/5 demos) -------------------------
function* gauntletSteps(seed) {
  const r = rng(seed);
  let car = startState(track, GAUNTLET.offset), sign = 1, t = 0;
  const per = Math.round(GAUNTLET.bumpEvery / CAR.dt);
  while (true) {
    const stepIdx = Math.round(t / CAR.dt);
    if (stepIdx > 0 && stepIdx % per === 0) { car.psi += GAUNTLET.bump * sign; sign = -sign; }
    const act = yield car;                              // caller supplies the action
    car = stepCar(car, clamp(act + GAUNTLET.noise * gauss(r), -1, 1));
    t += CAR.dt;
    if (Math.abs(track.nearest(car.x, car.y).e) > track.halfWidth) {
      car = startState(track, GAUNTLET.offset);        // crash -> reset, clock keeps ticking
      yield 'crash';
    }
  }
}

// Roll out a policy for `frames` steps; the expert labels every visited state.
function rollout(net, seed, frames) {
  const gen = gauntletSteps(seed);
  let cur = gen.next().value;
  const X = [], y = [], es = [];
  let crashes = 0;
  const buf = new Float32Array(D);
  while (X.length < frames) {
    if (cur === 'crash') { crashes++; cur = gen.next().value; continue; }
    const obs = observe(cur, field, track.halfWidth, OBS, buf).slice();
    X.push(obs);
    y.push(expertSteer(cur, track));                    // the label: what would you have done?
    es.push(track.nearest(cur.x, cur.y).e);
    cur = gen.next(predict(net, obs)).value;            // ...but the LEARNER drives
  }
  return { X, y, es, crashes };
}

function evalSurvival(net, seed = GAUNTLET.evalSeed) {
  const gen = gauntletSteps(seed);
  let cur = gen.next().value, t = 0;
  const buf = new Float32Array(D);
  while (t < GAUNTLET.cap) {
    if (cur === 'crash') return t;
    cur = gen.next(predict(net, observe(cur, field, track.halfWidth, OBS, buf))).value;
    t += CAR.dt;
  }
  return GAUNTLET.cap;
}

const histOf = (es) => {
  const bins = new Array(HIST_BINS).fill(0);
  for (const e of es) {
    const i = Math.round(((e + HIST_RANGE) / (2 * HIST_RANGE)) * (HIST_BINS - 1));
    if (i >= 0 && i < HIST_BINS) bins[i]++;
  }
  return bins;
};

// --- round 0: the chapter-4 clone and its dataset ------------------------------
const bc = JSON.parse(readFileSync(join(REPO, 'static', 'demos', 'bc-weights.json'), 'utf8'));
const WKEYS = ['W1', 'b1', 'W2', 'b2', 'W3', 'b3', 'W4', 'b4'];
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

const aggX = [], aggY = [], aggE = [];
{
  let car = startState(track, 0);                       // clean demonstrations, seed 11 recipe
  for (let i = 0; i < 2000; i++) {
    const u = expertSteer(car, track);
    aggX.push(observe(car, field, track.halfWidth, OBS, new Float32Array(D)));
    aggY.push(u);
    aggE.push(track.nearest(car.x, car.y).e);
    car = stepCar(car, u);
  }
}
let net = buildNet(bc.arch, bc.variants.clean);
const rounds = [{
  round: 0, aggregateSize: aggX.length, rolloutSeed: null, crashes: null,
  trainMSE: bc.variants.clean.trainMSE, valMSE: bc.variants.clean.valMSE,
  lossCurve: bc.variants.clean.lossCurve, valCurve: bc.variants.clean.valCurve,
  evalSurvival: evalSurvival(net), histBins: histOf(aggE),
  weights: pick(bc.variants.clean, WKEYS), vectors: null,
}];
console.log(`round 0 (BC clone): eval survival ${rounds[0].evalSurvival.toFixed(1)}s on ${GAUNTLET.cap}s gauntlet`);

// --- DAgger rounds --------------------------------------------------------------
for (let i = 1; i <= ROUNDS; i++) {
  const seed = 1000 + i;
  const roll = rollout(net, seed, FRAMES);
  aggX.push(...roll.X); aggY.push(...roll.y); aggE.push(...roll.es);

  const Xbin = new Float32Array(aggX.length * D);
  aggX.forEach((o, k) => Xbin.set(o, k * D));
  writeFileSync(join(OUT, 'X.bin'), Buffer.from(Xbin.buffer));
  writeFileSync(join(OUT, 'y.bin'), Buffer.from(Float32Array.from(aggY).buffer));
  const roundPath = join(OUT, `round_${i}.json`);
  execSync(`${PY} ${join(HERE, 'train_round.py')} --x ${join(OUT, 'X.bin')} --y ${join(OUT, 'y.bin')} --n ${aggY.length} --out ${roundPath}`,
    { stdio: 'inherit' });
  const fit = JSON.parse(readFileSync(roundPath, 'utf8'));

  net = buildNet(bc.arch, fit);
  for (const v of fit.vectors) {                        // parity: JS forward == torch, right now
    const err = Math.abs(forward(net, Float32Array.from(v.obs)) - v.y);
    if (err > 1e-4) throw new Error(`parity drift round ${i}: ${err}`);
  }
  const surv = evalSurvival(net);
  rounds.push({
    round: i, aggregateSize: aggY.length, rolloutSeed: seed, crashes: roll.crashes,
    trainMSE: fit.trainMSE, valMSE: fit.valMSE, lossCurve: fit.lossCurve, valCurve: fit.valCurve,
    evalSurvival: surv, histBins: histOf(aggE), weights: pick(fit, WKEYS), vectors: fit.vectors,
  });
  console.log(`round ${i}: rollout crashes ${roll.crashes} · aggregate ${aggY.length} · eval survival ${surv.toFixed(1)}s`);
}

const outJson = {
  arch: bc.arch,
  source: `tools/bc-lab/run_dagger.mjs (rollouts: static/demos/bc-car.js) + train_round.py`,
  gauntlet: GAUNTLET,
  config: { rounds: ROUNDS, framesPerRound: FRAMES, round0: 'chapter-4 clean BC clone + its 2,000-frame dataset' },
  rounds,
};
const dest = join(REPO, 'static', 'demos', 'dagger-run.json');
writeFileSync(dest, JSON.stringify(outJson));
console.log(`wrote ${dest} (${Math.round(JSON.stringify(outJson).length / 1024)} KB)`);
