import { arrow, circle, COLORS, dim, frame, label, line, rect, view } from './svg.mjs';

export function spatialSection(result, axis, { width = 560, height = 480 } = {}) {
  const { plate, concrete, member, studs } = result.input;
  const alongX = axis === 'X';
  const coordinate = alongX ? 'x' : 'y';
  const half = (alongX ? plate.B : plate.H) / 2;
  const memberHalf = (alongX ? member.b : member.h) / 2;
  const p = result.loadingResult?.point;
  const load = result.loadingResult?.applied;
  const lo = -(concrete.edges[alongX ? 'left' : 'bottom'] ?? half + 100);
  const hi = concrete.edges[alongX ? 'right' : 'top'] ?? half + 100;
  const h = concrete.thickness;
  const length = Math.max(plate.t + 80, memberHalf);
  const v = view({
    u0: Math.min(-length, -(p?.z ?? 0)) - 35, u1: Math.max(h, -(p?.z ?? 0)) + 35,
    v0: Math.min(lo, p?.[coordinate] ?? 0) - 40, v1: Math.max(hi, p?.[coordinate] ?? 0) + 35,
  }, width, height, 42);
  const out = [
    rect(v, 0, lo, h, hi, `fill="${COLORS.concrete}" stroke="${COLORS.concreteEdge}"`),
    rect(v, -plate.t, -half, 0, half, `fill="${COLORS.steelFill}" stroke="${COLORS.steel}"`),
    rect(v, -length, -memberHalf, -plate.t, memberHalf, `fill="none" stroke="${COLORS.steel}"`),
    dim(v, 0, lo, h, lo, -18, 'h = ' + h + ' mm'),
    label(12, 18, 'SECTION ' + axis + '–' + axis, { anchor: 'start', weight: 600 }),
    label(12, 34, 'Projected anchors · +Z outward to the left', { anchor: 'start', size: 10 }),
  ];
  for (const anchor of result.studs) {
    const u = anchor[coordinate];
    out.push(line(v, 0, u, studs.hef, u, `stroke="${COLORS.steel}" stroke-width="2"`));
    out.push(line(v, studs.hef, u - studs.dh / 2, studs.hef, u + studs.dh / 2, `stroke="${COLORS.steel}" stroke-width="3"`));
  }
  for (const bar of result.bars) {
    const u = bar[coordinate];
    const reach = result.input.rebars.shape === 'straight' ? result.input.rebars.length :
      Math.min(result.input.rebars.length, Math.max(0, h - 40));
    out.push(line(v, 0, u, reach, u, `stroke="${COLORS.rebar}" stroke-width="2"`));
  }
  if (p && load) {
    const px = v.x(-p.z), py = v.y(p[coordinate]);
    out.push(circle(v, -p.z, p[coordinate], 4 / v.scale, `fill="${COLORS.tension}"`));
    out.push(label(px - 7, py - 9, 'P', { anchor: 'end' }));
    if (load.N) out.push(arrow(px, py, -Math.sign(load.N), 0, 38, COLORS.tension, 'N'));
    if (load['V' + coordinate]) out.push(arrow(px, py, 0, -Math.sign(load['V' + coordinate]), 38, COLORS.shear, 'V' + coordinate));
  }
  return frame(v, out.join(''), 'Projected connection section ' + axis, height);
}

const colors = ['#a13b2e', '#00706b', '#315ab0'];
export function spatialAnnotations(result, { showLoads, showForces, showLabels }) {
  const loading = result.loadingResult;
  if (!loading) return [];
  const size = Math.min(result.input.plate.B, result.input.plate.H);
  const marks = [];
  const force = [loading.applied.Vx, loading.applied.Vy, loading.applied.N];
  const moments = [loading.applied.Mx, loading.applied.My, loading.applied.Mz];
  const { x, y, z } = loading.point;
  if (showLoads) {
    marks.push({ point: [x, y, z], label: 'P', color: '#172536' });
    for (let i = 0; i < 3; i++) {
      const direction = [0, 0, 0];
      direction[i] = size * 0.18;
      marks.push({ path: [[0, 0, 0], direction], arrow: true, label: ['X', 'Y', 'Z'][i], color: colors[i] });
      if (force[i]) {
        const end = [x, y, z];
        end[i] += Math.sign(force[i]) * size * 0.30;
        marks.push({ path: [[x, y, z], end], arrow: true, label: ['Vx', 'Vy', 'N'][i], color: colors[i] });
      }
      if (!moments[i]) continue;
      const path = [];
      for (let j = 0; j <= 20; j++) {
        const angle = j * 0.25 * Math.sign(moments[i]);
        const p = [x, y, z];
        p[(i + 1) % 3] += size * 0.16 * Math.cos(angle);
        p[(i + 2) % 3] += size * 0.16 * Math.sin(angle);
        path.push(p);
      }
      marks.push({ path, arrow: true, label: ['Mx', 'My', 'Mz'][i], color: colors[i] });
    }
  }
  const anchors = [...result.studs, ...result.bars];
  const max = Math.max(1, ...anchors.map(e => Math.hypot(e.F, e.Vx, e.Vy)));
  for (const anchor of anchors) {
    const start = [anchor.x, anchor.y, 0];
    const ratio = size * 0.3 / max;
    if (showForces && Math.hypot(anchor.F, anchor.Vx, anchor.Vy) > 0.05) marks.push({
      path: [start, [anchor.x + ratio * anchor.Vx, anchor.y + ratio * anchor.Vy, ratio * anchor.F]],
      arrow: true, color: COLORS.shear,
    });
    if (showLabels) marks.push({ point: start, label: anchor.id, color: COLORS.ink });
  }
  return marks;
}
