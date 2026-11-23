import { minimumClearance } from './geometry.mjs';

const mm = value => value.toFixed(1) + ' mm';
const pass = (label, detail, condition) => ({ label, detail, status: condition ? 'pass' : 'fail' });
const atLeast = (actual, limit) => actual >= limit - 1e-7;
export const unverified = (label, detail) => ({ label, detail, status: 'incomplete', statusLabel: 'Not Verified' });
const warning = (label, detail) => ({ label, detail, status: 'warning' });

export function detailing(input, { rings }) {
  const closed = input.transverse === 'links';
  const maximumSpacing = Math.min(20 * Math.min(...rings.map(ring => ring.bar)), input.diameter, 400);
  const minimumDiameter = Math.max(6, Math.max(...rings.map(ring => ring.bar)) / 4);
  const endSpacing = 0.6 * maximumSpacing;
  const rows = [
    pass('Nominal cover', mm(rings[0].cover) + ' provided / ' + mm(input.cover) + ' specified',
      atLeast(rings[0].cover, input.cover)),
    unverified('Cover specification', 'Verify exposure, bond, fire and National Annex requirements for the specified cover.'),
  ];
  for (const [index, ring] of rings.entries()) {
    const mark = 'L' + (index + 1);
    const min = minimumClearance(ring.bar, ring.bar, input.aggregate);
    rows.push(
      pass(mark + ' bar clearance', mm(ring.clear) + ' / min ' + mm(min), atLeast(ring.clear, min)),
      pass(mark + ' transverse diameter', mm(ring.link) + ' / min ' + mm(minimumDiameter), ring.link >= minimumDiameter),
      pass(mark + (closed ? ' link spacing' : ' helix pitch'), mm(ring.spacing) +
        ' / regular-zone max ' + mm(maximumSpacing), ring.turnClear >= 0 && ring.spacing <= maximumSpacing),
      pass(mark + ' cage height', closed ? 'Space for at least one closed link at the specified end cover.'
        : 'Space for at least one full helix turn at the specified end cover.',
      input.height >= 2 * input.cover + ring.link + (closed ? 0 : ring.spacing)),
      pass(mark + ' interference', ring.collision ? 'Reinforcement overlaps or lies outside the section.' :
        'Associated transverse reinforcement is tangent to the bars.', !ring.collision),
    );
    if (ring.count < 4) rows.push(pass(mark + ' bar count', 'Minimum 4 longitudinal bars for a circular column.', false));
    if (index) {
      rows.push(pass('L' + index + '–' + mark + ' radial clearance',
        mm(ring.radialClear) + ' / min ' + mm(ring.required) + ' · closest bar clearance ' + mm(ring.nearestBar),
        atLeast(ring.radialClear, ring.required)));
      if (!atLeast(ring.placementGap, ring.required)) rows.push(warning(mark + ' concrete placement',
        mm(ring.placementGap) + ' between outer bars and inner transverse steel. Review concrete placement.'));
    }
    if (ring.turnClear < input.aggregate + 5) rows.push(warning(mark + ' space between turns',
      mm(ring.turnClear) + ' clear in elevation. Review concrete placement.'));
    if (ring.spacing > endSpacing) rows.push(warning(mark + ' end and lap zones',
      'Use up to ' + mm(endSpacing) + ' where the 0.6 reduction applies. Check lap length and link count.'));
  }
  const tails = rings.map(ring => mm(Math.max(10 * ring.link, 70))).join(' / ');
  const mandrels = rings.map(ring => mm((ring.link <= 16 ? 4 : 7) * ring.link)).join(' / ');
  rows.push(unverified(closed ? 'Link closure and anchorage' : 'Helix termination and anchorage', closed
    ? 'Verify shop details to §8.3 and §8.5. For 135° hooks, enclose a bar and check straight tails ≥ ' + tails +
      ' and mandrels ≥ ' + mandrels + ' by layer. Check concrete bearing.'
    : 'Specify end turns and anchorage on the shop detail. Confirm development and restraint at both ends.'));
  rows.push(unverified('Lateral restraint', 'Check compression bar restraint at closures, laps, terminations and end zones.'));
  return rows;
}
