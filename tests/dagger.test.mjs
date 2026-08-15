// Regression tests for the shipped DAgger run (chapter 5): JS==torch parity
// per round, exact replayability of the recorded rollouts (what the demo shows
// IS the run that made the data), and the closed-loop story.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  makeTrack, makeField, observe, expertSteer, stepCar, startState, CAR, OBS, rng, gauss, clamp,
} from '../static/demos/bc-car.js';
import { buildNet, forward, predict, paramCount } from '../static/demos/bc-net.js';

const R = JSON.parse(readFileSync(new URL('../static/demos/dagger-run.json', import.meta.url), 'utf8'));
const track = makeTrack();
const field = makeField(track);
const G = R.gauntlet;
const D = OBS.w * OBS.h;

function makeGauntlet(seed) {
  const r = rng(seed);
  let car = startState(track, G.offset), sign = 1, t = 0;
  const per = Math.round(G.bumpEvery / CAR.dt);
  return {
    preKick() {
      const stepIdx = Math.round(t / CAR.dt);
      if (stepIdx > 0 && stepIdx % per === 0) { car.psi += G.bump * sign; sign = -sign; }
    },
    act(u) {
      car = stepCar(car, clamp(u + G.noise * gauss(r), -1, 1));
      t += CAR.dt;
      if (Math.abs(track.nearest(car.x, car.y).e) > track.halfWidth) {
        car = startState(track, G.offset);
        return 'crash';
      }
      return null;
    },
    get car() { return car; },
    get t() { return t; },
  };
}

test('every round ships full weights; JS forward matches the PyTorch fit', () => {
  for (const rd of R.rounds) {
    const net = buildNet(R.arch, rd.weights);
    assert.equal(paramCount(net), 5473);
    for (const v of rd.vectors ?? []) {
      const y = forward(net, Float32Array.from(v.obs));
      assert.ok(Math.abs(y - v.y) < 1e-4, `round ${rd.round}: js=${y} torch=${v.y}`);
    }
  }
});

test('round-1 rollout replays exactly: same crash count as the recorded run', () => {
  const net = buildNet(R.arch, R.rounds[0].weights);
  const g = makeGauntlet(R.rounds[1].rolloutSeed);
  const buf = new Float32Array(D);
  let crashes = 0;
  for (let f = 0; f < R.config.framesPerRound; f++) {
    g.preKick();
    const u = predict(net, observe(g.car, field, track.halfWidth, OBS, buf));
    if (g.act(u) === 'crash') crashes++;
  }
  assert.equal(crashes, R.rounds[1].crashes);
});

test('closed loop: round 0 crashes mid-gauntlet, the final round survives it all', () => {
  const survival = (weights, seed) => {
    const net = buildNet(R.arch, weights);
    const g = makeGauntlet(seed);
    const buf = new Float32Array(D);
    while (g.t < G.cap) {
      g.preKick();
      if (g.act(predict(net, observe(g.car, field, track.halfWidth, OBS, buf))) === 'crash') return g.t;
    }
    return G.cap;
  };
  const first = survival(R.rounds[0].weights, G.evalSeed);
  assert.ok(first > 10 && first < 90, `round 0 should crash mid-drive, got ${first}`);
  assert.ok(Math.abs(first - R.rounds[0].evalSurvival) < 0.11, 'recorded eval must match replay');
  const last = R.rounds[R.rounds.length - 1];
  assert.equal(survival(last.weights, G.evalSeed), G.cap);
  assert.equal(survival(last.weights, 4242), G.cap, 'final policy should survive a fresh gauntlet too');
});
