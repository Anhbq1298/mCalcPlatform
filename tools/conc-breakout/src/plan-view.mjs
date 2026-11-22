// Plan on the plate face (x right, y up). Shows the receiving member edges, plate, steel member,
// welded bars, headed studs, applied shear and, where checked, the projected breakout boundaries.
import { COLORS, arrow, circle, dim, frame, label, line, rect, view } from './svg.mjs';

const FREE = 260; // drawn extent beyond the plate where an edge is far away (mm)

export function planSvg(result, { width = 560, height = 520 } = {}) {
  const { input, bars, studs, eq } = result;
  const { plate, member, concrete, studs: s } = input;
  const e = concrete.edges;
  const ext = {
    left: e.left ?? plate.B / 2 + FREE, right: e.right ?? plate.B / 2 + FREE,
    bottom: e.bottom ?? plate.H / 2 + FREE, top: e.top ?? plate.H / 2 + FREE,
  };
  const v = view({ u0: -ext.left - 40, u1: ext.right + 40, v0: -ext.bottom - 60, v1: ext.top + 30 }, width, height);
  const out = [];
  out.push(rect(v, -ext.left, -ext.bottom, ext.right, ext.top, `fill="${COLORS.concrete}" stroke="none"`));
  const edgeLine = (u0, w0, u1, w1, free) => line(v, u0, w0, u1, w1, `stroke="${COLORS.concreteEdge}" stroke-width="${free ? 0.8 : 1.6}"${free ? ' stroke-dasharray="10 4 2 4"' : ''}`);
  out.push(edgeLine(-ext.left, ext.top, ext.right, ext.top, e.top === null));
  out.push(edgeLine(-ext.left, -ext.bottom, ext.right, -ext.bottom, e.bottom === null));
  out.push(edgeLine(-ext.left, -ext.bottom, -ext.left, ext.top, e.left === null));
  out.push(edgeLine(ext.right, -ext.bottom, ext.right, ext.top, e.right === null));

  // Edge breakout: projected failure width on the concrete face for the governing row.
  if (e.bottom !== null) {
    const rear = Math.max(...studs.map(st => st.y));
    const c1 = e.bottom + rear;
    const xs = studs.filter(st => st.y === rear).map(st => st.x);
    const lo = Math.max(Math.min(...xs) - 1.5 * c1, -ext.left);
    const hi = Math.min(Math.max(...xs) + 1.5 * c1, ext.right);
    out.push(`<polyline points="${[[lo, -e.bottom], [Math.min(...xs), rear], [Math.max(...xs), rear], [hi, -e.bottom]].map(([u, w]) => v.x(u).toFixed(1) + ',' + v.y(w).toFixed(1)).join(' ')}" fill="none" stroke="${COLORS.failure}" stroke-width="1" stroke-dasharray="6 4"/>`);
    out.push(label(v.x(hi) - 4, v.y(-e.bottom) - 6, 'edge breakout (rear row)', { anchor: 'end', color: COLORS.failure, size: 10 }));
  }
  // Concrete cone projection of tensioned studs.
  const pulled = studs.filter(st => st.F > 0);
  if (pulled.length) {
    const r = 1.5 * s.hef;
    const clip = (value, lo, hi) => Math.min(Math.max(value, lo), hi);
    const u0 = clip(Math.min(...pulled.map(st => st.x)) - r, -ext.left, ext.right);
    const u1 = clip(Math.max(...pulled.map(st => st.x)) + r, -ext.left, ext.right);
    const w0 = clip(Math.min(...pulled.map(st => st.y)) - r, -ext.bottom, ext.top);
    const w1 = clip(Math.max(...pulled.map(st => st.y)) + r, -ext.bottom, ext.top);
    out.push(rect(v, u0, w0, u1, w1, `fill="none" stroke="${COLORS.failure}" stroke-width="1" stroke-dasharray="3 3"`));
    out.push(label(v.x(u0) + 4, v.y(w1) + 12, 'A_c,N (cone)', { anchor: 'start', color: COLORS.failure, size: 10 }));
  }

  out.push(rect(v, -plate.B / 2, -plate.H / 2, plate.B / 2, plate.H / 2, `fill="${COLORS.steelFill}" stroke="${COLORS.steel}" stroke-width="1.6"`));
  // Steel member footprint: two flanges (I or box) in the moment direction.
  out.push(rect(v, -member.b / 2, -member.h / 2, member.b / 2, member.h / 2, `fill="none" stroke="${COLORS.steel}" stroke-width="1.2" stroke-dasharray="5 3"`));
  out.push(rect(v, -member.b / 2, member.h / 2 - member.tf, member.b / 2, member.h / 2, `fill="${COLORS.steel}" stroke="none"`));
  out.push(rect(v, -member.b / 2, -member.h / 2, member.b / 2, -member.h / 2 + member.tf, `fill="${COLORS.steel}" stroke="none"`));
  if (eq.bearing && eq.C > 0) {
    const b = eq.bearing;
    out.push(rect(v, -b.width / 2, b.yLo, b.width / 2, b.yHi, `fill="${COLORS.compression}" fill-opacity=".14" stroke="${COLORS.compression}" stroke-width=".8"`));
  } else if (eq.block && eq.C > 0) {
    out.push(rect(v, -plate.B / 2, -plate.H / 2, plate.B / 2, -plate.H / 2 + eq.block.x, `fill="${COLORS.compression}" fill-opacity=".14" stroke="${COLORS.compression}" stroke-width=".8"`));
  }
  for (const st of studs) {
    out.push(circle(v, st.x, st.y, s.dh / 2, `fill="none" stroke="${COLORS.steel}" stroke-width=".8" stroke-dasharray="2 2"`));
    out.push(circle(v, st.x, st.y, s.d / 2, `fill="#ffffff" stroke="${COLORS.steel}" stroke-width="1.4"`));
    out.push(label(v.x(st.x) + 10, v.y(st.y) - 8, st.id, { anchor: 'start', size: 9, color: COLORS.muted }));
  }
  for (const bar of bars) {
    out.push(circle(v, bar.x, bar.y, bar.d / 2, `fill="${COLORS.rebar}" stroke="${bar.F > 0 ? COLORS.tension : COLORS.rebar}" stroke-width="${bar.F > 0 ? 1.4 : 0.6}"`));
  }
  const barText = input.rebars.rows.map(row => row.n + 'Ø' + row.d).join(' + ');
  if (barText) out.push(label(v.x(-plate.B / 2) - 8, v.y(plate.H / 2) - 4, barText + ' welded', { anchor: 'end', color: COLORS.rebar, size: 10, weight: 600 }));

  out.push(dim(v, -plate.B / 2, plate.H / 2, plate.B / 2, plate.H / 2, -16, 'B = ' + plate.B));
  out.push(dim(v, plate.B / 2, -plate.H / 2, plate.B / 2, plate.H / 2, 18, 'H = ' + plate.H));
  if (s.nx > 1) out.push(dim(v, studs[0].x, -plate.H / 2, studs[1].x, -plate.H / 2, 16, 's_x = ' + s.sx));
  if (s.ny > 1) out.push(dim(v, -plate.B / 2, studs[0].y, -plate.B / 2, studs[s.nx].y, -18, 's_y = ' + s.sy));
  if (e.bottom !== null) out.push(dim(v, plate.B / 2 + 70, -e.bottom, plate.B / 2 + 70, 0, 0, 'c_bottom = ' + e.bottom));
  const V = result.actions.V / 1e3;
  if (V > 0) out.push(arrow(v.x(plate.B / 2) + 52, v.y(0) + 24, 0, 1, 48, COLORS.shear, 'V_Ed = ' + V.toFixed(1) + ' kN', -1));
  out.push(label(12, 18, 'PLAN ON PLATE FACE', { anchor: 'start', weight: 600 }));
  out.push(label(12, 32, 'x →, y ↑ · M_Ed causes tension at +y', { anchor: 'start', size: 10, color: COLORS.muted }));
  return frame(v, out.join(''), 'Plan on the plate face with studs, welded bars and breakout boundaries');
}
