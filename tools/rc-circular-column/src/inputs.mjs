// The variable names identify editable definitions in the pinned Canvas worksheet.
export const inputGroups = [
  ['Materials', [
    ['concrete', 'Concrete fck (MPa)', 'f_{ck}', 'MPa', 35, 12, 90],
    ['steel', 'Longitudinal steel fyk (MPa)', 'f_{yk}', 'MPa', 500, 1],
    ['spiralSteel', 'Spiral steel fyk (MPa)', 'f_{ywk}', 'MPa', 500, 1],
    ['classA', 'Class A spirals', '\\delta_{A}', '', 0, 0, 1, 1],
  ]],
  ['Section', [
    ['diameter', 'Diameter (mm)', 'D', 'mm', 1200, 1],
    ['cover', 'Cover to spiral (mm)', 'c_{nom}', 'mm', 75, 0],
    ['cages', 'Reinforcement cages', 'n_{set}', '', 1, 1, 2, 1],
  ]],
  ['Outer cage', [
    ['bar1', 'Outer bar diameter (mm)', '\\phi_{l1}', 'mm', 32, 1],
    ['count1', 'Outer bar count', 'n_{l1}', '', 22, 3, 300, 1],
    ['spiral1', 'Outer spiral diameter (mm)', '\\phi_{w1}', 'mm', 20, 1],
    ['pitch1', 'Outer spiral pitch (mm)', 's_{1}', 'mm', 85, 1],
  ]],
  ['Inner cage', [
    ['bar2', 'Inner bar diameter (mm)', '\\phi_{l2}', 'mm', 25, 1],
    ['count2', 'Inner bar count', 'n_{l2}', '', 16, 3, 300, 1],
    ['spiral2', 'Inner spiral diameter (mm)', '\\phi_{w2}', 'mm', 16, 1],
    ['pitch2', 'Inner spiral pitch (mm)', 's_{2}', 'mm', 150, 1],
  ]],
  ['Design actions', [
    ['axial', 'NEd (kN, compression positive)', 'N_{Ed}', 'kN', 8000],
    ['mx', 'Mx,Ed (kN·m)', 'M_{Ed.x}', 'kN m', 3000],
    ['my', 'My,Ed (kN·m)', 'M_{Ed.y}', 'kN m', 2000],
    ['shear', 'VEd (kN, magnitude)', 'V_{Ed}', 'kN', 2500, 0],
  ]],
];

export const fields = inputGroups.flatMap(([, group]) => group);
export const defaults = Object.fromEntries(fields.map(([id, , , , value]) => [id, value]));

export function cageGeometry(input) {
  const radius = input.diameter / 2;
  return [
    { count: input.count1, bar: input.bar1, spiral: input.spiral1, pitch: input.pitch1, cover: input.cover },
    { count: input.count2, bar: input.bar2, spiral: input.spiral2, pitch: input.pitch2,
      cover: input.cover + input.spiral1 + input.bar1 },
  ].slice(0, input.cages).map(cage => ({
    ...cage, barRadius: radius - cage.cover - cage.spiral - cage.bar / 2,
    spiralRadius: radius - cage.cover - cage.spiral / 2,
  }));
}

export function validateInputs(input) {
  for (const [id, label, , , , min = -Infinity, max = Infinity, step] of fields) {
    if (input.transverse === 'links' && /^(?:cages|(?:bar|count|spiral|pitch)[12])$/.test(id)) continue;
    const value = input[id];
    if (!Number.isFinite(value) || value < min || value > max || (step === 1 && !Number.isInteger(value))) {
      throw new Error('Check the value for ' + label + '.');
    }
  }
  if (input.transverse === 'links') {
    if (!Number.isFinite(input.aggregate) || input.aggregate <= 0) throw new Error('Enter a positive maximum aggregate size.');
    if (!Array.isArray(input.layers) || input.layers.length < 1 || input.layers.length > maxLayers) {
      throw new Error('Enter between 1 and ' + maxLayers + ' reinforcement layers.');
    }
    for (const [index, layer] of input.layers.entries()) {
      if (!layer || layerColumns.some(([key, , min, max = Infinity]) =>
        !Number.isFinite(layer[key]) || layer[key] < min || layer[key] > max
        || (key === 'count' && !Number.isInteger(layer[key])))) {
        throw new Error('Check the bar and link inputs for L' + (index + 1) + '.');
      }
    }
    if (linkGeometry(input).some(ring => ring.barRadius <= 0 || ring.clear < 0)) {
      throw new Error('The specified bars overlap or do not fit within the section.');
    }
    return;
  }
  for (const cage of cageGeometry(input)) {
    const separation = 2 * cage.barRadius * Math.sin(Math.PI / cage.count);
    if (cage.barRadius <= 0 || separation < cage.bar) throw new Error('The specified bars overlap or do not fit within the section.');
  }
}

