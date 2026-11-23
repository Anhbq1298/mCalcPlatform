import { LOAD_KEYS } from './loads.mjs';

export function renderLoads(host, result) {
  host.replaceChildren();
  if (!result.loadingResult) return;
  const { point, applied, atOrigin } = result.loadingResult;
  const title = document.createElement('p');
  title.textContent = `Loads at P (${point.x}, ${point.y}, ${point.z}) mm and equivalent loads at O`;
  const table = document.createElement('table');
  table.className = 'column-summary-table spatial-loads';
  const labels = ['Component', 'At P', 'At O'];
  const head = table.createTHead().insertRow();
  for (const label of labels) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    head.append(th);
  }
  const body = table.createTBody();
  for (const [i, key] of LOAD_KEYS.entries()) {
    const tr = body.insertRow();
    tr.insertCell().textContent = key + (i < 3 ? ' (kN)' : ' (kN·m)');
    for (const item of [applied, atOrigin]) tr.insertCell().textContent = Number(item[key].toPrecision(7)).toString();
  }
  host.append(title, table);
}
