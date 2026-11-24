export const beamLayouts = { fit: 'Fit between supporting flanges', outside: 'Outside supporting flange · extended plate' };

export function beamToBeamLayout(input, beam) {
  if (input.support !== 'beam-web') return null;
  const profile = input.supportingProfile;
  if (!profile) {
    if (input.supportSection != null) throw new RangeError('Choose a supporting beam section.');
    return null;
  }
  const { h, b, tw, tf, r } = profile;
  const layout = input.beamLayout ?? 'fit';
  const offset = input.supportLevel ?? 0;
  if (![h, b, tw, tf].every(v => Number.isFinite(v) && v > 0 && v <= 10000)
    || !Number.isFinite(r) || r < 0 || h <= 2 * (tf + r) || b <= tw + 2 * r
    || !Number.isFinite(offset) || Math.abs(offset) > 10000 || !Object.hasOwn(beamLayouts, layout)) {
    throw new RangeError('Check the supporting beam dimensions, level offset and layout.');
  }
  const angle = input.skew * Math.PI / 180;
  const c = Math.cos(angle);
  const s = Math.abs(Math.sin(angle));
  const projection = (b - tw) / 2;
  const setback = layout === 'outside' ? (projection + beam.b * s / 2) / c : 0;
  return { profile, layout, offset, projection, setback, gap: input.gap + setback, c, s };
}

export function checkBeamFit(geometry, beam, centre, plateHeight, notch) {
  if (!geometry) return [];
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
  const details = [];
  if (clashes(supportTop - profile.tf, supportTop, projection)) details.push('The supported beam intersects the supporting top flange. Adjust the notch, level or layout.');
  if (clashes(supportBottom, supportBottom + profile.tf, projection)) details.push('The supported beam intersects the supporting bottom flange. Adjust the notch, level or layout.');
  if (clashes(supportBottom + profile.tf, supportTop - profile.tf, 0)) details.push('The supported beam intersects the supporting web at the beam end.');
  const clearBottom = supportBottom + profile.tf + profile.r;
  const clearTop = supportTop - profile.tf - profile.r;
  if (clearBottom > 1e-8 || plateHeight > clearTop + 1e-8) details.push('The fin plate weld line extends outside the clear supporting web between the root fillets.');
  return details;
}
