// Column position from geometry: internal, edge (one slab edge flush with a column face) or corner
// (two adjacent edges flush). EN 1992-1-1 Fig. 6.20 and Eq. 6.44–6.46 cover rectangular columns whose
// faces coincide with the slab edges, so other near-edge layouts are reported as unsupported.
import { pathExtent } from './geometry.mjs';

const TOL = 1; // mm

export function orthogonal(column) {
  const turn = (((column.rotation || 0) % 90) + 90) % 90;
  return turn < 1e-9 || 90 - turn < 1e-9;
}

export function classifyPosition(column, slab) {
  const box = pathExtent(column, 0);
  if (box.xMin < slab.xMin - TOL || box.xMax > slab.xMax + TOL || box.yMin < slab.yMin - TOL || box.yMax > slab.yMax + TOL) {
    return { kind: 'invalid', message: 'The column lies partly outside the slab.' };
  }
  const flush = {
    xMin: Math.abs(box.xMin - slab.xMin) <= TOL, xMax: Math.abs(box.xMax - slab.xMax) <= TOL,
    yMin: Math.abs(box.yMin - slab.yMin) <= TOL, yMax: Math.abs(box.yMax - slab.yMax) <= TOL,
  };
  const normals = [];
  if (flush.xMin) normals.push({ x: 1, y: 0, edge: 'xMin' });
  if (flush.xMax) normals.push({ x: -1, y: 0, edge: 'xMax' });
  if (flush.yMin) normals.push({ x: 0, y: 1, edge: 'yMin' });
  if (flush.yMax) normals.push({ x: 0, y: -1, edge: 'yMax' });
  const dx = box.xMax - box.xMin;
  const dy = box.yMax - box.yMin;
  const base = { flush, normals, box, dx, dy };
  if (!normals.length) return { ...base, kind: 'internal' };
  if (column.shape === 'circular') return { ...base, kind: 'invalid', message: 'Circular columns at slab edges are not covered by EN 1992-1-1 Fig. 6.20.' };
  if (!orthogonal(column)) return { ...base, kind: 'invalid', message: 'Edge and corner columns must have faces parallel to the slab edges (rotation 0°, 90°, 180° or 270°).' };
  if ((flush.xMin && flush.xMax) || (flush.yMin && flush.yMax) || normals.length > 2) {
    return { ...base, kind: 'invalid', message: 'The column spans the full slab width; this is not a punching configuration.' };
  }
  if (normals.length === 1) {
    const alongX = normals[0].x !== 0;
    // c1 is perpendicular to the free edge, c2 parallel to it (Fig. 6.20 a).
    return { ...base, kind: 'edge', c1: alongX ? dx : dy, c2: alongX ? dy : dx };
  }
  return { ...base, kind: 'corner', c1: dx, c2: dy };
}

// Reduced basic control perimeter u1* (Fig. 6.20) and loaded perimeter u0 (§6.4.5(3)).
export function edgePerimeters(position, d) {
  if (position.kind === 'edge') {
    const a = Math.min(1.5 * d, 0.5 * position.c1);
    return { u1Star: 2 * a + position.c2 + 2 * Math.PI * d, u0: Math.min(position.c2 + 3 * d, position.c2 + 2 * position.c1), a };
  }
  if (position.kind === 'corner') {
    const a = Math.min(1.5 * d, 0.5 * position.c1);
    const b = Math.min(1.5 * d, 0.5 * position.c2);
    return { u1Star: a + b + Math.PI * d, u0: Math.min(3 * d, position.c1 + position.c2), a, b };
  }
  return null;
}

// Eq. 6.45: W1 for an edge column with eccentricity parallel to the edge (c1 ⊥ edge, c2 ∥ edge).
export function sectionModulusEdge(c1, c2, d) {
  return (c2 * c2) / 4 + c1 * c2 + 4 * c1 * d + 8 * d * d + Math.PI * d * c2;
}
