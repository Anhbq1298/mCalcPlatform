import { renderColumnSummary } from '../../../apps/column-summary.mjs';

const groupNames = { Plate: 'Steel plate' };
const order = ['Analysis validity', 'Load path', 'Steel plate', 'Welded bars', 'Headed studs', 'Concrete', 'Interaction'];

export function renderBreakoutSummary(panel, checks = [], message) {
  const groups = new Map(order.map(group => [group, []]));
  for (const check of checks) {
    const group = groupNames[check.group] ?? check.group;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ ...check, statusLabel: check.status === 'incomplete' ? 'Incomplete' : undefined });
  }
  const grouped = [...groups.values()].flat();
  renderColumnSummary(panel, grouped, message, 'UR');
  const body = panel.querySelector('tbody');
  if (!body) return;
  const rows = [...body.rows];
  let index = 0;
  for (const [group, items] of groups) {
    if (!items.length) continue;
    const heading = document.createElement('tr');
    heading.className = 'check-group';
    const cell = document.createElement('th');
    cell.colSpan = 3;
    cell.textContent = group;
    heading.append(cell);
    body.insertBefore(heading, rows[index]);
    for (const check of items) {
      if (check.ref) {
        const ref = document.createElement('small');
        ref.className = 'check-code';
        ref.textContent = check.ref;
        rows[index].cells[0].append(ref);
      }
      index++;
    }
  }
}
