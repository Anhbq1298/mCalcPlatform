import { pathExtent } from './geometry.mjs';

const sign = side => side.endsWith('Min') ? -1 : 1;

export function slabOverhang({ column, slab }, side) {
  return sign(side) * (slab[side] - pathExtent(column, 0)[side]);
}

export function setSlabOverhang({ column, slab }, side, overhang) {
  slab[side] = pathExtent(column, 0)[side] + sign(side) * overhang;
}

export function overhangSides(state) {
  const position = state.column.position;
  if (position === 'internal') return [];
  const x = slabOverhang(state, 'xMin') < slabOverhang(state, 'xMax') ? 'xMin' : 'xMax';
  const y = slabOverhang(state, 'yMin') < slabOverhang(state, 'yMax') ? 'yMin' : 'yMax';
  if (position === 'corner') return [x, y];
  return [slabOverhang(state, y) < slabOverhang(state, x) ? y : x];
}
