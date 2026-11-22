// Loading plan and sign convention: column in plan with global axes, the eccentricities defined by
// the inputs (e_x = M_y/V_Ed, e_y = M_x/V_Ed) and the resultant of every combination as a gold
// marker (the governing one filled), next to a table of the actions.
import { toGlobal } from './geometry.mjs';
import { COLORS, esc, n, svgDocument } from './svg.mjs';

const GOLD = '#b8860b';

export function signSvg(result, { width = 640, height = 260 } = {}) {
  const input = result.input;
  const column = input.column;
  const loads = (result.loads?.length ? result.loads : input.loads).filter(load => load.V > 0);
  const governing = result.governing?.load;
  const plotW = 250;
  const cx = 20 + plotW / 2;
  const cy = height / 2 + 6;
  const half = column.shape === 'circular' ? column.diameter / 2 : Math.max(column.cx, column.cy) / 2;
  const ecc = loads.map(load => ({ name: load.name, V: load.V, Mx: load.Mx, My: load.My, ex: (load.My / load.V) * 1000, ey: (load.Mx / load.V) * 1000 }));
  const reach = Math.max(half * 1.6, ...ecc.map(e => Math.hypot(e.ex, e.ey) * 1.25), 1);
  const s = (Math.min(plotW, height - 60) / 2) / reach;
  const X = x => cx + (x - column.x) * s;
  const Y = y => cy - (y - column.y) * s;
  const parts = [];
  // Axes.
  const L = reach * s;
  parts.push(`<defs><marker id="sg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${COLORS.ink}"/></marker></defs>`
    + `<line x1="${n(cx - L)}" y1="${n(cy)}" x2="${n(cx + L)}" y2="${n(cy)}" stroke="${COLORS.muted}" stroke-width=".6" stroke-dasharray="18 4 3 4"/>`
    + `<line x1="${n(cx)}" y1="${n(cy + L)}" x2="${n(cx)}" y2="${n(cy - L)}" stroke="${COLORS.muted}" stroke-width=".6" stroke-dasharray="18 4 3 4"/>`);
  // Column outline.
  if (column.shape === 'circular') parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n((column.diameter / 2) * s)}" fill="#eceeef" stroke="${COLORS.ink}" stroke-width="1.4"/>`);
  else {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => toGlobal(column, { x: (a * column.cx) / 2, y: (b * column.cy) / 2 }));
    parts.push(`<path d="M${corners.map(p => `${n(X(p.x))} ${n(Y(p.y))}`).join('L')}Z" fill="#eceeef" stroke="${COLORS.ink}" stroke-width="1.4"/>`);
  }
  // Positive eccentricity directions.
  const arrow = (x1, y1, x2, y2, text, dx, dy, anchor = 'start') => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${COLORS.ink}" stroke-width="1.3" marker-end="url(#sg-arrow)"/><text x="${n(x2 + dx)}" y="${n(y2 + dy)}" text-anchor="${anchor}">${esc(text)}</text>`;
  parts.push(arrow(cx, cy, cx + L * 0.92, cy, '+X', 4, 4));
  parts.push(arrow(cx, cy, cx, cy - L * 0.92, '+Y', 6, 4));
  parts.push(`<text class="small" x="${n(cx + L * 0.92)}" y="${n(cy + 16)}" text-anchor="end">e_x = M_y/V_Ed</text>`);
  parts.push(`<text class="small" x="${n(cx + 8)}" y="${n(cy - L * 0.92 + 16)}">e_y = M_x/V_Ed</text>`);
  // V_Ed at the centre: column reaction, perpendicular to the slab.
  parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="6" fill="white" stroke="${COLORS.ink}" stroke-width="1.2"/><path d="M${n(cx - 4)} ${n(cy - 4)}L${n(cx + 4)} ${n(cy + 4)}M${n(cx - 4)} ${n(cy + 4)}L${n(cx + 4)} ${n(cy - 4)}" stroke="${COLORS.ink}" stroke-width="1"/>`);
  // Resultants.
  for (const e of ecc) {
    const x = X(column.x + e.ex);
    const y = Y(column.y + e.ey);
    const main = e.name === governing;
    parts.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${main ? 5 : 4}" fill="${main ? GOLD : 'white'}" stroke="${GOLD}" stroke-width="1.6"/><text class="small" x="${n(x + 7)}" y="${n(y - 6)}">${esc(e.name)}</text>`);
  }
  // Table of actions.
  const tx = 20 + plotW + 30;
  const cols = [['Combination', 0, 'start'], ['V_Ed kN', 112, 'end'], ['M_x kNm', 166, 'end'], ['M_y kNm', 220, 'end'], ['e_x mm', 268, 'end'], ['e_y mm', 314, 'end']];
  let y = 34;
  parts.push(cols.map(([text, x, a]) => `<text class="small" x="${n(tx + x)}" y="${y}" text-anchor="${a}" style="font-weight:500">${esc(text)}</text>`).join(''));
  parts.push(`<line x1="${tx}" y1="${y + 5}" x2="${tx + 318}" y2="${y + 5}" stroke="${COLORS.rule}"/>`);
  for (const e of ecc.slice(0, 10)) {
    y += 16;
    const values = [e.name, e.V.toFixed(1), e.Mx.toFixed(1), e.My.toFixed(1), e.ex.toFixed(0), e.ey.toFixed(0)];
    parts.push(cols.map(([, x, a], i) => `<text class="small" x="${n(tx + x)}" y="${y}" text-anchor="${a}"${e.name === governing && i === 0 ? ` fill="${GOLD}" style="fill:${GOLD}"` : ''}>${esc(values[i])}</text>`).join(''));
  }
  y += 26;
  parts.push(`<text class="small" x="${tx}" y="${y}">⊗ V_Ed: column reaction normal to the slab.</text>`
    + `<text class="small" x="${tx}" y="${y + 15}">Gold markers: resultant of each combination; filled = governing.</text>`
    + `<text class="small" x="${tx}" y="${y + 30}">+M_x moves the resultant to +Y, +M_y to +X.</text>`
    + `<text class="small" x="${tx}" y="${y + 45}">Moments in global axes; β uses |e| (§6.4.3).</text>`);
  return svgDocument(width, height, 'Loading and sign convention', parts.join(''));
}
