// Fastener layout: either the parametric grid (stud grid + welded bar rows) or a custom list of
// points, as in PROFIS-style anchor editors. Every point is a headed stud or a welded bar and can be
// converted between the two. Coordinates in mm from the plate centre.
import { rebarPositions, studPositions } from './inputs.mjs';

export const SNAP = 5;
export const snap = value => Math.round(value / SNAP) * SNAP;
const ROW_TOL = 1; // bars within 1 mm in y form one row

// Seed a custom layout from the current grid so switching modes keeps the design.
export function gridToPoints(input) {
  return [
    ...studPositions(input.studs).map(p => ({ type: 'stud', x: p.x, y: p.y })),
    ...rebarPositions(input.rebars.rows).map(b => ({ type: 'rebar', x: b.x, y: b.y, d: b.d })),
  ];
}

function rowsOf(bars) {
  const rows = [];
  for (const bar of [...bars].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find(item => Math.abs(item.y - bar.y) <= ROW_TOL);
    if (row) row.bars.push(bar); else rows.push({ y: bar.y, bars: [bar] });
  }
  return rows.map((row, index) => {
    const xs = row.bars.map(bar => bar.x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    for (const bar of row.bars) bar.row = index;
    return { index, y: row.y, n: xs.length, d: Math.max(...row.bars.map(bar => bar.d)), s: gaps.length ? Math.min(...gaps) : 0, xs };
  });
}

export function resolveLayout(input) {
  if (input.layout?.mode !== 'custom') {
    const bars = rebarPositions(input.rebars.rows);
    const rows = input.rebars.rows.map((row, index) => ({ index, y: row.y, n: row.n, d: row.d, s: row.n > 1 ? row.s : 0,
      xs: bars.filter(bar => bar.row === index).map(bar => bar.x) }));
    return { mode: 'grid', studs: studPositions(input.studs), bars, rows };
  }
  const points = input.layout.points;
  const studs = points.filter(p => p.type === 'stud').map((p, i) => ({ id: 'S' + (i + 1), x: p.x, y: p.y, index: points.indexOf(p), shearStiffness: p.shearStiffness, axialStiffness: p.axialStiffness }));
  const bars = points.filter(p => p.type === 'rebar').map(p => ({ x: p.x, y: p.y, d: p.d, index: points.indexOf(p), axialStiffness: p.axialStiffness }));
  const rows = rowsOf(bars);
  const count = new Map();
  for (const bar of bars) {
    count.set(bar.row, (count.get(bar.row) ?? 0) + 1);
    bar.id = 'R' + (bar.row + 1) + '.' + count.get(bar.row);
  }
  return { mode: 'custom', studs, bars, rows };
}

const finite = value => typeof value === 'number' && Number.isFinite(value);

export function validateLayout(input) {
  const { plate, studs: s, layout } = input;
  if (layout?.mode !== 'custom') return;
  const points = layout.points;
  if (!Array.isArray(points) || points.length > 100) throw new Error('Custom layouts support up to 100 points.');
  if (input.loading?.model !== 'spatial' && !points.some(p => p.type === 'stud')) throw new Error('Place at least one headed stud for the shear transfer.');
  if (input.loading?.model !== 'spatial' && !points.some(p => p.type === 'rebar') && s.tension !== 'shared') throw new Error('Add a welded bar, or let the studs share tension.');
  const size = p => (p.type === 'stud' ? s.dh : p.d);
  points.forEach((p, i) => {
    const label = `Point ${i + 1}`;
    if (!['stud', 'rebar'].includes(p.type) || !finite(p.x) || !finite(p.y)) throw new Error(label + ' needs a type and x, y.');
    if (p.type === 'rebar' && !(finite(p.d) && p.d >= 8 && p.d <= 40)) throw new Error(label + ': bar Ø must lie between 8 and 40 mm.');
    const r = (p.type === 'stud' ? s.d : p.d);
    if (Math.abs(p.x) > plate.B / 2 - r || Math.abs(p.y) > plate.H / 2 - r) throw new Error(label + ' lies off the plate.');
    for (let j = 0; j < i; j++) {
      const q = points[j];
      if (Math.hypot(p.x - q.x, p.y - q.y) < (size(p) + size(q)) / 2) throw new Error(`Points ${j + 1} and ${i + 1} overlap.`);
    }
  });
}
