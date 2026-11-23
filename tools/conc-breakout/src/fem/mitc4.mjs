// MITC4 Reissner–Mindlin plate element for axis-aligned rectangles (Bathe & Dvorkin 1985).
// Node order (ξ, η): 1 (−1,−1), 2 (1,−1), 3 (1,1), 4 (−1,1). Half sizes a (x), b (y).
// DOFs per node: [w, βx, βy] with γxz = ∂w/∂x + βx and γyz = ∂w/∂y + βy.
// Bending: κ = [∂βx/∂x, ∂βy/∂y, ∂βx/∂y + ∂βy/∂x], M = D_b κ. Transverse shear is
// interpolated from the edge-midpoint tying points to avoid shear locking. Units: N, mm.

const XI = [-1, 1, 1, -1];
const ETA = [-1, -1, 1, 1];
const G = 1 / Math.sqrt(3);
const GAUSS = [[-G, -G], [G, -G], [G, G], [-G, G]];

const shape = (xi, eta) => XI.map((x, i) => 0.25 * (1 + xi * x) * (1 + eta * ETA[i]));
const dXi = (xi, eta) => XI.map((x, i) => 0.25 * x * (1 + eta * ETA[i]));
const dEta = (xi, eta) => ETA.map((e, i) => 0.25 * e * (1 + xi * XI[i]));

export function plateRigidities(E, nu, t) {
  const D = E * t ** 3 / (12 * (1 - nu * nu));
  return { D, shear: 5 / 6 * E / (2 * (1 + nu)) * t, nu };
}

function bendingB(xi, eta, a, b) {
  const dx = dXi(xi, eta).map(v => v / a);
  const dy = dEta(xi, eta).map(v => v / b);
  const B = [new Float64Array(12), new Float64Array(12), new Float64Array(12)];
  for (let i = 0; i < 4; i++) {
    B[0][3 * i + 1] = dx[i];
    B[1][3 * i + 2] = dy[i];
    B[2][3 * i + 1] = dy[i];
    B[2][3 * i + 2] = dx[i];
  }
  return B;
}

// Covariant shear strain row at a point: γxz (dir 'x') or γyz (dir 'y').
function shearRow(xi, eta, a, b, dir) {
  const N = shape(xi, eta);
  const d = dir === 'x' ? dXi(xi, eta).map(v => v / a) : dEta(xi, eta).map(v => v / b);
  const row = new Float64Array(12);
  for (let i = 0; i < 4; i++) {
    row[3 * i] = d[i];
    row[3 * i + (dir === 'x' ? 1 : 2)] = N[i];
  }
  return row;
}

function shearB(xi, eta, a, b) {
  const A = shearRow(0, -1, a, b, 'x');
  const C = shearRow(0, 1, a, b, 'x');
  const Dp = shearRow(-1, 0, a, b, 'y');
  const Bp = shearRow(1, 0, a, b, 'y');
  const gx = new Float64Array(12);
  const gy = new Float64Array(12);
  for (let k = 0; k < 12; k++) {
    gx[k] = 0.5 * (1 - eta) * A[k] + 0.5 * (1 + eta) * C[k];
    gy[k] = 0.5 * (1 - xi) * Dp[k] + 0.5 * (1 + xi) * Bp[k];
  }
  return [gx, gy];
}

// 12 × 12 element stiffness (row-major Float64Array).
export function elementStiffness(a, b, { D, shear, nu }) {
  const K = new Float64Array(144);
  const Db = [[D, nu * D, 0], [nu * D, D, 0], [0, 0, D * (1 - nu) / 2]];
  const jac = a * b;
  for (const [xi, eta] of GAUSS) {
    const Bb = bendingB(xi, eta, a, b);
    const DB = [0, 1, 2].map(r => {
      const row = new Float64Array(12);
      for (let c = 0; c < 3; c++) if (Db[r][c]) for (let k = 0; k < 12; k++) row[k] += Db[r][c] * Bb[c][k];
      return row;
    });
    const Bs = shearB(xi, eta, a, b);
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
      let sum = 0;
      for (let r = 0; r < 3; r++) sum += Bb[r][i] * DB[r][j];
      sum += shear * (Bs[0][i] * Bs[0][j] + Bs[1][i] * Bs[1][j]);
      K[12 * i + j] += sum * jac;
    }
  }
  return K;
}

// Moments per unit width at the element centre from the element DOF vector u (length 12).
export function centreMoments(u, a, b, { D, nu }) {
  const B = bendingB(0, 0, a, b);
  const k = B.map(row => row.reduce((s, v, i) => s + v * u[i], 0));
  return { Mx: D * (k[0] + nu * k[1]), My: D * (nu * k[0] + k[1]), Mxy: D * (1 - nu) / 2 * k[2] };
}

// Surface von Mises stress from plate moments: σ = 6M/t².
export function surfaceVonMises({ Mx, My, Mxy }, t) {
  const f = 6 / (t * t);
  const sx = f * Mx;
  const sy = f * My;
  const txy = f * Mxy;
  return Math.sqrt(sx * sx - sx * sy + sy * sy + 3 * txy * txy);
}
