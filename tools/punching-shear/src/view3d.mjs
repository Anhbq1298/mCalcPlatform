// Interactive 3D geometry on a 2D canvas (no dependency). Orbit: drag. Pan: Shift+drag or right
// drag. Zoom: wheel. Geometry is schematic; no stress distribution is drawn.
import { pathPolyline, toGlobal } from './geometry.mjs';
import { COLORS } from './svg.mjs';

export function mountView3d(canvas, controls) {
  const camera = { yaw: -0.75, pitch: 0.55, zoom: 1, panX: 0, panY: 0 };
  let scene = null;
  let drag = null;
  const reset = () => Object.assign(camera, { yaw: -0.75, pitch: 0.55, zoom: 1, panX: 0, panY: 0 });

  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    drag = { x: event.clientX, y: event.clientY, pan: event.shiftKey || event.button === 2 };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.pan) { camera.panX += dx; camera.panY += dy; } else {
      camera.yaw += dx * 0.01;
      camera.pitch = Math.max(-1.45, Math.min(1.45, camera.pitch + dy * 0.01));
    }
    draw();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    camera.zoom = Math.max(0.2, Math.min(8, camera.zoom * Math.exp(-event.deltaY * 0.0012)));
    draw();
  }, { passive: false });
  controls.reset?.addEventListener('click', () => { reset(); draw(); });
  for (const input of [controls.opacity, controls.links, controls.perimeters, controls.loads, controls.layer]) input?.addEventListener('input', draw);

  function project(p, size, radius) {
    const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
    const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
    const x = p.x * cy - p.y * sy;
    const y = p.x * sy + p.y * cy;
    const depth = y * cp + p.z * sp;
    const up = -y * sp + p.z * cp;
    const distance = radius * 3.2;
    const f = (size.min * 0.62 * camera.zoom * distance) / radius / (distance - depth);
    return { x: size.w / 2 + camera.panX + x * f, y: size.h / 2 + camera.panY - up * f, depth };
  }

  function draw() {
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!scene) return;
    const size = { w, h, min: Math.min(w, h) };
    const P = point => project({ x: point.x - scene.cx, y: point.y - scene.cy, z: point.z - scene.cz }, size, scene.radius);
    const faces = [];
    const alpha = Number(controls.opacity?.value ?? 0.25);
    for (const face of scene.faces) {
      const pts = face.points.map(P);
      faces.push({ ...face, pts, depth: pts.reduce((sum, p) => sum + p.depth, 0) / pts.length, alpha: face.kind === 'slab' ? alpha : face.alpha });
    }
    faces.sort((a, b) => a.depth - b.depth);
    for (const face of faces) {
      ctx.beginPath();
      face.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.globalAlpha = face.alpha;
      ctx.fillStyle = face.fill;
      ctx.fill();
      ctx.globalAlpha = Math.min(1, face.alpha + 0.35);
      ctx.strokeStyle = face.stroke;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const showLayer = controls.layer?.value ?? 'all';
    for (const line of scene.lines) {
      if (line.kind === 'link' && (!controls.links?.checked || (showLayer !== 'all' && line.layer !== showLayer))) continue;
      if (line.kind === 'perimeter' && !controls.perimeters?.checked) continue;
      if (line.kind === 'load' && !controls.loads?.checked) continue;
      ctx.beginPath();
      line.points.map(P).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.width;
      ctx.setLineDash(line.dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
      if (line.label) {
        const p = P(line.points.at(-1));
        ctx.fillStyle = line.color;
        ctx.font = '11px Roboto, system-ui, sans-serif';
        ctx.fillText(line.label, p.x + 4, p.y - 4);
      }
    }
    triad(ctx, size);
  }

  function triad(ctx, size) {
    const origin = { x: 34, y: size.h - 30 };
    const axis = (v, label, color) => {
      const p = project(v, { w: 0, h: 0, min: 60 }, 1);
      const q = { x: origin.x + (p.x - camera.panX) * 0.9, y: origin.y + (p.y - camera.panY) * 0.9 };
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      ctx.font = '11px Roboto, system-ui, sans-serif'; ctx.fillText(label, q.x + 2, q.y - 2);
    };
    const zoom = camera.zoom;
    camera.zoom = 1;
    axis({ x: 1, y: 0, z: 0 }, 'X', '#a12420');
    axis({ x: 0, y: 1, z: 0 }, 'Y', '#22623e');
    axis({ x: 0, y: 0, z: 1 }, 'Z', '#2b3a8c');
    camera.zoom = zoom;
  }

  return {
    update(result) { scene = result ? buildScene(result) : null; draw(); },
    draw,
  };
}

