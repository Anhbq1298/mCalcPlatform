// Headed studs to EN 1992-4:2018 §7.2 (cast-in headed fasteners). Units: N, mm, MPa.
// Edge distances are measured from the plate centre to each free edge (null = no edge).

const SIDES = ['left', 'right', 'bottom', 'top'];
export const shankArea = d => Math.PI * d * d / 4;
export const headArea = (d, dh) => Math.PI / 4 * (dh * dh - d * d); // Eq. 7.12

// Edge distance from a point to each free edge.
export function edgeDistances(point, edges) {
  return {
    left: edges.left === null ? Infinity : edges.left + point.x,
    right: edges.right === null ? Infinity : edges.right - point.x,
    bottom: edges.bottom === null ? Infinity : edges.bottom + point.y,
    top: edges.top === null ? Infinity : edges.top - point.y,
  };
}

// Length of the union of intervals [v − r, v + r], clipped at [lo, hi].
function unionLength(values, r, lo, hi) {
  const spans = [...new Set(values)].sort((a, b) => a - b).map(v => [Math.max(v - r, lo), Math.min(v + r, hi)]);
  let total = 0;
  let end = -Infinity;
  for (const [a, b] of spans) {
    if (b <= end) continue;
    total += b - Math.max(a, end);
    end = b;
  }
  return total;
}

const groupEdges = (points, edges) => {
  const out = { left: Infinity, right: Infinity, bottom: Infinity, top: Infinity };
  for (const point of points) {
    const c = edgeDistances(point, edges);
    for (const side of SIDES) out[side] = Math.min(out[side], c[side]);
  }
  return out;
};

const maxSpacing = values => {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  return sorted.length < 2 ? 0 : sorted.at(-1) - sorted[0];
};

// §7.2.1.4 concrete cone failure of the studs in `points` (each with tension F ≥ 0).
export function coneResistance(points, { hef, fck, cracked, dense, edges }) {
  const k1 = cracked ? 8.9 : 12.7; // indicative values for headed fasteners
  const c = groupEdges(points, edges);
  let h = hef;
  const close = SIDES.filter(side => c[side] < 1.5 * hef);
  let narrow = null;
  if (close.length >= 3) { // §7.2.1.4(8), Eq. 7.9
    const cMax = Math.max(...close.map(side => c[side]));
    const sMax = Math.min(Math.max(maxSpacing(points.map(p => p.x)), maxSpacing(points.map(p => p.y))), 3 * hef);
    h = Math.max(cMax / (1.5 * hef), sMax / (3 * hef)) * hef;
    narrow = { cMax, sMax, hefPrime: h };
  }
  const ccr = 1.5 * h;
  const scr = 3 * h;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const lx = unionLength(xs, ccr, edges.left === null ? -Infinity : -edges.left, edges.right === null ? Infinity : edges.right);
  const ly = unionLength(ys, ccr, edges.bottom === null ? -Infinity : -edges.bottom, edges.top === null ? Infinity : edges.top);
  const Ac = lx * ly;
  const A0 = scr * scr; // Eq. 7.3
  const cMin = Math.min(...SIDES.map(side => c[side]));
  const psiS = Math.min(1, 0.7 + 0.3 * cMin / ccr); // Eq. 7.4
  const psiRe = hef < 100 && !dense ? Math.min(1, 0.5 + hef / 200) : 1; // Eq. 7.5
  const total = points.reduce((s, p) => s + (p.F ?? 1), 0);
  const centre = { x: xs.reduce((a, b) => a + b, 0) / xs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length };
  const load = { x: points.reduce((s, p) => s + (p.F ?? 1) * p.x, 0) / total, y: points.reduce((s, p) => s + (p.F ?? 1) * p.y, 0) / total };
  const eN = { x: Math.abs(load.x - centre.x), y: Math.abs(load.y - centre.y) };
  const psiEc = 1 / (1 + 2 * eN.x / scr) / (1 + 2 * eN.y / scr); // Eq. 7.6, both directions
  const psiM = 1; // Eq. 7.7 taken as 1.0 (conservative)
  const N0 = k1 * Math.sqrt(fck) * h ** 1.5; // Eq. 7.2
  const NRk = N0 * Ac / A0 * psiS * psiRe * psiEc * psiM; // Eq. 7.1
  return { k1, hef: h, narrow, ccr, scr, Ac, A0, cMin, psiS, psiRe, psiEc, psiM, eN, N0, NRk };
}

