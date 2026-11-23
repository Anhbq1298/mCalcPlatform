import { overhangSides } from './overhang.mjs';
import { classifyPosition } from './position.mjs';

export function positionActions(issue, state, focusField, applyPosition) {
  if (issue.code === 'set-back-beta') return [['Choose β method', () => focusField('Load increment factor $\\beta$', 'beta.method')]];
  if (!['column-position-mismatch', 'set-back-slab-edge'].includes(issue.code)) return [];
  const side = overhangSides(state)[0];
  const actions = side ? [['Edit slab overhang', () => focusField('Column', `overhang.${side}`)]] : [];
  if (issue.code === 'set-back-slab-edge') return actions;
  const detected = classifyPosition(state.column, state.slab);
  if (detected.kind !== issue.detectedPosition || detected.kind === state.column.position) return [];
  const name = detected.kind === 'internal' ? 'interior' : detected.kind;
  actions.push([`Use ${name} position`, () => {
    // Apply only the position still indicated by the geometry at click time.
    if (classifyPosition(state.column, state.slab).kind !== detected.kind) return;
    state.column.position = detected.kind;
    applyPosition();
  }], ['Review slab edges', () => focusField('Slab', 'slab.xMin')]);
  return actions;
}
