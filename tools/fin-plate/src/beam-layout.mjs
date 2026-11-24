export const beamLayouts = { fit: 'Fit between supporting flanges', outside: 'Outside supporting flange · extended plate' };

export const beamAlignmentOptions = { top: 'Align tops', mid: 'Align mid-depths', bottom: 'Align bottoms', custom: 'Custom top offset' };
const referenceFractions = { top: 0, mid: 0.5, bottom: 1 };

export function beamToBeamLayout(input, beam) {
  if (input.support !== 'beam-web') return null;
  const profile = input.supportingProfile;
  if (!profile) {
    if (input.supportSection != null) throw new RangeError('Choose a supporting beam section.');
    return null;
  }
  const { h, b, tw, tf, r } = profile;
  const layout = input.beamLayout ?? 'fit';
  const alignment = input.supportAlignment ?? 'custom';
  const referenceFraction = referenceFractions[alignment];
  const offset = alignment === 'custom' ? input.supportLevel ?? 0 : (h - beam.h) * referenceFraction;
  if (![h, b, tw, tf].every(v => Number.isFinite(v) && v > 0 && v <= 10000)
    || !Number.isFinite(r) || r < 0 || h <= 2 * (tf + r) || b <= tw + 2 * r
    || !Number.isFinite(offset) || Math.abs(offset) > 10000 || !Object.hasOwn(beamLayouts, layout)
    || !Object.hasOwn(beamAlignmentOptions, alignment)) {
    throw new RangeError('Check the supporting beam dimensions, level offset and layout.');
  }
  const angle = input.skew * Math.PI / 180;
  const c = Math.cos(angle);
  const s = Math.abs(Math.sin(angle));
  const projection = (b - tw) / 2;
  const setback = layout === 'outside' ? (projection + beam.b * s / 2) / c : 0;
  return { profile, layout, alignment, referenceFraction, offset, projection, setback, gap: input.gap + setback, c, s };
}

function intersections(geometry, beam, centre, notch) {
  const { profile, offset, projection, gap, c, s } = geometry;
  const low = centre - beam.h / 2;
  const high = centre + beam.h / 2;
  const supportTop = high + offset;
  const supportBottom = supportTop - profile.h;
  const overlap = (a, b, x, y) => Math.min(b, y) - Math.max(a, x) > 1e-8;
  const zones = [
    [low + (notch?.bottom || beam.tf), high - (notch?.top || beam.tf), beam.tw, gap],
    [low, low + beam.tf, beam.b, notch?.bottom ? notch.shoulder : gap],
    [high - beam.tf, high, beam.b, notch?.top ? notch.shoulder : gap],
  ];
  // The full-depth web resumes at the cope shoulder.
  if (notch?.bottom) zones.push([low + beam.tf, notch.lower, beam.tw, notch.shoulder]);
  if (notch?.top) zones.push([notch.upper, high - beam.tf, beam.tw, notch.shoulder]);
  const clashes = (z0, z1, reach) => zones.some(([a, b, width, x]) =>
    overlap(a, b, z0, z1) && x * c - width * s / 2 < reach - 1e-8);
  return {
    top: clashes(supportTop - profile.tf, supportTop, projection),
    bottom: clashes(supportBottom, supportBottom + profile.tf, projection),
    web: clashes(supportBottom + profile.tf, supportTop - profile.tf, 0),
    supportTop, supportBottom, low, high,
  };
}

const notchClearance = 10;
const defaultNotchDepth = 50;

export function automaticNotch(geometry, beam, centre) {
  const { top, bottom, supportTop, supportBottom, low, high } = intersections(geometry, beam, centre);
  const { profile, projection, gap, c, s } = geometry;
  const limits = [];
  if (top) limits.push([supportTop - profile.tf, supportTop]);
  if (bottom) limits.push([supportBottom, supportBottom + profile.tf]);
  const dimensions = { notchTop: 0, notchBottom: 0, notchLength: 0 };
  const minimum = beam.tf + beam.r;
  const startingDepth = Math.max(defaultNotchDepth, minimum);
  for (const [underside, upperFace] of limits) {
    const topDepth = high - underside + notchClearance;
    const bottomDepth = upperFace - low + notchClearance;
    if (topDepth <= bottomDepth) dimensions.notchTop = Math.max(dimensions.notchTop, startingDepth, topDepth);
    else dimensions.notchBottom = Math.max(dimensions.notchBottom, startingDepth, bottomDepth);
  }
  if (limits.length) dimensions.notchLength = Math.max(0, (projection + notchClearance + beam.b * s / 2) / c - gap);
  const remaining = beam.h - dimensions.notchTop - dimensions.notchBottom;
  const single = Boolean(dimensions.notchTop) !== Boolean(dimensions.notchBottom);
  if (remaining <= (single ? minimum : 0) || (limits.length && dimensions.notchLength <= 0)) return null;
  return dimensions;
}

export function checkBeamFit(geometry, beam, centre, plateHeight, notch) {
  if (!geometry) return [];
  const { profile } = geometry;
  const { top, bottom, web, supportTop, supportBottom } = intersections(geometry, beam, centre, notch);
  const details = [];
  if (top) details.push('The supported beam intersects the supporting top flange. Adjust the notch, level or layout.');
  if (bottom) details.push('The supported beam intersects the supporting bottom flange. Adjust the notch, level or layout.');
  if (web) details.push('The supported beam intersects the supporting web at the beam end.');
  const clearBottom = supportBottom + profile.tf + profile.r;
  const clearTop = supportTop - profile.tf - profile.r;
  if (clearBottom > 1e-8 || plateHeight > clearTop + 1e-8) details.push('The fin plate weld line extends outside the clear supporting web between the root fillets.');
  return details;
}
