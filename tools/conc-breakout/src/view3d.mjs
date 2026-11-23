// 3D view of the connection as SVG: orthographic projection with painter's-algorithm depth sorting.
// Model axes: x right, y up, z into the concrete. World: X = x, Y = y, Z = −z (out of the wall).
// Shows the concrete block (translucent), the plate coloured by a FEM field, the steel member stub,
// welded bars and studs coloured by force, and the breakout bodies that are checked. Pure module.
import { barPath } from './section-view.mjs';
import { COLORS, esc } from './svg.mjs';

const FREE = 260;
export const FIELDS = { stress: 'Plate σ_vM (MPa)', deflection: 'Plate w (mm)', contact: 'Contact pressure (MPa)' };
const RAMP = [[49, 54, 149], [69, 117, 180], [116, 173, 209], [254, 224, 144], [244, 109, 67], [165, 0, 38]];

export function rampColor(t) {
  const v = Math.min(Math.max(t, 0), 1) * (RAMP.length - 1);
  const i = Math.min(Math.floor(v), RAMP.length - 2);
  const f = v - i;
  return 'rgb(' + RAMP[i].map((c, k) => Math.round(c + f * (RAMP[i + 1][k] - c))).join(',') + ')';
}

function nodeField(result, field) {
  const f = result.eq.fem;
  if (!f) return null;
  if (field === 'deflection') return Array.from(f.w);
  if (field === 'contact') return Array.from(f.w, (w, i) => Math.max(0, -w) * f.kc);
  const sum = new Float64Array(f.mesh.nodes.length);
  const count = new Float64Array(f.mesh.nodes.length);
  for (const e of f.elements) for (const n of e.nodes) { sum[n] += e.vm; count[n] += 1; }
  return Array.from(sum, (s, i) => s / count[i]);
}

