import { unverified } from './detailing.mjs';

const yieldStrain = 0.045;
const peakStrain = 0.002;
const ultimateStrain = 0.0035;
const modulus = 200000;
const angleCount = 48;
const compressiveStrength = fck => Math.min(Math.cbrt(40 / fck), 1) * 0.85 * fck / 1.5;

function sectionModel(input, section) {
  const { concreteRadius: radius, bars } = section;
  const diameter = 2 * radius;
  const fcd = compressiveStrength(input.concrete);
  const fyd = input.steel / 1.15;
  const concreteStress = e => e <= 0 ? 0 : fcd * (1 - (1 - Math.min(1, e / peakStrain)) ** 2);
  const steelStress = e => Math.max(-fyd, Math.min(fyd, modulus * e));
  const steelArea = bars.reduce((sum, bar) => sum + bar.area, 0);
  const grossArea = Math.PI * radius ** 2;
  const compression = ((grossArea - steelArea) * fcd + steelArea * steelStress(peakStrain)) / 1000;
  const tension = -steelArea * fyd / 1000;
  const stripCount = 120;
  const width = diameter / stripCount;
  const strips = Array.from({ length: stripCount }, (_, index) => {
    const distance = radius - (index + 0.5) * width;
    return { distance, area: 2 * Math.sqrt(radius ** 2 - distance ** 2) * width };
  });
  const stripArea = strips.reduce((sum, strip) => sum + strip.area, 0);
  for (const strip of strips) strip.area *= grossArea / stripArea;

  function atAngle(angle) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const projected = bars.map(bar => ({ ...bar, distance: bar.x * cos + bar.y * sin }));
    const depth = radius - Math.min(...projected.map(bar => bar.distance));
    const firstPivot = ultimateStrain * depth / (ultimateStrain + yieldStrain);
    const lastPivot = diameter * (1 - peakStrain / ultimateStrain);

    function resultant(t) {
      // Interpolate strain planes between the tension, balanced, full-depth and compression pivots.
      let intercept;
      let curvature;
      if (t <= 1) {
        curvature = t * (ultimateStrain + yieldStrain) / depth;
        intercept = -yieldStrain + curvature * (depth - radius);
      } else if (t <= 2) {
        const pivotCurvature = ultimateStrain / diameter;
        curvature = pivotCurvature + (2 - t) * (ultimateStrain / firstPivot - pivotCurvature);
        intercept = ultimateStrain - curvature * radius;
      } else {
        curvature = (3 - t) * ultimateStrain / diameter;
        intercept = peakStrain + curvature * (lastPivot - radius);
      }
      let axial = 0, concreteMoment = 0;
      for (const { distance, area } of strips) {
        const force = concreteStress(intercept + curvature * distance) * area;
        axial += force;
        concreteMoment += force * distance;
      }
      let mx = concreteMoment * cos, my = concreteMoment * sin;
      for (const { x, y, distance, area } of projected) {
        const strain = intercept + curvature * distance;
        const force = (steelStress(strain) - concreteStress(strain)) * area;
        axial += force;
        mx += force * x;
        my += force * y;
      }
      return { axial: axial / 1000, mx: mx / 1e6, my: my / 1e6 };
    }
    return axial => {
      let lower = 0, upper = 3;
      for (let step = 0; step < 29; step++) {
        const middle = (lower + upper) / 2;
        if (resultant(middle).axial < axial) lower = middle;
        else upper = middle;
      }
      return resultant((lower + upper) / 2);
    };
  }
  return { atAngle, compression, tension, steelArea, grossArea };
}

function capacityAt(axial, direction, planes) {
  const cos = Math.cos(direction), sin = Math.sin(direction);
  const points = planes.map(evaluate => {
    const { mx, my } = evaluate(axial);
    return { along: mx * cos + my * sin, across: -mx * sin + my * cos };
  });
  let capacity = 0;
  for (const [index, a] of points.entries()) {
    const b = points[(index + 1) % points.length];
    if (a.across === 0) capacity = Math.max(capacity, a.along);
    if (a.across * b.across < 0) {
      capacity = Math.max(capacity, a.along - a.across * (b.along - a.along) / (b.across - a.across));
    }
  }
  return capacity;
}

export function sectionResistance(input, section) {
  const { axial, mx, my } = input;
  const { atAngle, compression, tension } = sectionModel(input, section);
  const moment = Math.hypot(mx, my);
  const direction = Math.atan2(my, mx);
  const planes = Array.from({ length: angleCount }, (_, index) => atAngle(direction + index * 2 * Math.PI / angleCount));
  const inside = axial > tension && axial < compression;
  const capacity = inside ? capacityAt(axial, direction, planes) : 0;
  const axialRatio = axial >= 0 ? axial / compression : axial / tension;
  const combined = moment === 0 ? axialRatio : !inside || capacity <= 0 ? Infinity : moment / capacity;
  const curve = [[0, tension]];
  for (let index = 1; index < 30; index++) {
    const force = tension + index / 30 * (compression - tension);
    curve.push([capacityAt(force, direction, planes), force]);
  }
  curve.push([0, compression]);
  return { compression, tension, axialRatio, combined, capacity, demand: [moment, axial], curve };
}

export function slendernessCheck(input, section) {
  const label = 'Slenderness';
  if (input.axial <= 0) return { label, status: 'pass', detail: 'No net axial compression for this load case.' };
  if (input.secondOrderIncluded) return unverified(label, 'Entered design moments include externally assessed second-order effects.');
  if (input.effectiveLengthX === null || input.effectiveLengthY === null) {
    return unverified(label, 'Enter both effective lengths or supply externally assessed design moments.');
  }
  // EN 1992-1-1:2004 §5.8.3.1, recommended fallbacks A=0.7, B=1.1, C=0.7.
  // Independent screening with the 2004 recommended alpha_cc = 1.0 and gamma_C = 1.5.
  const grossArea = Math.PI * section.concreteRadius ** 2;
  const n = input.axial * 1000 / (grossArea * input.concrete / 1.5);
  const limit = 20 * 0.7 * 1.1 * 0.7 / Math.sqrt(n);
  const ratios = [input.effectiveLengthX, input.effectiveLengthY].map(length => 4 * length / input.diameter);
  const display = '2004 recommended screen: λx / λy = ' + ratios.map(value => value.toFixed(1)).join(' / ') +
    ' · λlim = ' + limit.toFixed(1) + '.';
  return Math.max(...ratios) < limit
    ? { label, status: 'pass', detail: display + ' Supply design moments including applicable imperfections.' }
    : unverified(label, display + ' Include second-order effects in the design moments.');
}
