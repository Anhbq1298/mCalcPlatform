import { boltGrades, boltSizes } from './bolt-group.mjs';

export const defaults = Object.freeze({
  section: 3129, h: 533.1, b: 209.3, tw: 10.1, tf: 15.6, r: 13,
  beamFy: 355, beamFu: 470, plateFu: 470, plateFy: 355, thickness: 10,
  notchTop: 0, notchBottom: 0, notchLength: 0,
  support: 'beam-web', type: 'standard', vertical: 300, horizontal: 0, appliedMoment: 0,
  supportSection: null, beamLayout: 'fit', supportAlignment: 'custom', supportLevel: 40, supportH: 610, supportB: 229, supportTw: 13, supportTf: 20, supportR: 13,
  supportThickness: 0, supportFy: 355, supportFu: 470, weldLeg: 9, restrained: false,
  columns: 2, rows: 5, pitch: 85, gauge: 80, secondGauge: 80,
  diameter: 24, grade: '8.8', threaded: true, top: 40, bottom: 40,
  beamEnd: 60, plateEdge: 50, gap: 10, offset: 0, skew: 0,
  eccentricityMode: 'geometry', eccentricity: 150, coordinates: null,
});

export const highSkew = { ...defaults, type: 'skewed', skew: 50, eccentricityMode: 'normal' };

export const supportNames = {
  'beam-web': 'Beam web', 'column-flange': 'I/H column flange', 'column-web': 'I/H column web',
  rhs: 'RHS outer face', shs: 'SHS outer face', chs: 'CHS outer face', rigid: 'Rigid support plate',
};
export const jointNames = { 'beam-beam': 'Beam to beam', 'beam-column': 'Beam to column' };
export const columnSupports = ['column-web', 'column-flange', 'shs', 'rhs', 'chs'];

export function jointForSupport(support) {
  return support === 'beam-web' ? 'beam-beam' : support === 'rigid' ? 'legacy' : 'beam-column';
}

export const connectionNames = {
  standard: 'Standard', extended: 'Extended', skewed: 'Skewed',
  'skewed-extended': 'Skewed extended', stiffened: 'Stiffened extended',
};

export function validateInputs(input, beam) {
  const positive = ['beamFu', 'plateFu', 'plateFy', 'thickness', 'pitch', 'gauge', 'secondGauge',
    'top', 'bottom', 'beamEnd', 'plateEdge', 'supportFy', 'supportFu', 'weldLeg'];
  if (positive.some(key => !Number.isFinite(input[key]) || input[key] <= 0 || input[key] > 10000)
    || !Number.isFinite(input.gap) || input.gap < 0 || input.gap > 10000) {
    throw new RangeError('Enter positive dimensions and material strengths, and a non-negative end gap.');
  }
  if (input.plateFu < input.plateFy || input.supportFu < input.supportFy) {
    throw new RangeError('Ultimate strength must be at least the corresponding yield strength.');
  }
  if (!Number.isFinite(input.supportThickness) || input.supportThickness < 0 || input.supportThickness > 10000) {
    throw new RangeError('Enter a positive support thickness or 0 to leave the support check open.');
  }
  if (!Number.isInteger(input.columns) || input.columns < 1 || input.columns > 3
    || !Number.isInteger(input.rows) || input.rows < 2 || input.rows > 30) {
    throw new RangeError('Enter one to three vertical columns and two to thirty horizontal rows.');
  }
  if (input.coordinates != null && (!Array.isArray(input.coordinates)
    || input.coordinates.length !== input.rows * input.columns
    || input.coordinates.some((point, i) => point?.id !== i + 1
      || ![point.x, point.y].every(value => Number.isFinite(value) && Math.abs(value) <= 1e6)))) {
    throw new RangeError('Enter one finite X and Y coordinate for every bolt in the arrangement.');
  }
  if (['vertical', 'horizontal', 'appliedMoment', 'offset', 'skew', 'eccentricity']
    .some(key => !Number.isFinite(input[key]) || Math.abs(input[key]) > 1e6)
    || Math.abs(input.skew) > 50 || input.eccentricity < 0) {
    throw new RangeError('Enter finite loads and offsets, a non-negative eccentricity and skew between −50° and +50°.');
  }
  if (!Object.hasOwn(supportNames, input.support) || !Object.hasOwn(connectionNames, input.type)
    || !['geometry', 'normal', 'axis'].includes(input.eccentricityMode)
    || !boltGrades.has(input.grade) || !boltSizes.has(input.diameter) || typeof input.threaded !== 'boolean'
    || typeof input.restrained !== 'boolean') {
    throw new RangeError('Select a supported connection, eccentricity mode and bolt specification.');
  }
  const beamFy = input.beamFy ?? defaults.beamFy;
  if (input.support === 'beam-web') {
    const { notchTop = 0, notchBottom = 0, notchLength = 0 } = input;
    if (![notchTop, notchBottom, notchLength].every(value => Number.isFinite(value) && value >= 0 && value <= 10000)
      || notchTop + notchBottom >= beam.h
      || ((notchTop || notchBottom) && (!notchLength || [notchTop, notchBottom].some(d => d && d < beam.tf + beam.r)))
      || (Boolean(notchTop) !== Boolean(notchBottom) && beam.h - notchTop - notchBottom <= beam.tf + beam.r)) {
      throw new RangeError('Enter a positive notch length and cut depths that remove the flange and root while leaving a web.');
    }
    if ((notchTop || notchBottom) && (!Number.isFinite(beamFy) || beamFy <= 0 || beamFy > input.beamFu)) {
      throw new RangeError('Beam yield strength must be positive and at most the beam ultimate strength.');
    }
  }
  if (['h', 'b', 'tw', 'tf', 'r'].some(key => !Number.isFinite(beam[key]) || beam[key] > 10000)
    || beam.r < 0 || beam.tf <= 0 || beam.tw <= 0 || beam.h <= 2 * (beam.tf + beam.r)
    || beam.b <= beam.tw + 2 * beam.r) {
    throw new RangeError('Check the beam web, flange and root dimensions.');
  }
}
