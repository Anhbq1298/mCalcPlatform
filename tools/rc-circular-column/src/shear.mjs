import { unverified } from './detailing.mjs';

function closedLinks({ rings }) {
  const hoop = rings[0];
  return unverified('Shear Design', 'Closed links: verify the effective hoop contribution, strut geometry and anchorage ' +
    'using an accepted circular-section model. Outer hoop Ø' + hoop.link + ' @ ' + hoop.spacing + ' mm.');
}

function continuousHelix({ rings }) {
  const angles = rings.map(ring => (ring.helixAngle * 180 / Math.PI).toFixed(2) + '°');
  return unverified('Shear Design', 'Helix: inclination to transverse plane ' + angles.join(' / ') +
    '. A verified helical shear-resistance and termination model is unavailable.');
}

export function shearCheck(input, section) {
  return input.transverse === 'links' ? closedLinks(section) : continuousHelix(section);
}
