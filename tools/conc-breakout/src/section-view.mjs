// Section in the moment plane (z into the concrete → right, y ↑). Shows the receiving member, the
// cast-in plate, welded bars with bends, headed studs, the applied actions and the internal
// tension–compression couple from the equilibrium solution. The dashed region and strut are a
// conceptual D-region sketch, labelled as such; they are not a solved strut-and-tie model.
import { COLORS, arrow, dim, frame, label, line, polyline, rect, view } from './svg.mjs';

const COVER = 40;

export function barPath(input, row) {
  const { plate, concrete, rebars } = input;
  const reach = concrete.thickness - COVER - plate.t;
  const straight = rebars.shape === 'bent' ? Math.max(0, Math.min(rebars.length, reach)) : rebars.length;
  const tail = rebars.shape === 'bent' ? Math.max(0, rebars.length - straight) : 0;
  const z1 = plate.t + straight;
  return { straight, tail, points: [[plate.t, row.y], [z1, row.y], ...(tail ? [[z1, row.y - tail]] : [])], fits: plate.t + straight <= concrete.thickness - COVER };
}

export function sectionSvg(result, { width = 560, height = 520 } = {}) {
  const { input, eq, actions } = result;
  const { plate, member, concrete, studs: s, rebars } = input;
  const e = concrete.edges;
  const h = concrete.thickness;
  const tails = rebars.rows.map(row => barPath(input, row));
  const yLow = Math.min(-plate.H / 2 - 120, ...rebars.rows.map((row, i) => row.y - tails[i].tail - 40));
  const yTop = e.top ?? plate.H / 2 + 160;
  const yBot = e.bottom === null ? yLow : -e.bottom;
  const reach = Math.max(input.actions.e + 60, 140);
  const v = view({ u0: -reach - 30, u1: h + 40, v0: Math.min(yBot, yLow) - 20, v1: yTop + 20 }, width, height - 50, 40);
  const out = [];
  out.push(rect(v, 0, yBot, h, yTop, `fill="${COLORS.concrete}" stroke="${COLORS.concreteEdge}" stroke-width="1.2"`));
  out.push(rect(v, 0, -plate.H / 2, plate.t, plate.H / 2, `fill="${COLORS.steelFill}" stroke="${COLORS.steel}" stroke-width="1.4"`));
  // Steel member in elevation: flanges projecting from the plate face.
  const arm = input.actions.e;
  out.push(rect(v, -arm - 30, -member.h / 2, 0, member.h / 2, `fill="none" stroke="${COLORS.steel}" stroke-width="1.2"`));
  out.push(rect(v, -arm - 30, member.h / 2 - member.tf, 0, member.h / 2, `fill="${COLORS.steel}" stroke="none"`));
  out.push(rect(v, -arm - 30, -member.h / 2, 0, -member.h / 2 + member.tf, `fill="${COLORS.steel}" stroke="none"`));
  // Conceptual D-region and load path.
  const depth = Math.min(h, Math.max(plate.H, ...tails.map(t => plate.t + t.straight)));
  out.push(rect(v, 0, -plate.H / 2 - depth / 2, depth, plate.H / 2 + 40, `fill="none" stroke="${COLORS.muted}" stroke-width=".8" stroke-dasharray="8 4"`));
  out.push(label(v.x(depth) - 4, v.y(-plate.H / 2 - depth / 2) - 5, 'D-region (sketch)', { anchor: 'end', size: 9, color: COLORS.muted }));
  for (const [i, row] of rebars.rows.entries()) {
    const path = tails[i];
    out.push(polyline(v, path.points, `stroke="${COLORS.rebar}" stroke-width="${Math.max(row.d * v.scale, 2)}" stroke-linejoin="round"`));
    if (eq.C > 0 && eq.yC !== null && !eq.allCompression) {
      const end = path.points.at(-1);
      out.push(line(v, plate.t, eq.yC, end[0], end[1], `stroke="${COLORS.compression}" stroke-width="1" stroke-dasharray="5 3"`));
    }
  }
  for (const y of [...new Set(result.studs.map(st => st.y))]) {
    out.push(line(v, plate.t, y, s.hef, y, `stroke="${COLORS.steel}" stroke-width="${Math.max(s.d * v.scale, 1.6)}"`));
    out.push(line(v, s.hef, y - s.dh / 2, s.hef, y + s.dh / 2, `stroke="${COLORS.steel}" stroke-width="${Math.max(10 * v.scale, 2)}"`));
  }
  out.push(dim(v, 0, -plate.H / 2 - 30, s.hef, -plate.H / 2 - 30, 14, 'h_ef = ' + s.hef));
  out.push(dim(v, 0, Math.min(yBot, yLow), h, Math.min(yBot, yLow), -12, 'h = ' + h));
  out.push(dim(v, -arm, -member.h / 2 - 20, 0, -member.h / 2 - 20, 10, 'e = ' + arm));

  // Actions on the member tip and the internal couple acting on the plate.
  if (actions.V > 0) out.push(arrow(v.x(-arm), v.y(member.h / 2) - 2, 0, 1, 46, COLORS.shear, 'V_Ed = ' + (actions.V / 1e3).toFixed(1) + ' kN', -1));
  if (actions.N !== 0) out.push(arrow(v.x(-arm - 30) - (actions.N > 0 ? 44 : 0), v.y(-member.h / 4), actions.N > 0 ? -1 : 1, 0, 40, COLORS.tension, 'N_Ed = ' + (actions.N / 1e3).toFixed(1) + ' kN'));
  const legend = [];
  for (const [index, row] of rebars.rows.entries()) {
    const F = result.bars.filter(b => b.row === index).reduce((sum, b) => sum + b.F, 0);
    if (!(F > 0)) continue;
    const tag = 'T' + (index + 1);
    out.push(arrow(v.x(plate.t) + 40, v.y(row.y) - 7, 1, 0, 30, COLORS.tension, tag, -1, 'start'));
    legend.push([COLORS.tension, tag + ' = ' + (F / 1e3).toFixed(1) + ' kN, bar row ' + (index + 1) + ' at y = ' + row.y]);
  }
  const pulled = result.studs.filter(st => st.F > 0);
  for (const [index, y] of [...new Set(pulled.map(st => st.y))].entries()) {
    const F = pulled.filter(st => st.y === y).reduce((sum, st) => sum + st.F, 0);
    const tag = 'N' + (index + 1);
    out.push(arrow(v.x(s.hef) + 30, v.y(y), 1, 0, 24, COLORS.tension, tag, 1, 'start'));
    legend.push([COLORS.tension, tag + ' = ' + (F / 1e3).toFixed(1) + ' kN, stud row at y = ' + y]);
  }
  if (eq.C > 0 && eq.yC !== null) {
    out.push(arrow(v.x(plate.t) - 2, v.y(eq.yC), -1, 0, 40, COLORS.compression, 'C', 1, 'start'));
    legend.push([COLORS.compression, 'C = ' + (eq.C / 1e3).toFixed(1) + ' kN, bearing at y = ' + eq.yC.toFixed(0)]);
    if (eq.yT !== null && !eq.allCompression) out.push(dim(v, -arm - 55, eq.yC, -arm - 55, eq.yT, 0, 'z = ' + eq.lever.toFixed(0)));
  }
  legend.forEach(([color, text], i) => out.push(label(12, height - 14 - (legend.length - 1 - i) * 14, text, { anchor: 'start', color, size: 10, weight: 600 })));
  out.push(label(12, 18, 'SECTION IN THE MOMENT PLANE', { anchor: 'start', weight: 600 }));
  out.push(label(12, 32, 'Forces from the rigid-plate equilibrium · strut lines are conceptual', { anchor: 'start', size: 10, color: COLORS.muted }));
  return frame(v, out.join(''), 'Section through the connection with the tension–compression couple', height);
}
