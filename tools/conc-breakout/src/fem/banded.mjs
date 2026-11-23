// Symmetric positive-definite banded matrix: storage of the lower band, row-major,
// entry (i, j) with i − bw ≤ j ≤ i stored at i·(bw + 1) + (j − i + bw).

export function bandMatrix(n, bw) {
  const data = new Float64Array(n * (bw + 1));
  const at = (i, j) => (i >= j ? i * (bw + 1) + (j - i + bw) : j * (bw + 1) + (i - j + bw));
  return {
    n, bw, data,
    add(i, j, value) {
      if (Math.abs(i - j) > bw) throw new Error('Band overflow');
      data[at(i, j)] += value;
    },
    get: (i, j) => (Math.abs(i - j) > bw ? 0 : data[at(i, j)]),
    clone() {
      const copy = bandMatrix(n, bw);
      copy.data.set(data);
      return copy;
    },
  };
}

// In-place Cholesky L·Lᵀ. Throws when the matrix is not positive definite.
export function choleskyBand(m) {
  const { n, bw, data } = m;
  const w = bw + 1;
  for (let i = 0; i < n; i++) {
    const j0 = Math.max(0, i - bw);
    for (let j = j0; j <= i; j++) {
      let sum = data[i * w + (j - i + bw)];
      const k0 = Math.max(j0, j - bw);
      for (let k = k0; k < j; k++) sum -= data[i * w + (k - i + bw)] * data[j * w + (k - j + bw)];
      if (j === i) {
        if (!(sum > 0)) throw new Error('Plate model is unstable (stiffness matrix not positive definite).');
        data[i * w + bw] = Math.sqrt(sum);
      } else {
        data[i * w + (j - i + bw)] = sum / data[j * w + bw];
      }
    }
  }
  return m;
}

export function solveBand(L, rhs) {
  const { n, bw, data } = L;
  const w = bw + 1;
  const x = Float64Array.from(rhs);
  for (let i = 0; i < n; i++) {
    let sum = x[i];
    for (let k = Math.max(0, i - bw); k < i; k++) sum -= data[i * w + (k - i + bw)] * x[k];
    x[i] = sum / data[i * w + bw];
  }
  for (let i = n - 1; i >= 0; i--) {
    let sum = x[i];
    for (let k = i + 1; k <= Math.min(n - 1, i + bw); k++) sum -= data[k * w + (i - k + bw)] * x[k];
    x[i] = sum / data[i * w + bw];
  }
  return x;
}

// Solve [A B; Bᵀ C] [x; m] = [f; g] where A is banded (n), B is n × p dense columns, C is p × p.
export function solveBordered(A, B, C, f, g) {
  const L = choleskyBand(A.clone());
  const p = C.length;
  const Y = B.map(column => solveBand(L, column)); // A⁻¹B, one column per master DOF
  const y0 = solveBand(L, f);
  const S = C.map((row, i) => row.map((value, j) => value - dot(B[i], Y[j])));
  const r = g.map((value, i) => value - dot(B[i], y0));
  const m = solveDense(S, r);
  const x = Float64Array.from(y0);
  for (let j = 0; j < p; j++) for (let i = 0; i < x.length; i++) x[i] -= Y[j][i] * m[j];
  return { x, m };
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Gaussian elimination with partial pivoting for the small Schur system.
export function solveDense(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) throw new Error('Singular master system.');
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}
