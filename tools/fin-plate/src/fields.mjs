import { boltGrades, boltSizes } from './bolt-group.mjs';
import { supportNames, connectionNames } from './inputs.mjs';

export const beamFields = [
  ['h', 'Depth h (mm)'], ['b', 'Flange width b (mm)'], ['tw', 'Web thickness (mm)'],
  ['tf', 'Flange thickness (mm)'], ['r', 'Root radius (mm)'],
];
export const groups = [
  ['Supported beam', [
    ['section', 'Section', 'catalogue'], ...beamFields, ['beamFu', 'Web ultimate strength (MPa)'],
    ['restrained', 'Beam laterally restrained', 'checkbox'],
  ]],
  ['Support and load', [
    ['support', 'Support', Object.entries(supportNames)], ['type', 'Fin plate', Object.entries(connectionNames)],
    ['vertical', 'ULS shear (kN)'], ['horizontal', 'In-plane horizontal (kN)'], ['appliedMoment', 'Additional moment (kNm)'],
  ]],
  ['Bolt arrangement', [
    ['columns', 'Vertical bolt columns', [[1, '1'], [2, '2'], [3, '3']]], ['rows', 'Horizontal bolt rows'],
    ['pitch', 'Vertical pitch (mm)'], ['gauge', 'First horizontal pitch (mm)'], ['secondGauge', 'Second horizontal pitch (mm)'],
    ['diameter', 'Diameter', [...boltSizes.keys()].map(d => [d, 'M' + d])],
    ['grade', 'Bolt grade', [...boltGrades.keys()].map(grade => [grade, grade])],
    ['threaded', 'Threads in shear plane', 'checkbox'],
  ]],
  ['Fin plate and clearance', [
    ['thickness', 'Thickness (mm)'], ['plateFy', 'Yield strength (MPa)'], ['plateFu', 'Ultimate strength (MPa)'],
    ['top', 'Top end distance (mm)'], ['bottom', 'Bottom end distance (mm)'],
    ['plateEdge', 'Plate free edge (mm)'], ['beamEnd', 'Beam end distance (mm)'], ['gap', 'Beam end gap (mm)'],
    ['offset', 'Beam centre above plate centre (mm)'],
  ]],
  ['Weld and support resistance', [
    ['weldLeg', 'Double fillet leg (mm)'], ['supportThickness', 'Support thickness (mm, 0 skips check)'],
    ['supportFy', 'Support yield strength (MPa)'], ['supportFu', 'Support ultimate strength (MPa)'],
  ]],
  ['Skew and eccentricity', [
    ['skew', 'Plan skew (°)'],
    ['eccentricityMode', 'Reference', [['geometry', 'From geometry'], ['normal', 'Normal to support'], ['axis', 'Along beam axis']]],
    ['eccentricity', 'Centroid eccentricity (mm)'],
  ]],
];
