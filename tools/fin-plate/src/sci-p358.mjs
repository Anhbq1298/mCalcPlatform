import { gammaBolt } from './bolt-group.mjs';

export const sciSource = 'https://steelconstruction.info/upload/Wiki-Files/a/a9/SCI_P358.pdf';

export function bearingTerms(bolt, thickness, fu, parallelEdge, parallelPitch, crossEdge, crossPitch) {
  const d0 = bolt.hole;
  const alpha = Math.min(1, bolt.fub / fu, parallelEdge / (3 * d0), parallelPitch / (3 * d0) - 0.25);
  const k = Math.min(2.5, 2.8 * crossEdge / d0 - 1.7, 1.4 * crossPitch / d0 - 1.7);
  const resistance = Math.max(0, k) * Math.max(0, alpha) * fu * bolt.diameter * thickness / gammaBolt / 1000;
  return { alpha, k, resistance, parallelEdge, parallelPitch, crossEdge, crossPitch };
}

export function directionalBearing(...args) {
  return bearingTerms(...args).resistance;
}

// SCI P358 §5.5 Check 2 (pp. 115–117). The maxima give the elastic corner
// components for the prescribed symmetric rectangular group under vertical shear.
export function sciBoltChecks({ group, bolt, shearResistance, z, pitch, gauge, plateEnd, plateEdge,
  beamVerticalEnd, beamEnd, plateThickness, beamThickness, plateFu, beamFu }) {
  const n = group.bolts.length;
  const maxX = Math.max(...group.bolts.map(p => Math.abs(p.dx)));
  const maxY = Math.max(...group.bolts.map(p => Math.abs(p.dy)));
  const horizontal = z * maxY / group.polar;
  const vertical = 1 / n + z * maxX / group.polar;
  const component = (thickness, fu, end, edge) => {
    const fy = directionalBearing(bolt, thickness, fu, end, pitch, edge, gauge);
    const fx = directionalBearing(bolt, thickness, fu, edge, gauge, end, pitch);
    return { fx, fy, resistance: 1 / Math.hypot(horizontal / fx, vertical / fy) };
  };
  return {
    horizontal, vertical,
    bolt: shearResistance / Math.hypot(horizontal, vertical),
    plate: component(plateThickness, plateFu, plateEnd, plateEdge),
    web: component(beamThickness, beamFu, beamVerticalEnd, beamEnd),
  };
}

// SCI P358 §5.5 Check 3 (pp. 118–119), rectangular one- and two-column plates.
export function sciPlateChecks({ height, thickness, rows, columns, gauge, edge, end, d0, fy, fu, z }) {
  const shearArea = thickness * (height - rows * d0);
  const netTension = thickness * (edge + (columns - 1) * gauge - (columns - 0.5) * d0);
  const netShear = thickness * (height - end - (rows - 0.5) * d0);
  return {
    gross: height * thickness * fy / (1.27 * Math.sqrt(3)) / 1000,
    net: shearArea * fu / (1.1 * Math.sqrt(3)) / 1000,
    block: (0.5 * fu * netTension / 1.1 + fy * netShear / Math.sqrt(3)) / 1000,
    bending: height >= 2.73 * z ? null : thickness * height ** 2 * fy / (6 * z) / 1000,
    netTension,
    netShear,
  };
}

// P358 Check 3. The first bolt line classifies the plate. The bolt group
// centroid determines the bending moment. Table 5.2 uses EC3 Eq. 6.56.
export function sciPlateStability({ height, thickness, fy, z, firstBolt, restrained }) {
  const elasticLimit = thickness * height ** 2 * fy / (6 * z) / 1000;
  if (firstBolt <= thickness / 0.15) return { type: 'short', resistance: elasticLimit };
  if (!restrained || fy !== 275) return { type: 'long', resistance: null };
  const slenderness = 2.8 / 86.8 * Math.sqrt(firstBolt * height / (1.5 * thickness ** 2));
  const phi = 0.5 * (1 + 0.76 * (slenderness - 0.2) + slenderness ** 2);
  const reduction = Math.min(1, 1 / (phi + Math.sqrt(Math.max(0, phi ** 2 - slenderness ** 2))));
  return { type: 'long', slenderness, reduction, resistance: Math.min(elasticLimit, elasticLimit * reduction / 0.6) };
}

// SCI P358 §5.5 Check 8 and Appendix C.3. Symmetric, full-length double fillets.
export function sciWeldThickness(grade, thickness, leg) {
  if (grade !== 275 && grade !== 355) return null;
  const throat = Math.SQRT1_2 * leg;
  const minimum = thickness * (grade === 275 ? 0.5 : 0.6);
  return { throat, minimum, ratio: minimum / throat };
}

// SCI P358 §5.5 Check 10, one supported beam and a single fin plate.
export function sciSupportChecks({ height, thickness, supportThickness, plateFy, supportFy, supportFu }) {
  const localShear = 2 * height * supportThickness * supportFy / Math.sqrt(3) / 1000;
  const punchLimit = supportThickness * supportFu / (plateFy * gammaBolt);
  return { localShear, punchLimit, punching: thickness / punchLimit };
}
