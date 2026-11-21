import { cageGeometry } from './reinforcement.mjs';
export const escape = value => String(value).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function sectionSvg(input) {
  const R = input.diameter / 2, pad = input.diameter * 0.14;
  const cages = cageGeometry(input), fine = input.diameter / 800, font = input.diameter / 28;
  const colors = ['#1d4e89', '#087e72', '#9b4922', '#734398'];
  const paths = [
    `<circle r="${R}" fill="#fafbf9" stroke="#293744" stroke-width="${fine * 2}"/>`,
    `<path d="M${-R - pad / 3} 0H${R + pad / 3}M0 ${-R - pad / 3}V${R + pad / 3}" stroke="#a8b2ba" stroke-dasharray="${fine * 8} ${fine * 3}" stroke-width="${fine / 2}"/>`,
  ];
  cages.forEach((cage, i) => {
    if (cage.barRadius <= 0) return;
    const color = colors[i % colors.length];
    if (cage.link) paths.push(`<circle data-link="${escape(cage.id)}" r="${cage.linkRadius}" fill="none" stroke="${color}" stroke-width="${cage.link.diameter}"/>`);
    paths.push(...cage.bars.map(bar => `<circle data-layer="${escape(cage.id)}" cx="${bar.x}" cy="${-bar.y}" r="${bar.diameter / 2}" fill="${color}"/>`));
  });
  const y = R + pad * 0.55;
  paths.push(`<g fill="none" stroke="#293744" stroke-width="${fine}"><path d="M${-R} ${R * 0.5}V${y + font / 2}M${R} ${R * 0.5}V${y + font / 2}M${-R} ${y}H${R}"/><path d="M${-R - font / 4} ${y + font / 4}l${font / 2} ${-font / 2}M${R - font / 4} ${y + font / 4}l${font / 2} ${-font / 2}"/></g>`);
  paths.push(`<text x="0" y="${y - font / 4}" text-anchor="middle" fill="#293744" font-size="${font}" font-family="Arial">Ø${input.diameter} mm · SECTION</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R - pad} ${-R - pad} ${2 * (R + pad)} ${2 * (R + pad)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="To-scale circular closed link section; dimensions in millimetres">${paths.join('')}</svg>`;
}
