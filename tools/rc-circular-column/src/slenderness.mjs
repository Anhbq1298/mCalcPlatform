import { unverified } from './detailing.mjs';

// EN 1992-1-1:2004 §§5.2, 5.8.3.1 and 5.8.8, recommended values for isolated members.
export function memberMoments(input, section) {
  const label = 'Slenderness';
  const entered = { mx: input.mx, my: input.my };
  if (input.axial <= 0) return { ...entered, row: { label, status: 'pass', hideRatio: true,
    detail: 'No net axial compression for this load case.' } };
  const unavailable = detail => ({ ...entered, row: { ...unverified(label, detail), hideRatio: true } });
  if (input.secondOrderIncluded) return unavailable('Using externally assessed design moments as entered.');
  if (input.effectiveLengthX === null || input.effectiveLengthY === null) {
    return unavailable('Enter effective lengths X and Y. PMM currently uses the entered moments.');
  }
  if (section.collision) return unavailable('Resolve reinforcement collisions to calculate second-order effects.');

  const grossArea = Math.PI * section.concreteRadius ** 2;
  const fcd = input.concrete / 1.5; // 2004 recommended alpha_cc = 1.0 for the member check.
  const fyd = input.steel / 1.15;
  const steelArea = section.bars.reduce((sum, bar) => sum + bar.area, 0);
  const axial = input.axial * 1000;
  const n = axial / (grossArea * fcd);
  const limit = 20 * 0.7 * 1.1 * 0.7 / Math.sqrt(n);
  const lengths = [input.effectiveLengthX, input.effectiveLengthY];
  const ratios = lengths.map(length => 4 * length / input.diameter);
  const slender = ratios.map(ratio => ratio >= limit);
  const comparison = 'λx / λy ' + ratios.map(ratio => ratio.toFixed(1)).join(' / ') + ' · λlim ' + limit.toFixed(1);
  if (slender.some(Boolean) && section.rings.some(ring => ring.count % 2 !== 0)) {
    return unavailable(comparison + '. Use externally assessed second-order moments for a non-centrosymmetric cage.');
  }
  const nu = 1 + steelArea * fyd / (grossArea * fcd);
  if (slender.some(Boolean) && n >= nu) {
    return unavailable(comparison + '. Axial action is outside the nominal-curvature range.');
  }

  const kr = Math.min(1, (nu - n) / (nu - 0.4));
  const minimumEccentricity = Math.max(input.diameter / 30, 20);
  const axes = ['x', 'y'].map((key, index) => {
    const length = lengths[index];
    const moment = entered['m' + key];
    let secondOrder = 0;
    if (slender[index]) {
      const gyration = Math.sqrt(section.bars.reduce((sum, bar) => sum + bar.area * bar[key] ** 2, 0) / steelArea);
      const depth = section.concreteRadius + gyration;
      const beta = 0.35 + input.concrete / 200 - ratios[index] / 150;
      const creep = Math.max(1, 1 + beta * input.creepRatio);
      const curvature = kr * creep * (fyd / 200000) / (0.45 * depth);
      secondOrder = axial * curvature * length ** 2 / 8 / 1e6; // Constant-curvature factor.
    }
    const design = Math.max(Math.abs(moment) + axial * length / 400 / 1e6 + secondOrder,
      axial * minimumEccentricity / 1e6);
    return { secondOrder, design: (moment < 0 ? -1 : 1) * design };
  });
  const pair = values => values.map(value => value.toFixed(1)).join(' / ');
  return {
    mx: axes[0].design, my: axes[1].design,
    row: { label, status: 'pass', hideRatio: true, statusLabel: slender.some(Boolean) ? 'Second order applied' : 'Non-slender',
      detail: comparison + ' · M2,x / M2,y ' + pair(axes.map(axis => axis.secondOrder)) + ' kNm'
        + ' · MEd,x / MEd,y ' + pair(axes.map(axis => axis.design)) + ' kNm' },
  };
}