export const maxLayers = 8;
export const layerColumns = [
  ['count', 'Bars', 4, 300],
  ['bar', 'Bar Ø (mm)', 1],
  ['link', 'Link Ø (mm)', 1],
  ['spacing', 'Link spacing (mm)', 1],
];

const defaultLayer = index => index === 0
  ? { count: 22, bar: 32, link: 20, spacing: 85 }
  : { count: Math.max(4, 20 - 4 * index), bar: 25, link: 16, spacing: 150 };

export const newLayer = defaultLayer;
export const newDefaults = () => ({ ...defaults, transverse: 'links', aggregate: 20, layers: [defaultLayer(0)] });

export function restoreInputs(inputs) {
  return { ...newDefaults(), ...inputs, transverse: inputs.transverse ?? 'spirals' };
}

// EN 1992-1-1:2004 §8.2(2), recommended coefficients. Apply the larger
// longitudinal diameter to a pair of layers and reserve room for the inner link.
export function minimumClearance(bar, adjacentBar, aggregate) {
  return Math.max(20, bar, adjacentBar, aggregate + 5);
}

export function linkGeometry(input) {
  let previous;
  return input.layers.map(layer => {
    const required = previous ? minimumClearance(previous.bar, layer.bar, input.aggregate) : null;
    const radialClear = previous ? Math.max(required, layer.link) : null;
    const barRadius = previous
      ? previous.barRadius - previous.bar / 2 - radialClear - layer.bar / 2
      : input.diameter / 2 - input.cover - layer.link - layer.bar / 2;
    const ring = {
      ...layer, barRadius, linkRadius: barRadius + (layer.bar + layer.link) / 2, radialClear, required,
      clear: 2 * barRadius * Math.sin(Math.PI / layer.count) - layer.bar,
    };
    previous = ring;
    return ring;
  });
}

export function linkChecks(input, rings = linkGeometry(input)) {
  const maximumSpacing = Math.min(20 * Math.min(...rings.map(ring => ring.bar)), input.diameter, 400);
  const minimumLink = Math.max(6, Math.max(...rings.map(ring => ring.bar)) / 4);
  const mm = value => value.toFixed(1) + ' mm';
  const row = (label, detail, pass) => ({ label, detail, status: pass ? 'pass' : 'fail' });
  return [
    { label: 'Nominal cover', detail: mm(input.cover) + ' to outside of outer link', status: 'off', statusLabel: 'Input' },
    ...rings.flatMap((ring, index) => {
      const mark = 'L' + (index + 1);
      const min = minimumClearance(ring.bar, ring.bar, input.aggregate);
      const checks = [
        row(mark + ' bar clearance', mm(ring.clear) + ' / min ' + mm(min), ring.clear >= min - 1e-8),
        row(mark + ' link diameter', mm(ring.link) + ' / min ' + mm(minimumLink), ring.link >= minimumLink),
        row(mark + ' link spacing', mm(ring.spacing) + ' / ' + mm(ring.link) + ' to ' + mm(maximumSpacing),
          ring.spacing >= ring.link && ring.spacing <= maximumSpacing),
      ];
      if (index) checks.push(row('L' + index + '–' + mark + ' radial clearance',
        mm(ring.radialClear) + ' / min ' + mm(ring.required), ring.radialClear >= ring.required));
      return checks;
    }),
  ];
}
