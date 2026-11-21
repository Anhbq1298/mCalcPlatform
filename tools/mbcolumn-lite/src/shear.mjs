// EN 1992-1-1:2023 §8.2.3, following the mCalcCanvas RC Rectangular Column Check.
// Explicit units are mm, MPa and kN. The flexural solver retains its existing code basis.
const gammaC = 1.5;
const gammaS = 1.15;
const ktc = 0.85;
const nu = 0.5;
const concretePeak = 0.002;
const concreteUltimate = 0.0035;
const steelUltimate = 0.045;

export const shearDefaults = { enabled: true, mode: 'auto', spacing: 150, fyk: 500, classA: false, legsX: 2, legsY: 2 };
export const shearBasis = 'EN 1992-1-1:2023 §8.2.3 · Directional links and concrete strut checks';
export const shearScope = 'Automatic layout checks 150 mm bar restraint. Manual layout uses the entered effective legs. Verify link anchorage, spacing, minimum reinforcement, confinement and combined actions separately.';

function compressionDepth(section, projectedBars, depth, width, effectiveDepth, fcd, axial) {
  const steelDesign = section.fy / gammaS;
  const transition = concreteUltimate * effectiveDepth / (concreteUltimate + steelUltimate);
  const concreteStress = strain => {
    const ratio = Math.min(1, Math.max(0, strain / concretePeak));
    return fcd * ratio * (2 - ratio);
  };

  function axialResistance(x) {
    const slope = x < transition ? steelUltimate / (effectiveDepth - x)
      : x <= depth ? concreteUltimate / x
        : concretePeak / (x - (1 - concretePeak / concreteUltimate) * depth);
    const compressionHeight = Math.min(depth, Math.max(0, x));
    const strip = compressionHeight / 128;
    let concreteForce = 0;
    for (let i = 0; i < 128; i++) {
      concreteForce += concreteStress(slope * (x - (i + 0.5) * strip)) * width * strip;
    }
    return concreteForce + projectedBars.reduce((sum, bar) => {
      const strain = slope * (x - bar.distance);
      const steel = Math.max(-steelDesign, Math.min(steelDesign, section.es * strain));
      return sum + bar.area * (steel - concreteStress(strain));
    }, 0);
  }

  let low = -depth / 10;
  let high = 100 * depth;
  const target = axial * 1000;
  if (target < axialResistance(low) || target > axialResistance(high)) return null;
  for (let i = 0; i < 38; i++) {
    const mid = (low + high) / 2;
    if (axialResistance(mid) < target) low = mid;
    else high = mid;
  }
  return Math.max(0, (low + high) / 2);
}

function checkFace(section, links, load, axis, face, fcd) {
  const depth = axis === 'x' ? section.b : section.h;
  const width = axis === 'x' ? section.h : section.b;
  const legs = axis === 'x' ? links.legsX : links.legsY;
  const shear = Math.abs(axis === 'x' ? load.vx ?? 0 : load.vy ?? 0);
  const bars = section.bars.map(bar => ({ distance: depth / 2 - face * bar[axis], area: bar.area }));
  const d = Math.max(...bars.map(bar => bar.distance));
  const x = compressionDepth(section, bars, depth, width, d, fcd, load.p);
  if (x === null) return { axis, shear, error: 'Axial force outside the directional section capacity.' };

  const z = 0.9 * d;
  const tau = shear * 1000 / (width * z);
  const cap = nu * fcd;
  const axialStress = load.p * 1000 / (width * depth);
  const kA = links.classA ? 0.8 : 1;
  const upperCot = load.p < 0 ? Math.max(1, kA * (2.5 - 0.1 * Math.abs(load.p) / shear))
    : kA * (x >= 0.25 * d ? 2.5 : 2.5 + 0.5 * Math.min(1, axialStress / 3));
  const halfLimit = tau === 0 ? Infinity : cap / (2 * tau);
  const cot = tau * (upperCot + 1 / upperCot) <= cap ? upperCot
    : halfLimit < 1 ? 1 : halfLimit + Math.sqrt(halfLimit ** 2 - 1);
  const asw = legs * Math.PI * section.link ** 2 / 4;
  const linksCapacity = asw / links.spacing * (links.fyk / gammaS) * cot * z / 1000;
  const strutCapacity = cap / (cot + 1 / cot) * width * z / 1000;
  const capacity = Math.min(linksCapacity, strutCapacity);
  return {
    axis, shear, d, x, cot, upperCot, asw, tau, fcd, linksCapacity, strutCapacity, ratio: shear / capacity,
    requiredAswPerM: shear * 1e6 / ((links.fyk / gammaS) * cot * z),
    governs: linksCapacity <= strutCapacity ? 'Links' : 'Concrete strut',
  };
}

export function checkColumnShear(section, links, loads) {
  if (!links.enabled) return [];
  if (links.layoutError) throw new Error(links.layoutError);
  if (![section.b, section.h, section.link, section.fc, section.fy, section.es, links.spacing, links.fyk]
    .every(value => Number.isFinite(value) && value > 0)
    || ![links.legsX, links.legsY].every(value => Number.isInteger(value) && value >= 2)
    || !section.bars.length || section.bars.some(bar => !Number.isFinite(bar.area) || bar.area <= 0
      || !Number.isFinite(bar.x) || !Number.isFinite(bar.y)
      || Math.abs(bar.x) >= section.b / 2 || Math.abs(bar.y) >= section.h / 2)) {
    throw new Error('Enter a valid link diameter, spacing, steel strength and at least two effective legs in each direction.');
  }
  const fcd = Math.min((40 / section.fc) ** (1 / 3), 1) * ktc * section.fc / gammaC;
  return loads.flatMap(load => ['x', 'y'].map(axis => {
    const a = checkFace(section, links, load, axis, 1, fcd);
    const b = checkFace(section, links, load, axis, -1, fcd);
    const governing = a.error || (!b.error && a.ratio >= b.ratio) ? a : b;
    return { ...governing, name: load.name };
  }));
}