function prism(outline, z0, z1, style) {
  const faces = [{ ...style, points: outline.map(p => ({ ...p, z: z0 })) }, { ...style, points: outline.map(p => ({ ...p, z: z1 })) }];
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length];
    faces.push({ ...style, points: [{ ...p, z: z0 }, { ...q, z: z0 }, { ...q, z: z1 }, { ...p, z: z1 }] });
  });
  return faces;
}

export function buildScene(result) {
  const { column, slab: slabInput, openings = [] } = result.input;
  const h = slabInput.h;
  const d = result.section?.d ?? 0;
  const layers = result.layout?.layers ?? [];
  const aOut = result.envelope?.uOut ? result.envelope.aOut : 0;
  const reach = Math.max(2 * d, aOut, ...layers.map(layer => layer.offset), 300);
  const half = (column.shape === 'circular' ? column.diameter / 2 : Math.max(column.cx, column.cy) / 2) + reach + 300;
  const box = { x0: Math.max(slabInput.xMin, column.x - half), x1: Math.min(slabInput.xMax, column.x + half), y0: Math.max(slabInput.yMin, column.y - half), y1: Math.min(slabInput.yMax, column.y + half) };
  const faces = [];
  const lines = [];
  const slabStyle = { kind: 'slab', fill: '#cfd8d4', stroke: '#6f7c78', alpha: 0.25 };
  faces.push(...prism([{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }], 0, h, slabStyle));
  const outline = column.shape === 'circular' ? pathPolyline(column, 0).filter((_, i) => i % 6 === 0) : [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => toGlobal(column, { x: sx * column.cx / 2, y: sy * column.cy / 2 }));
  const columnStyle = { kind: 'column', fill: '#9aa6a2', stroke: '#3c4744', alpha: 0.85 };
  faces.push(...prism(outline, -2.5 * h, 0, columnStyle), ...prism(outline, h, 2.2 * h, columnStyle));
  for (const opening of openings) {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: opening.x + sx * opening.w / 2, y: opening.y + sy * opening.h / 2 }));
    faces.push(...prism(corners, -1, h + 1, { kind: 'opening', fill: '#f3d6d4', stroke: COLORS.opening, alpha: 0.6 }));
  }
  const at = (points, z) => points.map(p => ({ ...p, z }));
  if (d > 0) lines.push({ kind: 'perimeter', points: at(pathPolyline(column, 2 * d), h + 1), color: COLORS.u1, width: 1.5, dash: [6, 3], label: 'u1' });
  if (aOut > 0) lines.push({ kind: 'perimeter', points: at(pathPolyline(column, aOut), h + 1), color: COLORS.uout, width: 1.5, dash: [8, 4], label: 'u_out,ef' });
  const cover = slabInput.cover || 25;
  for (const link of result.layout?.links ?? []) {
    for (const leg of link.legs) {
      lines.push({ kind: 'link', layer: link.layerId, points: [{ x: leg.x, y: leg.y, z: cover }, { x: leg.x, y: leg.y, z: h - cover }], color: leg.effective ? COLORS.steel : COLORS.fail, width: 2 });
    }
    if (link.legs.length === 2) lines.push({ kind: 'link', layer: link.layerId, points: link.legs.map(leg => ({ x: leg.x, y: leg.y, z: h - cover })), color: COLORS.steel, width: 1.2 });
  }
  const load = result.loads?.find(entry => entry.name === result.governing?.load) ?? result.loads?.[0];
  if (load) {
    const top = 2.2 * h;
    const length = Math.max(400, 2.5 * h);
    const c = { x: column.x, y: column.y };
    lines.push({ kind: 'load', points: [{ ...c, z: top + length }, { ...c, z: top }], color: COLORS.fail, width: 2.5, label: `V_Ed = ${load.V.toFixed(0)} kN` });
    lines.push({ kind: 'load', points: [{ x: c.x - 40, y: c.y, z: top + 80 }, { ...c, z: top }, { x: c.x + 40, y: c.y, z: top + 80 }], color: COLORS.fail, width: 2.5 });
    for (const [M, axis, label] of [[load.Mx, 'x', 'M_x'], [load.My, 'y', 'M_y']]) {
      if (!M) continue;
      const r = 0.6 * length;
      const arc = [];
      for (let i = 0; i <= 24; i += 1) {
        const t = (Math.PI * 1.5 * i) / 24 * Math.sign(M);
        arc.push(axis === 'x' ? { x: c.x, y: c.y + r * Math.cos(t), z: top + 0.5 * length + r * Math.sin(t) } : { x: c.x + r * Math.cos(t), y: c.y, z: top + 0.5 * length + r * Math.sin(t) });
      }
      lines.push({ kind: 'load', points: arc, color: '#8a510d', width: 2, label: `${label} = ${M.toFixed(0)} kNm` });
    }
  }
  const radius = Math.hypot(box.x1 - box.x0, box.y1 - box.y0, 5 * h) / 2;
  return { faces, lines, radius, cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2, cz: h / 2 };
}