export function buildScene(result, { field = 'stress', scale = 0 } = {}) {
  const { input, eq } = result;
  const { plate, member, concrete, studs: s, rebars } = input;
  const e = concrete.edges;
  const ext = { left: e.left ?? plate.B / 2 + FREE, right: e.right ?? plate.B / 2 + FREE, bottom: e.bottom ?? plate.H / 2 + FREE, top: e.top ?? plate.H / 2 + FREE };
  const h = concrete.thickness;
  const faces = [];
  const lines = [];
  const P = (x, y, z) => [x, y, -z];
  const box = (x0, x1, y0, y1, z0, z1, style) => {
    const c = (i, j, k) => P([x0, x1][i], [y0, y1][j], [z0, z1][k]);
    for (const quad of [[[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
      [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]]) {
      faces.push({ pts: quad.map(([i, j, k]) => c(i, j, k)), ...style });
    }
  };
  box(-ext.left, ext.right, -ext.bottom, ext.top, 0, h, { fill: COLORS.concrete, opacity: 0.16, stroke: COLORS.concreteEdge, width: 0.6 });

  // Plate: exposed face coloured by the field, deformed by w × scale (rigid model: flat, uniform).
  const values = nodeField(result, field);
  const f = eq.fem;
  let range = null;
  if (f && values) {
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    range = { lo, hi, label: FIELDS[field] };
    // Deformation is exaggerated so that the largest |w| shows as `scale` × 8% of the plate size.
    const wMax = Math.max(Math.abs(f.wMin), Math.abs(f.wMax)) || 1;
    scale *= 0.08 * Math.max(plate.B, plate.H) / wMax;
    const zOf = n => -f.w[n] * scale;
    for (const el of f.mesh.elements) {
      const avg = el.nodes.reduce((sum, n) => sum + values[n], 0) / 4;
      faces.push({ pts: el.nodes.map(n => P(f.mesh.nodes[n].x, f.mesh.nodes[n].y, zOf(n))), fill: rampColor(hi > lo ? (avg - lo) / (hi - lo) : 0), opacity: 1, stroke: 'none', bias: 1 });
    }
  } else {
    faces.push({ pts: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => P(i * plate.B / 2, j * plate.H / 2, 0)), fill: COLORS.steelFill, opacity: 1, stroke: COLORS.steel, width: 1, bias: 1 });
  }
  box(-plate.B / 2, plate.B / 2, -plate.H / 2, plate.H / 2, 0.01, plate.t, { fill: COLORS.steelFill, opacity: 0.55, stroke: COLORS.steel, width: 0.8 });

  // Steel member stub (I-section, web thickness for display only), moved by the master rotation.
  const lift = f ? y => -(f.master[0] + f.master[1] * y) * scale : () => 0;
  const len = input.actions.e + 30;
  const tw = Math.max(6, 0.6 * member.tf);
  const stub = (x0, x1, y0, y1) => box(x0, x1, y0, y1, -len + lift((y0 + y1) / 2), lift((y0 + y1) / 2), { fill: COLORS.steel, opacity: 0.9, stroke: '#3c4855', width: 0.6 });
  stub(-member.b / 2, member.b / 2, member.h / 2 - member.tf, member.h / 2);
  stub(-member.b / 2, member.b / 2, -member.h / 2, -member.h / 2 + member.tf);
  stub(-tw / 2, tw / 2, -member.h / 2 + member.tf, member.h / 2 - member.tf);

  // Welded bars and studs, coloured by force relative to their design resistance.
  for (const bar of result.bars) {
    const path = barPath(input, rebars.rows[bar.row]).points.map(([z, y]) => P(bar.x, y, z));
    const ur = bar.steel.FRd ? bar.F / bar.steel.FRd : 0;
    for (let k = 1; k < path.length; k++) lines.push({ a: path[k - 1], b: path[k], color: bar.F > 0 ? rampColor(0.5 + ur / 2) : COLORS.rebar, width: Math.max(bar.d / 6, 2) });
  }
  for (const stud of result.studs) {
    lines.push({ a: P(stud.x, stud.y, plate.t), b: P(stud.x, stud.y, s.hef), color: stud.F > 0 ? COLORS.tension : COLORS.steel, width: Math.max(s.d / 7, 2) });
    lines.push({ a: P(stud.x - s.dh / 2, stud.y, s.hef), b: P(stud.x + s.dh / 2, stud.y, s.hef), color: COLORS.steel, width: 3 });
  }

  // Breakout bodies that are checked: cone of tensioned studs, edge breakout toward the lower edge.
  const dashed = { color: COLORS.failure, width: 1, dash: '5 4' };
  const pulled = result.studs.filter(stud => stud.F > 0);
  if (pulled.length) {
    const r = 1.5 * s.hef;
    const clip = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const xs = pulled.map(p => p.x);
    const ys = pulled.map(p => p.y);
    const top = [[Math.min(...xs) - r, Math.min(...ys) - r], [Math.max(...xs) + r, Math.min(...ys) - r], [Math.max(...xs) + r, Math.max(...ys) + r], [Math.min(...xs) - r, Math.max(...ys) + r]]
      .map(([x, y]) => P(clip(x, -ext.left, ext.right), clip(y, -ext.bottom, ext.top), 0));
    const base = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]].map(([x, y]) => P(x, y, s.hef));
    top.forEach((p, k) => { lines.push({ a: p, b: top[(k + 1) % 4], ...dashed }); lines.push({ a: p, b: base[k], ...dashed }); });
  }
  if (e.bottom !== null) {
    const rear = Math.max(...result.studs.map(st => st.y));
    const c1 = e.bottom + rear;
    const xs = result.studs.filter(st => st.y === rear).map(st => st.x);
    const lo = Math.max(Math.min(...xs) - 1.5 * c1, -ext.left);
    const hi = Math.min(Math.max(...xs) + 1.5 * c1, ext.right);
    const depth = Math.min(1.5 * c1, h);
    const corners = [P(lo, -e.bottom, 0), P(Math.min(...xs), rear, 0), P(Math.max(...xs), rear, 0), P(hi, -e.bottom, 0)];
    for (let k = 1; k < 4; k++) lines.push({ a: corners[k - 1], b: corners[k], ...dashed });
    const apex = P(0, -e.bottom, depth);
    lines.push({ a: corners[0], b: apex, ...dashed }, { a: corners[3], b: apex, ...dashed });
  }
  return { faces, lines, range, bounds: { x: [-ext.left, ext.right], y: [-ext.bottom, ext.top], z: [-len, h] } };
}

