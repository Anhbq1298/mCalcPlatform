// Input model, defaults, restore and validation. Units: mm, kN, kN·m, MPa.
// Coordinates: plate face in the x–y plane, origin at the plate centre, +y up, z into the concrete.
// M_Ed rotates the top of the plate away from the concrete (tension at +y). V_Ed acts down (−y).
// Unknown fields are preserved on restore.

import { legacyLoading, transformLoads } from './loads.mjs';

export const SCHEMA = 4;

export const PLATE_GRADES = {
  // EN 1993-1-1 Table 3.1, t ≤ 40 mm; β_w from EN 1993-1-8 Table 4.1.
  S235: { fy: 235, fu: 360, betaW: 0.8 },
  S275: { fy: 275, fu: 430, betaW: 0.85 },
  S355: { fy: 355, fu: 510, betaW: 0.9 },
};

export const newDefaults = () => ({
  concrete: {
    fck: 30, cracked: true, alphaCc: 0.85, thickness: 300,
    // Distance from the plate centre to each free edge of the receiving member; null = no edge nearby.
    edges: { top: null, bottom: null, left: null, right: null },
    denseReinforcement: false, edgeReinforcement: false, splittingReinforcement: false,
  },
  plate: { grade: 'S355', B: 300, H: 400, t: 25 },
  member: { b: 150, h: 200, tf: 12, weld: 6 },
  actions: { N: 0, V: 136.17, e: 300, M: 0 },
  rebars: {
    fyk: 500, k: 1.08, shape: 'bent', length: 650, mandrel: 64, cd: 50, goodBond: true, throat: 8,
    rows: [{ y: 160, n: 2, d: 16, s: 200 }],
  },
  studs: {
    d: 22, dh: 35, hef: 165, fuk: 450, fyk: 350, ductile: true, k8: 2.0,
    nx: 2, ny: 2, sx: 200, sy: 200, tension: 'excluded',
  },
  layout: { mode: 'grid', points: [] },
  options: { analysis: 'fem', method: 'component', betaJ: 2 / 3, alpha: 1.0, friction: false, loadPathConfirmed: false },
});

export const newConnectionDefaults = () => {
  const input = newDefaults();
  return {
    ...input,
    loading: { model: 'spatial', ...legacyLoading(input.actions) },
    studs: { ...input.studs, tension: 'shared', shearStiffness: null, productReference: '' },
  };
};

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
function merge(base, saved) {
  if (!isObject(saved)) return base;
  const out = { ...saved };
  for (const [key, value] of Object.entries(base)) {
    out[key] = isObject(value) && isObject(saved[key]) ? merge(value, saved[key])
      : saved[key] === undefined ? value : saved[key];
  }
  return out;
}

export function migrateInputs(inputs, from = SCHEMA) {
  if (from > SCHEMA) throw new Error('This design was saved by a newer mConcBreakout schema.');
  // Schema 3 adds the custom fastener layout; older designs keep the grid layout (default).
  if (from < 2 && inputs && typeof inputs === 'object') {
    // Schema 1 designs were checked with the rigid-plate model; keep their results unchanged.
    inputs.options = { ...(inputs.options ?? {}), analysis: inputs.options?.analysis ?? 'rigid' };
  }
  if (from < 4 && isObject(inputs)) {
    inputs.loading = { ...legacyLoading(merge(newDefaults().actions, inputs.actions)), model: 'legacy' };
  }
  return inputs;
}

export const restoreInputs = saved => merge(newDefaults(), migrateInputs(structuredClone(saved ?? {})));

const finite = value => typeof value === 'number' && Number.isFinite(value);
function need(condition, message) {
  if (!condition) throw new Error(message);
}

// Stud positions: symmetric nx × ny grid about the plate centre.
export function studPositions({ nx, ny, sx, sy }) {
  const points = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    points.push({ id: 'S' + (points.length + 1), x: (i - (nx - 1) / 2) * sx, y: (j - (ny - 1) / 2) * sy });
  }
  return points;
}

export function rebarPositions(rows) {
  const bars = [];
  rows.forEach((row, r) => {
    for (let i = 0; i < row.n; i++) {
      bars.push({ id: 'R' + (r + 1) + '.' + (i + 1), row: r, x: (i - (row.n - 1) / 2) * row.s, y: row.y, d: row.d });
    }
  });
  return bars;
}

