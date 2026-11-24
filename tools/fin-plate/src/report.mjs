import { sciSource } from './sci-p358.mjs';
import { supportNames, connectionNames, jointForSupport, jointNames } from './inputs.mjs';

export const percent = ratio => Number.isFinite(ratio) ? (100 * ratio).toFixed(1) + '%' : 'Over limit';
const decimal = value => value.toFixed(2);
const safe = value => String(value).replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);

export function report(input, beam, result) {
  const lines = [
    ['Fin Plate Connection', 1], [result.status, 2],
    ['Basis · BS EN 1993-1-8:2005 and SCI P358 component assessment'],
    ['Beam · ' + beam.name + ' · web thickness ' + beam.tw + ' mm · fu ' + input.beamFu + ' MPa'],
    ['Joint · ' + (jointNames[jointForSupport(input.support)] ?? 'Legacy support')],
    ['Support · ' + supportNames[input.support] + ' · Layout · ' + connectionNames[input.type]],
    ...(result.notch ? [['Notch · Top ' + result.notch.top + ' mm · Bottom ' + result.notch.bottom
      + ' mm · Length ' + result.notch.length + ' mm']] : []),
    ['Fin plate · ' + result.height + ' × ' + result.width + ' × ' + input.thickness + ' mm'],
    ['Plate strengths · fy ' + input.plateFy + ' MPa · fu ' + input.plateFu + ' MPa'],
    ['Bolts · ' + input.columns + ' columns × ' + input.rows + ' rows · M' + input.diameter + ' grade ' + input.grade],
    ['Normal round holes · ' + result.bolt.hole + ' mm · ' + (input.threaded ? 'threads in shear plane' : 'shank in shear plane')],
    ['Vertical shear · ' + input.vertical + ' kN · Horizontal force · ' + input.horizontal + ' kN'],
    ['Skew · ' + input.skew + '° · Reference · ' + input.eccentricityMode],
    ['Axis eccentricity · ' + decimal(result.z) + ' mm · Normal projection · ' + decimal(result.normal) + ' mm'],
    ['Minimum normal clearance for square beam end · ' + decimal(result.supportClearance) + ' mm'],
    ['Elastic bolt-group moment · ' + decimal(result.moment / 1000) + ' kNm'],
    ['Group polar property · ' + decimal(result.group.polar) + ' mm⁴'],
    ['Bolt design shear resistance · ' + decimal(result.shearResistance) + ' kN'],
    ...(result.weld ? [['Double fillet · Throat ' + decimal(result.weld.throat) + ' mm · Required ' + decimal(result.weld.minimum) + ' mm']] : []),
    ['Component results', 2],
    ...result.checks.map(check => [check.name + ' · ' + percent(check.ratio) + (check.bolt ? ' · bolt ' + check.bolt : '')
      + (check.resistance != null ? ' · ' + decimal(check.resistance) + ' ' + (check.unit ?? 'kN') : '')]),
    ...[...result.details, ...result.openChecks].map(detail => [detail]),
    ...(result.customLayout ? [['Coordinate layout · Bearing and pitch assessment require a regular grid.']] : []),
    ['Bearing screening combines directional ratios linearly.'],
    ['Full connection assessment requires all applicable resistance and detailing checks.'],
    ['Source · SCI P358 §5.5 and §5.6'],
    [sciSource],
    ['Elastic bolt forces (kN)', 2],
    ...result.group.bolts.map(b => ['Bolt ' + b.id + ' · Fx ' + decimal(b.fx) + ' · Fy ' + decimal(b.fy)
      + ' · Resultant ' + decimal(b.force) + ' · Shear ' + percent(b.shear)
      + (b.web ? ' · Web ' + percent(b.web.utilization) + ' · Plate ' + percent(b.plate.utilization) : '')]),
  ];
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const perPage = 31;
  return {
    format: 'calccanvas', version: 3, id, title: 'Fin Plate Connection', createdAt: now, updatedAt: now,
    settings: { unitSystem: 'SI', canvasMode: 'page', pageOrientation: 'portrait', pages: Math.ceil(lines.length / perPage) },
    shapes: lines.map(([label, heading], index) => ({
      id: id + '_' + index, type: 'text', x: 60,
      y: 58 + (index % perPage) * 30 + Math.floor(index / perPage) * 1123,
      props: { w: 660, h: 28, html: safe(label), fontFamily: 'Inter', fontSize: heading === 1 ? 20 : heading ? 16 : 13,
        color: '#1e3a5f', align: 'left', ...(heading ? { heading } : {}) },
    })),
  };
}