export function renderScene(scene, { yaw = -0.6, pitch = 0.45, zoom = 1, width = 560, height = 460, title = '3D VIEW' } = {}) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const rot = ([X, Y, Z]) => {
    const x1 = cy * X + sy * Z;
    const z1 = -sy * X + cy * Z;
    return [x1, cp * Y - sp * z1, sp * Y + cp * z1];
  };
  const { x, y, z } = scene.bounds;
  const corners = [];
  for (const X of x) for (const Y of y) for (const Z of [-z[1], -z[0]]) corners.push(rot([X, Y, Z]));
  const u0 = Math.min(...corners.map(c => c[0])), u1 = Math.max(...corners.map(c => c[0]));
  const v0 = Math.min(...corners.map(c => c[1])), v1 = Math.max(...corners.map(c => c[1]));
  const k = zoom * Math.min((width - 40) / (u1 - u0), (height - 70) / (v1 - v0));
  const ox = width / 2 - k * (u0 + u1) / 2;
  const oy = (height - 20) / 2 + k * (v0 + v1) / 2;
  const scr = p => { const r = rot(p); return [ox + k * r[0], oy - k * r[1], r[2]]; };
  const items = [];
  for (const face of scene.faces) {
    const pts = face.pts.map(scr);
    const depth = pts.reduce((s, p) => s + p[2], 0) / pts.length + (face.bias ?? 0) * 0.5;
    items.push({ depth, svg: `<polygon points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="${face.fill}" fill-opacity="${face.opacity}"${face.stroke && face.stroke !== 'none' ? ` stroke="${face.stroke}" stroke-width="${face.width}"` : face.opacity === 1 ? ` stroke="${face.fill}" stroke-width=".4"` : ''}/>` });
  }
  for (const line of scene.lines) {
    const a = scr(line.a), b = scr(line.b);
    items.push({ depth: (a[2] + b[2]) / 2 + 1, svg: `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${line.color}" stroke-width="${line.width}" stroke-linecap="round"${line.dash ? ` stroke-dasharray="${line.dash}"` : ''}/>` });
  }
  items.sort((p, q) => p.depth - q.depth); // viewer on +z′: far (small z′) first
  let legend = '';
  if (scene.range) {
    const { lo, hi, label } = scene.range;
    const stops = RAMP.map((_, i) => `<stop offset="${i / (RAMP.length - 1)}" stop-color="${rampColor(i / (RAMP.length - 1))}"/>`).join('');
    legend = `<defs><linearGradient id="cb-ramp">${stops}</linearGradient></defs><rect x="12" y="${height - 26}" width="160" height="9" fill="url(#cb-ramp)"/>`
      + `<text x="12" y="${height - 32}" font-size="10" fill="${COLORS.ink}">${esc(label)}</text><text x="12" y="${height - 6}" font-size="10" fill="${COLORS.muted}">${lo.toFixed(lo > -1 && lo < 1 ? 3 : 0)}</text>`
      + `<text x="172" y="${height - 6}" font-size="10" text-anchor="end" fill="${COLORS.muted}">${hi.toFixed(Math.abs(hi) < 1 ? 3 : 0)}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="3D view of the connection" font-family="Roboto, system-ui, sans-serif" font-size="11">`
    + `<rect width="${width}" height="${height}" fill="#ffffff"/>${items.map(item => item.svg).join('')}`
    + `<text x="12" y="18" font-weight="600" fill="${COLORS.ink}">${esc(title)}</text>${legend}</svg>`;
}
