// linalg.js — small pure linear-algebra helpers (no browser APIs).
export function matVec(A, x) { return A.map(row => row.reduce((s,a,j)=>s+a*x[j],0)); }
export function matMat(A, B) {
  const n=A.length, m=B[0].length, k=B.length, C=Array.from({length:n},()=>Array(m).fill(0));
  for (let i=0;i<n;i++) for (let j=0;j<m;j++){ let s=0; for(let t=0;t<k;t++) s+=A[i][t]*B[t][j]; C[i][j]=s; }
  return C;
}
export function eye(n){ return Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0)); }
export function trace(A){ return A.reduce((s,r,i)=>s+r[i],0); }
export function addScaledEye(A, c){ return A.map((r,i)=>r.map((v,j)=> v + (i===j? c:0))); }

// Central-difference Jacobians. f: (x:number[], u:number[]) -> number[]
export function linearize(f, x0, u0, eps = 1e-5) {
  const n = x0.length, m = u0.length, f0len = f(x0, u0).length;
  const A = Array.from({length:f0len},()=>Array(n).fill(0));
  const B = Array.from({length:f0len},()=>Array(m).fill(0));
  for (let j=0;j<n;j++){
    const xp=[...x0], xm=[...x0]; xp[j]+=eps; xm[j]-=eps;
    const dp=f(xp,u0), dm=f(xm,u0);
    for (let i=0;i<f0len;i++) A[i][j]=(dp[i]-dm[i])/(2*eps);
  }
  for (let j=0;j<m;j++){
    const up=[...u0], um=[...u0]; up[j]+=eps; um[j]-=eps;
    const dp=f(x0,up), dm=f(x0,um);
    for (let i=0;i<f0len;i++) B[i][j]=(dp[i]-dm[i])/(2*eps);
  }
  return { A, B };
}

// Faddeev–LeVerrier: returns monic coeffs [1, c1, ..., cn] of det(lambda*I - A).
export function charpoly(A) {
  const n = A.length;
  let M = eye(n); const c = [1];
  for (let k=1;k<=n;k++){
    const AM = matMat(A, M);
    const ck = -trace(AM)/k;
    c.push(ck);
    M = addScaledEye(AM, ck);
  }
  return c;
}

// Durand–Kerner: complex roots of a0 x^n + ... + an. Returns [{re, im}].
export function polyroots(coeffs) {
  const a = coeffs.map(Number);
  const n = a.length - 1;
  if (n <= 0) return [];
  const norm = a.map(v => v / a[0]);
  const cx = (re,im)=>({re,im});
  const mul=(p,q)=>cx(p.re*q.re-p.im*q.im, p.re*q.im+p.im*q.re);
  const sub=(p,q)=>cx(p.re-q.re,p.im-q.im);
  const div=(p,q)=>{ const d=q.re*q.re+q.im*q.im; return cx((p.re*q.re+p.im*q.im)/d,(p.im*q.re-p.re*q.im)/d); };
  const evalp=(z)=>{ let r=cx(norm[0],0); for(let i=1;i<norm.length;i++) r=cx(mul(r,z).re+norm[i], mul(r,z).im); return r; };
  let roots = Array.from({length:n},(_,i)=> { const ang=(2*Math.PI*i)/n + 0.5; return cx(0.4*Math.cos(ang)+0.1, 0.9*Math.sin(ang)); });
  for (let iter=0; iter<200; iter++){
    let maxd=0;
    const next = roots.map((zi,i)=>{
      let denom=cx(1,0);
      for (let j=0;j<n;j++){ if(j!==i) denom=mul(denom, sub(zi, roots[j])); }
      const delta=div(evalp(zi), denom);
      maxd=Math.max(maxd, Math.hypot(delta.re,delta.im));
      return sub(zi, delta);
    });
    roots=next;
    if (maxd < 1e-12) break;
  }
  return roots;
}
