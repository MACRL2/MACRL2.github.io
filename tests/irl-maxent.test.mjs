import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const run = JSON.parse(await readFile(
  new URL('../static/demos/irl-maxent.json', import.meta.url), 'utf8'
));

test('MaxEnt IRL artifact records a complete PyTorch fit', () => {
  assert.equal(run.source, 'tools/irl-lab/maxent_irl.py · PyTorch');
  assert.equal(run.checkpoints[0].step, 0);
  assert.equal(run.checkpoints.at(-1).step, 1200);
  assert.deepEqual(run.checkpoints[0].weights, [0, 0, 0, 0]);
  assert.equal(run.sampleDemonstrations.length, 16);
  assert.equal(run.config.width, 13);
  assert.equal(run.config.height, 11);
  assert.equal(run.config.directions.length, 8);
  assert.ok(run.config.water.length > 0);
  assert.ok(run.config.trees.length > 0);
});

test('learned reward matches expert feature counts and best route', () => {
  const final = run.checkpoints.at(-1);
  for (let i = 0; i < run.demonstrationFeatureMean.length; i++) {
    assert.ok(
      Math.abs(final.modelFeatureMean[i] - run.demonstrationFeatureMean[i]) < 0.01,
      `${run.config.featureNames[i]} feature expectation did not match`
    );
  }
  assert.deepEqual(final.bestPath, run.expertBestPath);
  assert.ok(final.weights[0] < -10, 'water should acquire a large negative weight');
  assert.ok(final.weights[1] < -5, 'trees should acquire a large negative weight');
  assert.ok(final.weights[2] > 2, 'reaching the goal should acquire a positive weight');
});
