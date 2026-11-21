import { shearBasis, shearScope } from './shear.mjs';

export const shearColumns = ['Case', 'Dir.', 'VEd (kN)', 'cot θ', 'VRd,link (kN)', 'VRd,strut (kN)', 'Asw/s req. (mm²/m)', 'Utilization', 'Governs'];
const fmt = (value, digits = 1) => value.toFixed(digits);

export function shearReportRows(results) {
  return results?.map(row => row.error
    ? [row.name, row.axis.toUpperCase(), fmt(row.shear), '—', '—', '—', '—', '—', row.error]
    : [row.name, row.axis.toUpperCase(), fmt(row.shear), fmt(row.cot, 3), fmt(row.linksCapacity),
      fmt(row.strutCapacity), fmt(row.requiredAswPerM, 0), fmt(row.ratio, 3), row.governs]) ?? [];
}

export function renderShearResults(results, error) {
  const panel = document.getElementById('column-shear-results');
  panel.hidden = !results?.length && !error;
  panel.replaceChildren();
  if (panel.hidden) return;
  const title = document.createElement('h2');
  title.textContent = 'Directional shear';
  const basis = document.createElement('p');
  basis.className = 'hint';
  basis.textContent = error ?? shearBasis;
  panel.append(title, basis);
  if (error) return;
  const wrap = document.createElement('div');
  wrap.className = 'tablewrap';
  const table = document.createElement('table');
  const header = table.createTHead().insertRow();
  for (const name of shearColumns) {
    const cell = document.createElement('th');
    cell.textContent = name;
    header.append(cell);
  }
  const body = table.createTBody();
  const output = shearReportRows(results);
  output.forEach((values, i) => {
    const row = body.insertRow();
    for (const value of values) row.insertCell().textContent = value;
    const result = results[i];
    if (result.error || result.ratio > 1) row.cells[7].style.fontWeight = 'bold';
  });
  wrap.append(table);
  const scope = document.createElement('p');
  scope.className = 'hint';
  scope.textContent = shearScope;
  panel.append(wrap, scope);
}
