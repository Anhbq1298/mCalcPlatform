// Small plan icons for the worked-case cards: slab (light), free edges (heavy), column (black),
// drop (blue hidden line) and shear links (red).
import { COLORS } from './svg.mjs';

export function cardIcon(card) {
  const w = 56;
  const h = 40;
  const edge = card.position === 'edge';
  const corner = card.position === 'corner';
  const col = edge ? [40, 16] : corner ? [40, 6] : [24, 16];
  const parts = [`<rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="#fff" stroke="${COLORS.edge}"/>`];
  if (edge || corner) parts.push(`<line x1="${w - 6}" y1="${corner ? 1 : 1}" x2="${w - 6}" y2="${h - 1}" stroke="${COLORS.ink}" stroke-width="2"/>`);
  if (corner) parts.push(`<line x1="1" y1="1" x2="${w - 6}" y2="1" stroke="${COLORS.ink}" stroke-width="2"/>`);
  const [x, y] = col;
  if (card.drop) {
    const x0 = x - 12;
    const x1 = edge || corner ? w - 6 : x + 20;
    const y0 = corner ? 1 : y - 12;
    parts.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y + 20 - y0}" fill="none" stroke="${COLORS.drop}" stroke-dasharray="3 2"/>`);
  }
  const dots = [[-7, -7], [0, -8], [7, -7], [-8, 4], [8, 4], [-7, 15], [0, 16], [7, 15]]
    .filter(([dx, dy]) => (!(edge || corner) || x + 4 + dx < w - 7) && (!corner || y + 4 + dy > 2));
  parts.push(...dots.map(([dx, dy]) => `<circle cx="${x + 4 + dx}" cy="${y + 4 + dy}" r="1.4" fill="${COLORS.link}"/>`));
  parts.push(`<rect x="${x}" y="${y}" width="8" height="8" fill="${COLORS.ink}"/>`);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${parts.join('')}</svg>`;
}
