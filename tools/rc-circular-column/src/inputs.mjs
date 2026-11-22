import { geometry } from "./geometry.mjs";

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


export const maxLayers = 8;
export const newLayer = index => ({ count: index ? Math.max(4, 20 - 4 * index) : 22,
  bar: index ? 25 : 32, offset: 0, radius: null });
export const newTransverse = index => ({ diameter: index ? 16 : 20, spacing: index ? 150 : 85 });

export const newDefaults = () => ({
  ...defaults, transverse: 'links', aggregate: 20, height: 3000,
  layers: [newLayer(0)], reinforcement: { links: [newTransverse(0)], spirals: [newTransverse(0)] },
  effectiveLengthX: null, effectiveLengthY: null, creepRatio: 2, secondOrderIncluded: 0,
});

export function migrateInputs(inputs, from) {
  if (from === 1) return migrateInputs({ ...inputs, transverse: inputs.transverse ?? 'spirals' }, 2);
  if (from === 3) return { ...newDefaults(), ...inputs };
  if (from !== 2) throw new Error('Unsupported circular column input version.');
  const old = { ...defaults, aggregate: 20, ...inputs };
  const links = old.transverse === 'links';
  let previous;
  const source = links ? old.layers.map((layer, index) => {
    const gap = index ? Math.max(20, previous.bar, layer.bar, old.aggregate + 5, layer.link) : null;
    const radius = index ? previous.radius - previous.bar / 2 - gap - layer.bar / 2
      : old.diameter / 2 - old.cover - layer.link - layer.bar / 2;
    previous = { ...layer, radius };
    return { ...previous, diameter: layer.link };
  }) : cageGeometry(old).map(cage => ({
    ...cage, radius: cage.barRadius, diameter: cage.spiral, spacing: cage.pitch,
  }));
  const transverse = source.map(({ diameter, spacing }) => ({ diameter, spacing }));
  return migrateInputs({ ...inputs, transverse: old.transverse,
    layers: source.map(layer => ({ ...layer, offset: layer.offset ?? 0 })),
    reinforcement: { links: structuredClone(transverse), spirals: structuredClone(transverse) },
  }, 3);
}

const legacyKey = /^(?:cages|(?:bar|count|spiral|pitch)[12]|spiralSteel|classA)$/;
export const visibleGroups = inputGroups.filter(([title]) => !title.endsWith('cage')).map(([title, group]) =>
  [title, group.filter(([id]) => !legacyKey.test(id)).map(field =>
    field[0] === 'cover' ? ['cover', 'Nominal cover (mm)', ...field.slice(2)] : field)]);

export function validateInputs(input) {
  for (const [id, label, , , , min = -Infinity, max = Infinity] of visibleGroups.flatMap(([, group]) => group)) {
    if (!Number.isFinite(input[id]) || input[id] < min || input[id] > max) throw new Error('Check ' + label + '.');
  }
  if (!(Number.isFinite(input.height) && input.height > 0 && Number.isFinite(input.aggregate) && input.aggregate > 0)) {
    throw new Error('Enter a positive cage height and maximum aggregate size.');
  }
  for (const value of [input.effectiveLengthX, input.effectiveLengthY]) {
    if (value !== null && !(Number.isFinite(value) && value > 0)) throw new Error('Check the effective lengths.');
  }
  if (!(Number.isFinite(input.creepRatio) && input.creepRatio >= 0)) throw new Error('Check the effective creep ratio.');
  if (![0, 1].includes(input.secondOrderIncluded)) throw new Error('Check the action basis.');
  if (!['links', 'spirals'].includes(input.transverse) || !Array.isArray(input.layers)
    || input.layers.length < 1 || input.layers.length > maxLayers
    || !['links', 'spirals'].every(mode => Array.isArray(input.reinforcement?.[mode])
      && input.reinforcement[mode].length === input.layers.length)) {
    throw new Error('Provide one transverse layer per longitudinal layer in each mode.');
  }
  for (const [index, layer] of input.layers.entries()) {
    if (!layer || !Number.isInteger(layer.count) || layer.count < 3 || layer.count > 300
      || !Number.isFinite(layer.bar) || layer.bar <= 0 || !Number.isFinite(layer.offset)
      || (layer.radius !== null && !(Number.isFinite(layer.radius) && layer.radius > 0))
      || !['links', 'spirals'].every(mode => {
        const row = input.reinforcement[mode][index];
        return row && [row.diameter, row.spacing].every(value => Number.isFinite(value) && value > 0);
      })) throw new Error('Check reinforcement inputs for L' + (index + 1) + '.');
  }
  return geometry(input);
}
