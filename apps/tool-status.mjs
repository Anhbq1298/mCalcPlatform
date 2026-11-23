export function toolStatusBadge(tool) {
  if (!tool.labels?.includes('status.wip')) return null;
  const badge = document.createElement('span');
  badge.className = 'tool-wip';
  badge.textContent = 'WIP';
  badge.title = 'Work in progress';
  return badge;
}