// §7.2.1.5 pull-out, Eq. 7.11.
export function pulloutResistance({ d, dh, fck, cracked }) {
  const k2 = cracked ? 7.5 : 10.5;
  const Ah = headArea(d, dh);
  return { k2, Ah, NRk: k2 * Ah * fck };
}

// §7.2.2.3 steel failure without lever arm, Eq. 7.34–7.35.
export function steelShear({ d, fuk, ductile }) {
  const k6 = fuk <= 500 ? 0.6 : 0.5;
  const k7 = ductile ? 1.0 : 0.8;
  return { k6, k7, As: shankArea(d), VRk: k7 * k6 * shankArea(d) * fuk };
}

// §7.2.2.5 concrete edge failure toward the bottom edge for one row of studs (all at the same y).
export function edgeResistance(row, { d, hef, fck, cracked, thickness, edges, edgeReinforcement }) {
  const y = row[0].y;
  let c1 = edges.bottom + y;
  const sides = groupEdges(row, edges);
  const c2 = Math.min(sides.left, sides.right);
  const sMax = maxSpacing(row.map(p => p.x));
  let narrow = null;
  const c2Max = Math.max(sides.left, sides.right);
  if (c2Max < 1.5 * c1 && thickness < 1.5 * c1) { // narrow thin member: reduced c1'
    const c1Prime = Math.max(c2Max / 1.5, thickness / 1.5, sMax / 3);
    narrow = { c1: c1, c1Prime };
    c1 = c1Prime;
  }
  const k9 = cracked ? 1.7 : 2.4;
  const lf = Math.min(hef, d <= 24 ? 12 * d : Math.max(8 * d, 300));
  const alpha = 0.1 * Math.sqrt(lf / c1); // Eq. 7.42
  const beta = 0.1 * (d / c1) ** 0.2; // Eq. 7.43
  const V0 = k9 * d ** alpha * lf ** beta * Math.sqrt(fck) * c1 ** 1.5; // Eq. 7.41
  const width = unionLength(row.map(p => p.x), 1.5 * c1, edges.left === null ? -Infinity : -edges.left, edges.right === null ? Infinity : edges.right);
  const depth = Math.min(1.5 * c1, thickness);
  const Ac = width * depth;
  const A0 = 4.5 * c1 * c1; // Eq. 7.44
  const psiS = Math.min(1, 0.7 + 0.3 * c2 / (1.5 * c1)); // Eq. 7.45
  const psiH = Math.max(1, Math.sqrt(1.5 * c1 / thickness)); // Eq. 7.46
  const psiEc = 1; // symmetric row, equal shares
  const psiAlpha = 1; // shear perpendicular to the edge
  const psiRe = edgeReinforcement && cracked ? 1.4 : 1.0;
  const VRk = V0 * Ac / A0 * psiS * psiH * psiEc * psiAlpha * psiRe; // Eq. 7.40
  return { y, c1, c2, narrow, k9, lf, alpha, beta, V0, width, depth, Ac, A0, psiS, psiH, psiEc, psiAlpha, psiRe, VRk, n: row.length };
}

// Rows of studs sorted from the bottom (front, nearest the loaded edge) to the top (rear).
export function studRows(points) {
  const rows = new Map();
  for (const point of points) rows.set(point.y, [...(rows.get(point.y) ?? []), point]);
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}

// Table 7.3 concrete interaction: Eq. 7.55 with each ratio capped at 1.
export const concreteInteraction = (betaN, betaV) => Math.min(betaN, 1) ** 1.5 + Math.min(betaV, 1) ** 1.5;
export const steelInteraction = (betaN, betaV) => betaN ** 2 + betaV ** 2; // Eq. 7.54
