// Input model (schema 1), defaults, restore and validation. Units: mm, kN, kN·m, MPa.
// Unknown fields are preserved on restore. Each issue carries the state it produces.

export const STATES = {
  pass: 'Pass',
  fail: 'Fail',
  incomplete: 'Incomplete input',
  unsupportedGeometry: 'Unsupported geometry',
  unsupportedLoading: 'Unsupported loading',
  notVerified: 'Not verified',
  confirm: 'Requires confirmation',
  notRequired: 'Not required',
  linksRequired: 'Links required',
};

export function newDefaults() {
  return {
    code: { edition: 'EN 1992-1-1:2004 + AC:2010 + A1:2014', profile: 'cen', naConfirmed: false },
    column: { shape: 'rectangular', position: 'internal', cx: 300, cy: 900, diameter: 500, rotation: 0, x: 0, y: 0 },
    slab: { h: 250, depthMode: 'explicit', dx: 218, dy: 218, cover: 25, xMin: -4000, xMax: 4000, yMin: -4000, yMax: 4000 },
    materials: { fck: 30, fyk: 500 },
    prestress: { sigmaX: 0, sigmaY: 0 },
    flexure: { phiX: 16, sX: 150, phiY: 16, sY: 150, outer: 'x', asx: 1090, asy: 1090, areaMode: 'explicit' },
    head: { enabled: false, shape: 'rectangular', lx: 1500, ly: 1500, diameter: 1500, depth: 150, confirmed: false },
    openings: [],
    loadType: 'net',
    loads: [{ name: 'ULS 1', V: 1112.197, Mx: 0, My: 0 }],
    beta: { method: 'simplified', confirmed: false, userValue: 1.15 },
    reinforcement: {
      mode: 'auto', diameter: 10, shape: 'single', legGap: 100, layers: [],
      anchorage: { type: 'hook', mandrelFactor: 4, extension: 75, engaged: false },
    },
  };
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Deep merge of saved inputs over defaults; arrays are taken from the saved value; extra keys kept.
function merge(base, saved) {
  if (!record(saved)) return structuredClone(base);
  const out = { ...saved };
  for (const [key, value] of Object.entries(base)) {
    if (record(value)) out[key] = merge(value, saved[key]);
    else if (!(key in saved)) out[key] = structuredClone(value);
  }
  return out;
}

export function restoreInputs(saved) {
  return merge(newDefaults(), structuredClone(saved ?? {}));
}

const barArea = diameter => (Math.PI * diameter * diameter) / 4;

// Effective depths and flexural areas used by the solver.
export function derivedSection(input) {
  const { slab, flexure } = input;
  let dx = slab.dx;
  let dy = slab.dy;
  if (slab.depthMode === 'bars') {
    const [first, second] = flexure.outer === 'y' ? ['phiY', 'phiX'] : ['phiX', 'phiY'];
    const outer = slab.h - slab.cover - flexure[first] / 2;
    const inner = slab.h - slab.cover - flexure[first] - flexure[second] / 2;
    dx = flexure.outer === 'y' ? inner : outer;
    dy = flexure.outer === 'y' ? outer : inner;
  }
  const asx = flexure.areaMode === 'bars' ? barArea(flexure.phiX) * 1000 / flexure.sX : flexure.asx;
  const asy = flexure.areaMode === 'bars' ? barArea(flexure.phiY) * 1000 / flexure.sY : flexure.asy;
  return { dx, dy, d: (dx + dy) / 2, asx, asy };
}

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function validateGeometry(input) {
  const issues = [];
  const { column = {}, slab = {}, flexure = {} } = input;
  if (!['internal', 'edge', 'corner'].includes(column.position)) issues.push({ state: STATES.incomplete, message: 'Select the column position.' });
  if (column.shape === 'rectangular') {
    if (!positive(column.cx) || !positive(column.cy)) issues.push({ state: STATES.incomplete, message: 'Enter both rectangular column dimensions.' });
  } else if (column.shape === 'circular') {
    if (!positive(column.diameter)) issues.push({ state: STATES.incomplete, message: 'Enter the circular column diameter.' });
  } else issues.push({ state: STATES.unsupportedGeometry, message: 'Select a rectangular or circular column.' });
  if (![column.rotation, column.x, column.y].every(finite)) issues.push({ state: STATES.incomplete, message: 'Enter the column centre and rotation.' });
  if (!positive(slab.h)) issues.push({ state: STATES.incomplete, message: 'Enter the slab thickness.' });
  if (slab.depthMode === 'bars' && (!positive(slab.cover) || !positive(flexure.phiX) || !positive(flexure.phiY))) {
    issues.push({ state: STATES.incomplete, message: 'Enter the cover and flexural bar diameters to derive the effective depths.' });
  }
  if (flexure.areaMode === 'bars' && (!positive(flexure.sX) || !positive(flexure.sY))) {
    issues.push({ state: STATES.incomplete, message: 'Enter the flexural bar spacing in both directions.' });
  }
  if (!issues.length) {
    const { dx, dy, asx, asy } = derivedSection(input);
    if (!positive(dx) || !positive(dy) || dx >= slab.h || dy >= slab.h) issues.push({ state: STATES.incomplete, message: 'Effective depths must be positive and smaller than the slab thickness.' });
    if (!positive(asx) || !positive(asy)) issues.push({ state: STATES.incomplete, message: 'Enter the flexural reinforcement in both directions.' });
  }
  if (![slab.xMin, slab.xMax, slab.yMin, slab.yMax].every(finite) || slab.xMin >= slab.xMax || slab.yMin >= slab.yMax) {
    issues.push({ state: STATES.incomplete, message: 'Enter valid slab edge coordinates (minimum below maximum).' });
  }
  for (const [index, opening] of (input.openings || []).entries()) {
    if (![opening.x, opening.y].every(finite) || !positive(opening.w) || !positive(opening.h)) {
      issues.push({ state: STATES.incomplete, message: `Opening O${index + 1}: enter centre coordinates and positive dimensions.` });
    }
  }
  return issues;
}

export function validateMaterials(input) {
  const { fck, fyk } = input.materials || {};
  const issues = [];
  const { sigmaX, sigmaY } = input.prestress || {};
  if (!finite(sigmaX) || !finite(sigmaY)) issues.push({ state: STATES.incomplete, message: 'Enter the in-plane normal stresses σ_cx and σ_cy (0 when none).' });
  if (!finite(fck) || fck < 12 || fck > 90) issues.push({ state: STATES.incomplete, message: 'Concrete f_ck must be between 12 and 90 MPa.' });
  if (!finite(fyk) || fyk < 400 || fyk > 600) issues.push({ state: STATES.incomplete, message: 'Link steel f_yk must be between 400 and 600 MPa (EN 1992-1-1 Annex C range).' });
  return issues;
}

export function validateLoad(load) {
  const issues = [];
  if (![load.V, load.Mx, load.My].every(finite)) return [{ state: STATES.incomplete, message: `${load.name}: enter V_Ed, M_x and M_y.` }];
  if (load.V <= 0 && (load.Mx !== 0 || load.My !== 0)) issues.push({ state: STATES.unsupportedLoading, message: `${load.name}: moment transfer with zero or upward punching force is not covered by §6.4.3.` });
  else if (load.V <= 0) issues.push({ state: STATES.incomplete, message: `${load.name}: punching force V_Ed must be greater than zero.` });
  return issues;
}

export function validateBeta(beta = {}) {
  if (beta.method === 'simplified') {
    return beta.confirmed === true ? [] : [{ state: STATES.incomplete, message: 'Confirm the §6.4.3(6) conditions (braced structure, adjacent spans differing by no more than 25 %) to use β = 1.15.' }];
  }
  if (beta.method === 'user') {
    if (!finite(beta.userValue) || beta.userValue < 1) return [{ state: STATES.incomplete, message: 'User-defined β must be a number ≥ 1.' }];
    if (beta.userValue > 3) return [{ state: STATES.incomplete, message: 'User-defined β above 3 is not physically meaningful for punching; check the value.' }];
    return [];
  }
  if (beta.method === 'moment') return [];
  return [{ state: STATES.incomplete, message: 'Select a β method.' }];
}

export function validateReinforcement(reinforcement = {}) {
  const issues = [];
  if (reinforcement.mode === 'auto') {
    if (![6, 8, 10, 12, 16, 20].includes(reinforcement.diameter)) issues.push({ state: STATES.incomplete, message: 'Select a link diameter.' });
  } else if (reinforcement.mode === 'provided') {
    for (const [index, layer] of (reinforcement.layers || []).entries()) {
      if (!positive(layer.offset) || !positive(layer.diameter) || !Number.isInteger(layer.links) || layer.links < 1 || !finite(layer.start)) {
        issues.push({ state: STATES.incomplete, message: `Layer L${index + 1}: enter offset, diameter, a whole number of links and a start position.` });
      }
    }
  } else issues.push({ state: STATES.incomplete, message: 'Select a reinforcement mode.' });
  const anchorage = reinforcement.anchorage || {};
  if (!['hook', 'bend'].includes(anchorage.type) || !positive(anchorage.mandrelFactor) || !finite(anchorage.extension) || anchorage.extension < 0) {
    issues.push({ state: STATES.incomplete, message: 'Enter the link anchorage type, mandrel diameter factor and extension.' });
  }
  const usesDouble = reinforcement.mode === 'auto' ? reinforcement.shape === 'double' : (reinforcement.layers || []).some(layer => layer.shape === 'double');
  if (usesDouble && !positive(reinforcement.legGap)) issues.push({ state: STATES.incomplete, message: 'Enter the two-leg link width.' });
  return issues;
}