export function validateInputs(input) {
  const { concrete: c, plate: p, member: m, actions: a, rebars: r, studs: s, options: o } = input;
  for (const [label, value] of [['f_ck', c.fck], ['member thickness', c.thickness], ['plate width', p.B],
    ['plate height', p.H], ['plate thickness', p.t], ['member width', m.b], ['member depth', m.h],
    ['flange thickness', m.tf], ['stud diameter', s.d], ['head diameter', s.dh], ['h_ef', s.hef],
    ['stud f_uk', s.fuk], ['stud f_yk', s.fyk], ['rebar f_yk', r.fyk], ['bar length', r.length]]) {
    need(finite(value) && value > 0, `Enter a positive ${label}.`);
  }
  need(c.fck >= 12 && c.fck <= 90, 'f_ck must lie between 12 and 90 MPa.');
  need(PLATE_GRADES[p.grade], 'Select a plate grade.');
  need(p.t <= 40, 'Plate grades use EN 1993-1-1 Table 3.1 values for t ≤ 40 mm.');
  need(m.b <= p.B && m.h <= p.H, 'The steel member must fit within the plate.');
  need(2 * m.tf < m.h, 'Flange thickness must be less than half the member depth.');
  if (input.loading?.model === 'spatial') {
    transformLoads(input.loading.point ?? {}, input.loading.applied ?? {});
  } else {
    need(!input.loading || input.loading.model === 'legacy', 'Select a supported loading model.');
    need([a.N, a.V, a.e, a.M].every(finite), 'Enter all design actions.');
    need(a.V >= 0, 'Enter V_Ed as a downward magnitude (≥ 0).');
    need(a.M + a.V * a.e / 1000 >= 0, 'The total moment must cause tension at the top (+y) of the plate.');
  }
  need(s.dh > s.d, 'Head diameter must exceed the shank diameter.');
  need(s.fuk <= 800 && s.fyk < s.fuk, 'Stud steel needs f_yk < f_uk ≤ 800 MPa.');
  if (input.layout?.mode !== 'custom') { // grid layout; a custom layout is checked by validateLayout
    need(Number.isInteger(s.nx) && Number.isInteger(s.ny) && s.nx >= 1 && s.ny >= 1, 'Stud counts must be whole numbers ≥ 1.');
    need((s.nx === 1 || s.sx > 0) && (s.ny === 1 || s.sy > 0), 'Enter positive stud spacings.');
    for (const stud of studPositions(s)) {
      need(Math.abs(stud.x) <= p.B / 2 - s.d && Math.abs(stud.y) <= p.H / 2 - s.d, 'All studs must lie on the plate.');
    }
    need(Array.isArray(r.rows) && (r.rows.length >= 1 || s.tension === 'shared'), 'Add a welded bar row, or let the studs share tension.');
    for (const row of r.rows) {
      need(Number.isInteger(row.n) && row.n >= 1 && finite(row.d) && row.d >= 8 && row.d <= 40, 'Each bar row needs n ≥ 1 and 8 ≤ Ø ≤ 40 mm.');
      need(finite(row.y) && Math.abs(row.y) <= p.H / 2 - row.d, 'Bar rows must lie on the plate.');
      need(row.n === 1 || (finite(row.s) && row.s >= 2 * row.d), 'Bar spacing must be at least 2Ø.');
      need((row.n - 1) * (row.s || 0) / 2 <= p.B / 2 - row.d, 'Bars must lie on the plate.');
    }
  }
  need(['straight', 'bent'].includes(r.shape), 'Select the bar shape.');
  need(finite(r.throat) && r.throat > 0 && finite(m.weld) && m.weld > 0, 'Enter positive weld throats.');
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const edge = c.edges[side];
    need(edge === null || (finite(edge) && edge > 0), 'Edge distances must be positive or blank.');
  }
  const half = { top: p.H / 2, bottom: p.H / 2, left: p.B / 2, right: p.B / 2 };
  for (const side of Object.keys(half)) {
    need(c.edges[side] === null || c.edges[side] >= half[side], `The ${side} edge cuts through the plate.`);
  }
  need(['component', 'block'].includes(o.method), 'Select the compression model.');
  need(['grid', 'custom'].includes(input.layout?.mode), 'Select the layout mode.');
  need(['fem', 'rigid'].includes(o.analysis), 'Select the plate analysis.');
  need(['excluded', 'shared'].includes(s.tension), 'Select how studs take tension.');
  need(finite(o.betaJ) && o.betaJ > 0 && o.betaJ <= 1, 'β_j must lie in (0, 1].');
  need(finite(o.alpha) && o.alpha >= 1 && o.alpha <= 3, 'α (EC2 Eq. 6.63 spread factor) must lie in [1, 3].');
  need(finite(s.k8) && s.k8 > 0, 'Enter k_8 from the product specification.');
  return input;
}
