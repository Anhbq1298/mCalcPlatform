import { exampleLayers, validateLayers, migrateInputs } from './reinforcement.mjs';
import { legacyDefaults } from './legacy-inputs.mjs';
export { cageGeometry } from './reinforcement.mjs';
export const inputGroups = [
  ['Materials', [
    ['concrete', 'Concrete fck (MPa)', 32, 12, 90],
    ['steel', 'Longitudinal steel fyk (MPa)', 500, 1],
    ['linkSteel', 'Link steel fyk (MPa)', 500, 1],
    ['classA', 'Class A transverse steel', 0, 0, 1, 1],
  ]],
  ['Section', [
    ['diameter', 'Diameter (mm)', 1000, 1],
    ['cover', 'Cover to outer link (mm)', 40, 0],
    ['aggregate', 'Maximum aggregate size (mm)', 20, 0],
  ]],
  ['Detailing basis — EC2:2004', [
    ['k1', 'NA spacing k1 (recommended 1)', 1, 0.01],
    ['k2', 'NA spacing k2 (mm, recommended 5)', 5, 0],
    ['maxLinkSpacing', 'NA link spacing cap (mm, recommended 400)', 400, 1],
    ['reducedZone', 'End or lap zone (0.6 spacing factor)', 0, 0, 1, 1],
  ]],
  ['Design actions', [
    ['axial', 'NEd (kN, compression positive)', 8000],
    ['mx', 'Mx,Ed (kN·m)', 3000],
    ['my', 'My,Ed (kN·m)', 2000],
    ['shear', 'VEd (kN, magnitude)', 2500, 0],
  ]],
];
export const fields = inputGroups.flatMap(([, group]) => group);
export const defaults = { ...Object.fromEntries(fields.map(([id, , value]) => [id, value])), inputVersion: 2, ...exampleLayers() };
export function restoreInputs(raw) {
  const next = migrateInputs(raw, { ...legacyDefaults, ...defaults });
  if (raw.linkSteel === undefined && raw.spiralSteel !== undefined) next.linkSteel = raw.spiralSteel;
  validateInputs(next);
  return next;
}
export function validateInputs(input) {
  for (const [id, label, , min = -Infinity, max = Infinity, step] of fields) {
    const value = input[id];
    if (!Number.isFinite(value) || value < min || value > max || (step === 1 && !Number.isInteger(value))) throw new Error('Check the value for ' + label + '.');
  }
  validateLayers(input);
}
