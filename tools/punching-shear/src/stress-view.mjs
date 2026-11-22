// Shear stress along the control perimeters u0, u1 and u_out (or u1,ext for a drop), drawn as
// isometric "fences" whose height and colour give v_Ed. Mean stress v = V_Ed/(u·d).
// With β from moments at an internal column the shape is the plastic distribution behind Eq. 6.39
// (Fig. 6.19): v(s) = v·(1 + Σ k_i·e_i·u/W_i·sgn(x_i(s))), scaled so that the peak equals β·v.
// Otherwise (simplified or user β, edge and corner columns) the fence is the uniform envelope β·v.
// The picture illustrates the check; the check itself uses β·v at each perimeter.
import { kInternalRect, localEccentricities } from './demand.mjs';
import { toLocal } from './geometry.mjs';
import { intervalPolylines } from './perimeters.mjs';
import { COLORS, DASH, esc, n, svgDocument } from './svg.mjs';

// Sequential single-hue ramp (light → dark orange), magnitude only.
const RAMP = [[253, 227, 212], [245, 170, 130], [235, 104, 52], [176, 64, 22], [110, 36, 10]];
function colour(t) {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const c = RAMP[i].map((value, k) => Math.round(value + (RAMP[i + 1][k] - value) * f));
  return `rgb(${c.join(',')})`;
}

// Samples of one perimeter in column-local coordinates: [{ x, y, l }] with l = tributary length.
function samples(model, r) {
  const lines = intervalPolylines(model, r, model.intervalsAt(r).intervals);
  return lines.map(points => points.map(p => toLocal(model.column, p)));
}

// Stress factor f(s) for each sample (1 = mean).
function factors(paths, load, column, internal, beta) {
  const flat = paths.flat();
  const uniform = () => paths.map(path => path.map(() => beta));
  if (!internal || !/6\.(39|42|43)/.test(String(load.beta?.method ?? ''))) return uniform();
  if (!(load.V > 0) || beta <= 1 + 1e-9) return uniform();
  const { e1, e2 } = localEccentricities(column, load.V, load.Mx, load.My);
  let u = 0;
  let cx = 0;
  let cy = 0;
  for (const path of paths) for (let i = 1; i < path.length; i += 1) {
    const l = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    u += l; cx += l * (path[i].x + path[i - 1].x) / 2; cy += l * (path[i].y + path[i - 1].y) / 2;
  }
  if (!(u > 0)) return uniform();
  cx /= u; cy /= u;
  let wx = 0;
  let wy = 0;
  for (const path of paths) for (let i = 1; i < path.length; i += 1) {
    const l = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    wx += l * Math.abs((path[i].x + path[i - 1].x) / 2 - cx);
    wy += l * Math.abs((path[i].y + path[i - 1].y) / 2 - cy);
  }
  const circular = column.shape === 'circular';
  const kx = circular ? 0.6 : kInternalRect(column.cx, column.cy);
  const ky = circular ? 0.6 : kInternalRect(column.cy, column.cx);
  const ax = wx > 0 ? (kx * Math.abs(e1) * u) / wx : 0;
  const ay = wy > 0 ? (ky * Math.abs(e2) * u) / wy : 0;
  const shape = p => ax * Math.sign(e1) * Math.sign(p.x - cx || 1) + ay * Math.sign(e2) * Math.sign(p.y - cy || 1);
  const peak = Math.max(...flat.map(shape));
  if (!(peak > 0)) return uniform();
  return paths.map(path => path.map(p => 1 + ((beta - 1) * shape(p)) / peak));
}

