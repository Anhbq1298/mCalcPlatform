import { cageGeometry, minimumClear } from './reinforcement.mjs';

export function detailingChecks(input) {
  const cages = cageGeometry(input), checks = [];
  const add = (id, status, message, value = null, limit = null) => checks.push({ id, status, message, value, limit });
  const compare = (id, value, limit, message) => add(id, value + 1e-7 >= limit ? 'pass' : 'fail', message, value, limit);
  const bars = cages.flatMap(cage => cage.bars);
  for (const [i, cage] of cages.entries()) {
    const name = cage.id;
    compare(name + '-fit', cage.barRadius - cage.bar / 2, 0, name + ': longitudinal layer fits inside the section.');
    const circumferential = 2 * cage.barRadius * Math.sin(Math.PI / cage.count) - cage.bar;
    compare(name + '-circumferential', circumferential, minimumClear(input, cage.bar),
      name + ': circumferential clear spacing (chord, not arc), §8.2(2).');
    if (i) compare(name + '-radial', cage.radialClear, minimumClear(input, cage.bar, cages[i - 1].bar),
      name + ': radial longitudinal clear spacing, §8.2(2).');
    if (!cage.link) { add(name + '-restraint', 'fail', name + ': no associated closed link; lateral restraint is unverified.'); continue; }
    const { diameter, spacing } = cage.link;
    compare(name + '-cover', input.diameter / 2 - cage.linkRadius - diameter / 2, input.cover,
      name + ': geometric cover to outside of link (specified nominal cover).');
    compare(name + '-link-fit', cage.linkRadius - diameter / 2, 0, name + ': link fits inside the section.');
    compare(name + '-link-diameter', diameter, Math.max(6, Math.max(...cages.map(c => c.bar)) / 4),
      name + ': link diameter, §9.5.3(1).');
    const maxSpacing = Math.min(20 * Math.min(...cages.map(c => c.bar)), input.diameter, input.maxLinkSpacing)
      * (input.reducedZone ? 0.6 : 1);
    add(name + '-link-spacing', spacing <= maxSpacing ? 'pass' : 'fail',
      name + ': vertical spacing ≤ ' + maxSpacing.toFixed(1) + ' mm, §9.5.3(3)–(4).', spacing, maxSpacing);
    compare(name + '-vertical-clear', spacing - diameter, input.aggregate + input.k2,
      name + ': concrete passage between successive links; aggregate-based constructability screen.');
    const tangent = Math.abs(cage.linkRadius - diameter / 2 - cage.barRadius - cage.bar / 2);
    add(name + '-tangency', tangent < 1e-7 ? 'pass' : 'fail', name + ': link lies outside and tangent to its longitudinal layer.', tangent, 0);
    // A continuous circular link occupies an annulus at every angle, even where bars are staggered.
    for (const other of cages.filter(c => c.id !== name)) {
      const gap = Math.abs(other.barRadius - cage.linkRadius) - other.bar / 2 - diameter / 2;
      compare(name + '-' + other.id + '-clash', gap, 0, name + ' link / ' + other.id + ': physical clearance.');
      if (other.barRadius > cage.linkRadius) compare(name + '-' + other.id + '-passage', gap,
        minimumClear(input, other.bar, cage.bar), name + ' link intrudes into the longitudinal clearance to ' + other.id
        + '; remaining concrete passage. Constructability screen, not a separate §8.2 bar-to-link rule.');
    }
    for (const other of cages.slice(i + 1).filter(c => c.link)) {
      compare(name + '-' + other.id + '-link-clash', Math.abs(cage.linkRadius - other.linkRadius)
        - (diameter + other.link.diameter) / 2, 0, name + ' / ' + other.id + ': link annuli do not clash at common elevations.');
    }
  }
  let nearest = Infinity, margin = Infinity;
  for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) {
    const a = bars[i], b = bars[j];
    const gap = Math.hypot(a.x - b.x, a.y - b.y) - (a.diameter + b.diameter) / 2;
    nearest = Math.min(nearest, gap);
    margin = Math.min(margin, gap - minimumClear(input, a.diameter, b.diameter));
  }
  add('nearest-bars', margin >= -1e-7 ? 'pass' : 'fail', 'Actual nearest bar-to-bar clear spacing in 2D; every pair checked against its §8.2 minimum.', nearest);
  add('cover-basis', 'review', '§4.4.1: specified cover is checked geometrically. Durability, bond, fire and deviation allowance require the project exposure and design basis.');
  add('restraint', 'review', '§9.5.3(2),(6): tangency alone does not prove restraint. Verify link closure, anchorage, bend radii and restraint of compression bars (150 mm rule where applicable).');
  add('applicability', 'review', 'Detailing: EN 1992-1-1:2004 recommended NDPs unless entered otherwise. PMM/shear: existing EN 1992-1-1:2023 worksheet. Project National Annex and mixed-edition applicability are unverified.');
  add('pmm-scope', 'review', 'P–M curve uses the applied bending direction and the existing first-order strain-pivot model. Check slenderness, second-order effects and full biaxial equilibrium separately.');
  add('shear-model', 'review', 'Closed circular link shear is a conditional equivalent two-leg worksheet estimate per layer. Verify effective legs, anchorage and common shear mechanism before using the resistance.');
  add('zones', 'review', 'Verify end/lap zones, at least three links in lap lengths where required, bar direction changes, seismic and pile-specific provisions.');
  if (input.migrationReview) add('migration', 'review', input.migrationReview);
  return { cages, checks, nearest, status: checks.some(c => c.status === 'fail') ? 'fail' : 'review' };
}
