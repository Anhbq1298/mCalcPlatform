import { perimeterAtOffset } from './geometry.mjs';
import { classifyPosition, orthogonal } from './position.mjs';

export const SETBACK_LINKS_DETAIL = 'Concrete resistance is calculated for the setback connection. The required link layout needs a separate design.';

const lengthOf = ({ cx, cy }, sides, r) => {
  if (sides.length === 2) return cx + cy + Math.PI * r / 2;
  return (sides[0].startsWith('x') ? 2 * cx + cy : cx + 2 * cy) + Math.PI * r;
};

const sidesX = ['xMin', 'xMax'];
const sidesY = ['yMin', 'yMax'];
const edgeGroups = [...sidesX, ...sidesY].map(side => [side]);
const cornerGroups = sidesX.flatMap(x => sidesY.map(y => [x, y]));

// Figure 6.15: the runs parallel to the loaded faces end at the free edges.
// Extending the rectangle to those edges parameterises that path with the existing
// line and arc geometry. The actual loaded area remains the original rectangle.
export function setbackPerimeter(input, actual, r, dropSection = false) {
  const { column, slab } = input;
  if (actual.kind === 'invalid' || column.shape !== 'rectangular' || !orthogonal(column)) return null;
  const mandatory = Object.keys(actual.flush).filter(side => actual.flush[side]);
  const { xMin, xMax, yMin, yMax } = actual.box;
  const full = { shape: 'rectangular', rotation: 0, cx: xMax - xMin, cy: yMax - yMin };
  let best = { position: actual, column, sides: mandatory, length: mandatory.length ? lengthOf(full, mandatory, r) : perimeterAtOffset(column, r) };
  for (const group of [...edgeGroups, ...cornerGroups]) {
    if (group.length <= mandatory.length || mandatory.some(side => !group.includes(side))) continue;
    // The outer drop section uses a separate loaded-area approximation. Extra
    // free edges only participate where they intersect its offset perimeter.
    if (dropSection && group.some(side => Math.abs(slab[side] - actual.box[side]) > r)) continue;
    const bounds = { ...actual.box };
    for (const side of group) bounds[side] = slab[side];
    const projected = {
      ...full, cx: bounds.xMax - bounds.xMin, cy: bounds.yMax - bounds.yMin,
      x: (bounds.xMin + bounds.xMax) / 2, y: (bounds.yMin + bounds.yMax) / 2,
    };
    const length = lengthOf(projected, group, r);
    if (length >= best.length - 1e-6) continue;
    const kind = group.length === 2 ? 'corner' : 'edge';
    const parallelToY = group[0].startsWith('x');
    const position = { ...actual, kind, normals: classifyPosition(projected, slab).normals, c1: kind === 'corner' || parallelToY ? full.cx : full.cy, c2: kind === 'corner' || parallelToY ? full.cy : full.cx };
    best = { position, column: projected, sides: group, length, projected: true };
  }
  return best;
}