export function stressSvg(result, { width = 640, load = null } = {}) {
  const governing = load ?? result.loads?.reduce((best, item) => (!best || item.ur > best.ur ? item : best), null);
  if (!governing || !result.model) return '';
  const model = result.model;
  const head = result.head;
  // Drawing origin = the actual column. With a drop the solved section may use another loaded area
  // (the drop, or the equivalent circle of Fig. 6.17); u0 is always on the column itself.
  const ref = head?.columnModel ?? model;
  const column = ref.column;
  const d = result.section.d;
  const internal = (result.position?.kind ?? 'internal') === 'internal';
  const beta = governing.beta?.value ?? 1;
  const u1Offset = result.u1Offset ?? 2 * d;
  const onColumn = !head || head.inner; // section solved around the column (plastic shape applies)
  const reinforced = governing.rows?.find(row => row.id === 'reinforced' && row.resistance);
  const panels = [
    { name: 'u0', r: 0, u: result.u0, d: result.faceD ?? d, limit: result.vRdMax, limitName: 'v_Rd,max', m: ref, plastic: true },
    { name: head?.kind === 'large' && head.inner ? 'u1,int' : head?.rcont ? 'u1 at r_cont' : head ? 'u1 (2d from drop)' : 'u1', r: u1Offset, u: result.u1, d, limit: reinforced?.resistance ?? result.resistance?.vRdc, limitName: reinforced ? 'v_Rd,cs' : 'v_Rd,c', m: model, plastic: onColumn },
  ];
  // Third panel: the slab section around the drop when the drop has an inner section (its own u_out
  // lies in the drop and is not the slab check), else u_out,ef of the solved section.
  if (head?.kind === 'large' && head.inner) {
    const ext = head.sections.find(item => item.id === 'ext');
    const row = governing.rows?.find(item => item.id === 'ext-concrete');
    if (ext && row) panels.push({ name: 'u1,ext', r: 2 * head.d, u: ext.u1, d: head.d, limit: row.resistance, limitName: 'v_Rd,c', m: ext.model, plastic: false });
  } else if (result.envelope?.uOut && governing.aOut > 0) {
    panels.push({ name: 'u_out,ef', r: governing.aOut, u: model.intervalsAt(governing.aOut).total, d, limit: result.resistance?.vRdc, limitName: 'v_Rd,c', m: model, plastic: onColumn });
  }
  for (const panel of panels) {
    const m = panel.m;
    panel.paths = samples(m, panel.r);
    panel.mean = (governing.V * 1000) / (panel.u * panel.d);
    panel.f = factors(panel.paths, governing, m.column, internal && panel.plastic, beta);
    panel.vmax = panel.mean * Math.max(...panel.f.flat());
    panel.vmin = panel.mean * Math.min(...panel.f.flat());
    const dx = m.column.x - column.x;
    const dy = m.column.y - column.y;
    panel.local = p => ({ x: p.x + dx, y: p.y + dy });
  }
  // Drop outline in column-relative coordinates (clipped at free slab edges).
  const h = result.input?.head;
  const dropOutline = head && h?.enabled
    ? (h.shape === 'circular'
      ? Array.from({ length: 48 }, (_, i) => ({ x: (h.diameter / 2) * Math.cos((i * Math.PI) / 24), y: (h.diameter / 2) * Math.sin((i * Math.PI) / 24) }))
      : [{ x: head.extents.xMin, y: head.extents.yMin }, { x: head.extents.xMax, y: head.extents.yMin }, { x: head.extents.xMax, y: head.extents.yMax }, { x: head.extents.xMin, y: head.extents.yMax }])
    : null;
  // Colour and height follow v_Ed only; each panel is scaled to its own perimeter (plan sizes differ).
  const vTop = Math.max(...panels.map(panel => panel.vmax));
  const cols = panels.length;
  const panelW = width / cols;
  for (const panel of panels) {
    const outlineReach = panel.name !== 'u0' && dropOutline ? dropOutline.map(q => Math.hypot(q.x, q.y)) : [];
    const reach = Math.max(...panel.paths.flat().map(p => Math.hypot(panel.local(p).x, panel.local(p).y)), ...outlineReach, 1);
    panel.s = (panelW * 0.4) / (reach * Math.SQRT2 * Math.cos(Math.PI / 6));
    panel.halfH = reach * Math.SQRT2 * 0.5 * panel.s;
  }
  const zScale = 70 / vTop;
  const top = 34;
  const halfH = Math.max(...panels.map(panel => panel.halfH));
  const baseY = top + 96 + halfH;
  const height = Math.round(baseY + halfH + 96);
  const parts = [];
  const cos = Math.cos(Math.PI / 6);
  const sin = Math.sin(Math.PI / 6);
  panels.forEach((panel, index) => {
    const ox = panelW * index + panelW / 2;
    const ps = panel.s;
    // isoAt: column-relative point; iso: point in the panel's section frame (shifted to the column).
    const isoAt = (q, z) => [ox + (q.x + q.y) * cos * ps, baseY + (q.x - q.y) * sin * ps - z * zScale];
    const iso = (p, z) => isoAt(panel.local(p), z);
    // Column footprint and axis.
    const c = column.shape === 'circular' ? null : [[-column.cx / 2, -column.cy / 2], [column.cx / 2, -column.cy / 2], [column.cx / 2, column.cy / 2], [-column.cx / 2, column.cy / 2]];
    if (c) parts.push(`<path d="M${c.map(([x, y]) => isoAt({ x, y }, 0).map(n).join(' ')).join('L')}Z" fill="#eceeef" stroke="${COLORS.ink}" stroke-width=".8"/>`);
    else {
      const ring = Array.from({ length: 36 }, (_, i) => isoAt({ x: (column.diameter / 2) * Math.cos((i * Math.PI) / 18), y: (column.diameter / 2) * Math.sin((i * Math.PI) / 18) }, 0));
      parts.push(`<path d="M${ring.map(p => p.map(n).join(' ')).join('L')}Z" fill="#eceeef" stroke="${COLORS.ink}" stroke-width=".8"/>`);
    }
    if (dropOutline && panel.name !== 'u0') {
      // Drop outline (hidden, below the slab), as on the plan; not on the u0 panel (column scale).
      parts.push(`<path d="M${dropOutline.map(q => isoAt(q, 0).map(n).join(' ')).join('L')}Z" fill="none" stroke="${COLORS.drop}" stroke-width=".9" stroke-dasharray="${DASH.hidden}"/>`);
    }
    // Fence segments, back to front.
    const segments = [];
    panel.paths.forEach((path, j) => {
      for (let i = 1; i < path.length; i += 1) {
        const v0 = panel.mean * panel.f[j][i - 1];
        const v1 = panel.mean * panel.f[j][i];
        const b0 = iso(path[i - 1], 0);
        const b1 = iso(path[i], 0);
        segments.push({ depth: (b0[1] + b1[1]) / 2, b0, b1, t0: iso(path[i - 1], v0), t1: iso(path[i], v1), v: (v0 + v1) / 2, tick: i % 3 === 0 });
      }
    });
    segments.sort((a, b) => a.depth - b.depth);
    for (const seg of segments) {
      parts.push(`<path d="M${n(seg.b0[0])} ${n(seg.b0[1])}L${n(seg.b1[0])} ${n(seg.b1[1])}L${n(seg.t1[0])} ${n(seg.t1[1])}L${n(seg.t0[0])} ${n(seg.t0[1])}Z" fill="${colour(seg.v / vTop)}" fill-opacity=".78" stroke="${colour(seg.v / vTop)}" stroke-width=".4"/>`);
      if (seg.tick) parts.push(`<line x1="${n(seg.b0[0])}" y1="${n(seg.b0[1])}" x2="${n(seg.t0[0])}" y2="${n(seg.t0[1])}" stroke="${COLORS.ink}" stroke-width=".35" stroke-opacity=".55"/>`);
      parts.push(`<line x1="${n(seg.t0[0])}" y1="${n(seg.t0[1])}" x2="${n(seg.t1[0])}" y2="${n(seg.t1[1])}" stroke="${COLORS.ink}" stroke-width=".8"/>`);
      parts.push(`<line x1="${n(seg.b0[0])}" y1="${n(seg.b0[1])}" x2="${n(seg.b1[0])}" y2="${n(seg.b1[1])}" stroke="${COLORS.ink}" stroke-width=".5" stroke-dasharray="3 2"/>`);
    }
    // V_Ed arrow at the column centre.
    const [ax, ay] = iso({ x: 0, y: 0 }, 0);
    parts.push(`<line x1="${n(ax)}" y1="${n(ay - 70)}" x2="${n(ax)}" y2="${n(ay - 8)}" stroke="${COLORS.ink}" stroke-width="2"/><path d="M${n(ax - 4)} ${n(ay - 14)}L${n(ax)} ${n(ay - 4)}L${n(ax + 4)} ${n(ay - 14)}Z" fill="${COLORS.ink}"/><text x="${n(ax + 6)}" y="${n(ay - 60)}">V_Ed</text>`);
    // Labels.
    const tx = panelW * index + 10;
    const ty = baseY + halfH + 22;
    const varies = panel.vmax - panel.vmin > 1e-6;
    parts.push(`<text x="${n(tx)}" y="${top - 12}" style="font-weight:500">${esc(panel.name)} = ${panel.u.toFixed(0)} mm · d = ${panel.d.toFixed(0)}</text>`
      + `<text class="small" x="${n(tx)}" y="${n(ty)}">v = V_Ed/(u·d) = ${panel.mean.toFixed(3)} MPa</text>`
      + `<text class="small" x="${n(tx)}" y="${n(ty + 14)}">${varies ? `v_max = ${panel.vmax.toFixed(3)}, v_min = ${panel.vmin.toFixed(3)}` : `β·v = ${panel.vmax.toFixed(3)} MPa (uniform)`}</text>`
      + (panel.limit ? `<text class="small" x="${n(tx)}" y="${n(ty + 28)}">${esc(panel.limitName)} = ${panel.limit.toFixed(3)} MPa</text>` : ''));
  });
  // Colour scale.
  const ly = height - 34;
  const lw = Math.min(260, width - 200);
  const stops = Array.from({ length: 11 }, (_, i) => `<stop offset="${i * 10}%" stop-color="${colour(i / 10)}"/>`).join('');
  parts.push(`<defs><linearGradient id="v-ramp">${stops}</linearGradient></defs><rect x="14" y="${ly}" width="${lw}" height="8" fill="url(#v-ramp)"/>`
    + `<text class="small" x="14" y="${ly + 20}">0</text><text class="small" x="${14 + lw}" y="${ly + 20}" text-anchor="end">${vTop.toFixed(2)} MPa</text>`
    + `<text class="small" x="${24 + lw}" y="${ly + 8}">v_Ed · ${esc(governing.name)} · β = ${beta.toFixed(3)}${internal && String(governing.beta?.method ?? '').match(/6\.(39|42|43)/) ? ' · plastic distribution (Fig. 6.19)' : ' · uniform β envelope'}</text>`
    + `<text class="small" x="${24 + lw}" y="${ly + 22}">Panels not to the same plan scale.</text>`);
  return svgDocument(width, height, 'Shear stress along the control perimeters', parts.join(''));
}
