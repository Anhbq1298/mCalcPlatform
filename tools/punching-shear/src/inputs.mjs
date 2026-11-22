// Input model (schema 1), defaults, restore and validation. Units: mm, kN, kN·m, MPa.
// Unknown fields are preserved on restore. Each issue carries the state it produces.

// Link bar diameters (mm); 13 covers H13 to SS 560 (Singapore).
export const LINK_DIAMETERS = [6, 8, 10, 12, 13, 16, 20];

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
    head: { enabled: false, shape: 'rectangular', lx: 1500, ly: 1500, diameter: 1500, thickness: 400 },
    openings: [],
    loadType: 'net',
    loads: [{ name: 'ULS 1', V: 1112.197, Mx: 0, My: 0 }],
    beta: { method: 'simplified', confirmed: false, userValue: 1.15 },
    reinforcement: {
      mode: 'auto', diameter: 10, shape: 'single', legGap: 100, groups: [], omitted: {},
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

// Older saves: drop depth below the slab (head.depth) and explicit link layers (reinforcement.layers).
function migrate(saved) {
  const head = saved.head;
  if (record(head) && head.depth !== undefined && head.thickness === undefined) {
    head.thickness = (saved.slab?.h ?? newDefaults().slab.h) + head.depth;
    delete head.depth;
  }
  const r = saved.reinforcement;
  if (record(r) && Array.isArray(r.layers) && r.groups === undefined) {
    r.groups = r.layers.map((layer, i) => ({ count: 1, spacing: layer.offset - (i ? r.layers[i - 1].offset : 0), diameter: layer.diameter, shape: layer.shape, links: layer.links }));
    r.omitted = Object.fromEntries(r.layers.map((layer, i) => ['L' + (i + 1), layer.omitted || []]).filter(([, list]) => list.length));
    delete r.layers;
  }
  // Rows of n layers (count) from earlier versions become one row per layer.
  if (record(r) && Array.isArray(r.groups) && r.groups.some(group => (group.count ?? 1) > 1)) {
    r.groups = r.groups.flatMap(({ count = 1, ...group }) => Array.from({ length: Math.max(1, count) }, () => ({ ...group })));
  }
  return saved;
}

export function restoreInputs(saved) {
  return merge(newDefaults(), migrate(structuredClone(saved ?? {})));
}

// Link layers from the spacing groups: row 1 spacing is measured from the column face, each row adds
// `count` layers at its spacing. Offsets are distances from the column face (mm).
export function groupLayers(reinforcement = {}) {
  const layers = [];
  let offset = 0;
  for (const group of reinforcement.groups || []) {
    for (let k = 0; k < (group.count ?? 1); k += 1) {
      offset += group.spacing;
      const id = 'L' + (layers.length + 1);
      layers.push({ id, offset, diameter: group.diameter, shape: group.shape, ...(group.st > 0 ? { st: group.st } : { links: group.links }), start: 0, omitted: reinforcement.omitted?.[id] ?? [] });
    }
  }
  return layers;
}

// Arrangement rows from designed layers, one row per layer: radial spacing from the previous layer
// (row 1 from the column face) and the tangential spacing = largest designed gap rounded down to
// 5 mm, so the rebuilt layer has at least as many links.
export function layersToGroups(layers, summary = []) {
  return layers.map((layer, i) => {
    const spacing = Math.round(layer.offset - (i ? layers[i - 1].offset : 0));
    const gap = summary[i]?.tangential?.max;
    const st = Number.isFinite(gap) && gap > 0 ? Math.max(5, Math.floor(gap / 5 + 1e-9) * 5) : null;
    return { spacing, diameter: layer.diameter, shape: layer.shape, ...(st !== null ? { st } : { links: layer.links }) };
  });
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
    if (!LINK_DIAMETERS.includes(reinforcement.diameter)) issues.push({ state: STATES.incomplete, message: 'Select a link diameter.' });
  } else if (reinforcement.mode === 'provided') {
    const groups = reinforcement.groups || [];
    if (!groups.length) issues.push({ state: STATES.incomplete, message: 'Add at least one layer to the link arrangement, or use Auto arrangement.' });
    for (const [index, group] of groups.entries()) {
      const tangential = positive(group.st) || (Number.isInteger(group.links) && group.links >= 1);
      if (!(group.count === undefined || Number.isInteger(group.count) && group.count >= 1) || !positive(group.spacing) || !positive(group.diameter) || !tangential) {
        issues.push({ state: STATES.incomplete, message: `Layer L${index + 1}: enter the radial spacing s, a diameter and the tangential spacing s_t.` });
      }
    }
  } else issues.push({ state: STATES.incomplete, message: 'Select a reinforcement mode.' });
  const anchorage = reinforcement.anchorage || {};
  if (!['hook', 'bend'].includes(anchorage.type) || !positive(anchorage.mandrelFactor) || !finite(anchorage.extension) || anchorage.extension < 0) {
    issues.push({ state: STATES.incomplete, message: 'Enter the link anchorage type, mandrel diameter factor and extension.' });
  }
  const usesDouble = reinforcement.mode === 'auto' ? reinforcement.shape === 'double' : (reinforcement.groups || []).some(group => group.shape === 'double');
  if (usesDouble && !positive(reinforcement.legGap)) issues.push({ state: STATES.incomplete, message: 'Enter the two-leg link width.' });
  return issues;
}
