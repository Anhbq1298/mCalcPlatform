// Numerical form of the pinned RC_Circular_Column_Check worksheet (161910b4).
// Units: mm, MPa, kN, kN m. Material model and sampling retain the 2023 worksheet basis.
import { cageGeometry } from './reinforcement.mjs';
import { validateInputs } from './inputs.mjs';
import { detailingChecks } from './detailing.mjs';

function interpolate(points, value) {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  if (value < sorted[0][0] - 1e-8 || value > sorted.at(-1)[0] + 1e-8) return null;
  for (let i = 1; i < sorted.length; i++) {
    const [x0, y0] = sorted[i - 1], [x1, y1] = sorted[i];
    if (value <= x1 && x1 > x0) return y0 + (y1 - y0) * (value - x0) / (x1 - x0);
  }
  return sorted.at(-1)[1];
}

export function solveColumn(input) {
  validateInputs(input);
  const cages = cageGeometry(input), detailing = detailingChecks(input);
  if (detailing.checks.some(c => /-fit$|-clash$/.test(c.id) && c.status === 'fail')
    || detailing.nearest < 0) throw new Error('Reinforcement overlaps or does not fit. Resolve geometry before calculating resistance.');
  const R = input.diameter / 2, D = input.diameter;
  const direction = Math.atan2(input.my, input.mx);
  const bars = cages.flatMap(cage => cage.bars.map(bar => ({
    projection: bar.x * Math.cos(direction) + bar.y * Math.sin(direction),
    area: Math.PI * bar.diameter ** 2 / 4,
  })));
  const strips = Array.from({ length: 100 }, (_, j) => {
    const p = R - (j + 0.5) * D / 100;
    return { projection: p, area: 2 * Math.sqrt(R * R - p * p) * D / 100 };
  });
  const fcd = Math.min((40 / input.concrete) ** (1 / 3), 1) * 0.85 * input.concrete / 1.5;
  const fyd = input.steel / 1.15;
  const effective = R - Math.min(...bars.map(b => b.projection));
  const transition = 0.0035 * effective / (0.0035 + 0.045);
  function strain(c, projection) {
    const slope = c < transition ? 0.045 / (effective - c)
      : c <= D ? 0.0035 / c : 0.002 / (c - (1 - 0.002 / 0.0035) * D);
    return slope * (c - R + projection);
  }
  const stress = e => e <= 0 ? 0 : e < 0.002 ? fcd * (1 - (1 - e / 0.002) ** 2) : fcd;
  function resistance(c) {
    let n = 0, m = 0;
    for (const strip of strips) {
      const force = stress(strain(c, strip.projection)) * strip.area;
      n += force; m += force * strip.projection;
    }
    for (const bar of bars) {
      const e = strain(c, bar.projection);
      const force = bar.area * (Math.max(-fyd, Math.min(fyd, 200000 * e)) - stress(e));
      n += force; m += force * bar.projection;
    }
    return [m / 1e6, n / 1000];
  }
  const depths = [...Array.from({ length: 45 }, (_, i) => (-0.1 + i * 0.025) * D),
    ...Array.from({ length: 9 }, (_, i) => D / (0.9 - i * 0.1)), 100 * D];
  const curve = depths.map(resistance);
  const moment = Math.hypot(input.mx, input.my), axial = input.axial;
  const maxN = Math.max(...curve.map(p => p[1])), maxM = Math.max(...curve.map(p => p[0]));
  const demandRadius = Math.hypot(axial / maxN, moment / maxM);
  const polar = curve.map(([m, n]) => {
    const rho = Math.hypot(n / maxN, m / maxM);
    return [n / maxN / rho, rho];
  });
  const capacity = demandRadius ? interpolate(polar, axial / maxN / demandRadius) : 1;
  const combined = capacity > 0 ? demandRadius / capacity : null;
  const area = bars.reduce((sum, b) => sum + b.area, 0);
  const d = R + 2 / Math.PI * cages.reduce((sum, c) => sum + c.count * Math.PI * c.bar ** 2 / 4 * c.barRadius, 0) / area;
  const z = 0.9 * d;
  const x = interpolate(curve.map(([, n], i) => [n, depths[i]]), axial);
  let width = null, cot = null, linkStress = null, strutStress = null, shear = input.shear === 0 ? 0 : null;
  if (input.shear > 0 && x !== null) {
    const compression = strips.map(s => ({ ...s, force: stress(strain(x, s.projection)) * s.area }));
    const force = compression.reduce((sum, s) => sum + s.force, 0);
    const ycc = x <= 0 ? 0 : R - compression.reduce((sum, s) => sum + s.force * s.projection, 0) / force;
    const tensionChord = 2 * Math.sqrt(R * R - (d - R) ** 2);
    width = x <= 0 ? tensionChord : Math.min(2 * Math.sqrt(Math.max(0, R * R - (R - ycc) ** 2)), tensionChord);
    const tau = input.shear * 1000 / (width * z), cap = 0.5 * fcd, kA = input.classA ? 0.8 : 1;
    const sigma = axial * 1000 / (Math.PI * R * R);
    const cotMin = axial < 0 ? Math.max(1, kA * (2.5 - 0.1 * Math.abs(axial) / input.shear))
      : kA * (x >= 0.25 * d ? 2.5 : sigma >= 3 ? 3 : 2.5 + 0.5 * sigma / 3);
    const half = cap / (2 * tau);
    cot = tau * (cotMin + 1 / cotMin) <= cap ? cotMin : half >= 1 ? half + Math.sqrt(half ** 2 - 1) : 1;
    // Conditional two-leg equivalent; detailing explicitly prevents an overall compliant verdict.
    const rho = 2 / width * input.transverse.reduce((sum, link) => sum + Math.PI * link.diameter ** 2 / 4 / link.spacing, 0);
    linkStress = rho * input.linkSteel / 1.15 * cot;
    strutStress = tau * (cot + 1 / cot);
    shear = linkStress > 0 ? Math.max(tau / linkStress, strutStress / cap) : null;
  }
  const result = { combined, shear, width, cot, linkStress, strutStress, demand: [moment, axial], curve,
    detailing: detailing.checks, geometry: cages, status: detailing.status };
  if ([combined, shear, width, cot, linkStress, strutStress].some(v => v !== null && !Number.isFinite(v))) {
    throw new Error('The worksheet model is outside its calculation range.');
  }
  return result;
}
