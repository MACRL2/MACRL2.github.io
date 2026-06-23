import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linearize, charpoly, polyroots, matVec } from '../static/demo-kit/linalg.js';

test('linearize recovers A from a linear system', () => {
  const A = [[0,1,0,0],[ -2,-3,0,0],[0,0,0,1],[0,0,-5,-1]];
  const f = (x, u) => matVec(A, x).map((v,i)=> v + (i===1? u[0]:0));
  const { A: Ahat } = linearize(f, [0,0,0,0], [0]);
  for (let i=0;i<4;i++) for (let j=0;j<4;j++)
    assert.ok(Math.abs(Ahat[i][j]-A[i][j]) < 1e-4, `A[${i}][${j}]`);
});

test('charpoly of diag(1,2,3)', () => {
  const c = charpoly([[1,0,0],[0,2,0],[0,0,3]]);
  assert.deepEqual(c.map((v)=>Math.round(v)), [1,-6,11,-6]);
});

test('polyroots finds {1,2,3}', () => {
  const roots = polyroots([1,-6,11,-6]).map(r=>r.re).sort((a,b)=>a-b);
  [1,2,3].forEach((v,i)=> assert.ok(Math.abs(roots[i]-v) < 1e-4, `root ${i}=${roots[i]}`));
});
