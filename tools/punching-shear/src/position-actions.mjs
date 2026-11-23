import { overhangSides } from './overhang.mjs';

export function positionActions(issue, state, focusField) {
  if (issue.code === 'set-back-beta') return [['Choose β method', () => focusField('Load increment factor $\\beta$', 'beta.method')]];
  if (issue.code !== 'set-back-slab-edge') return [];
  const side = overhangSides(state)[0];
  return side ? [['Edit slab overhang', () => focusField('Column', `overhang.${side}`)]]
    : [['Edit slab edges', () => focusField('Slab', 'slab.xMin')]];
}
