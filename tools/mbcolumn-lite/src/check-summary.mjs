import { governingRow, renderColumnSummary, resistanceRow } from '../../../apps/column-summary.mjs';

export function renderRectangularSummary(result, slenderness, loads, shearEnabled, message) {
  const panel = document.getElementById('column-check-summary');
  if (!result) {
    renderColumnSummary(panel, [], message);
    return;
  }

  const pmm = result.results[result.govIndex];
  const checks = [resistanceRow('P–Mx–My interaction', pmm?.ratio, pmm?.name)];
  for (const axis of ['x', 'y']) {
    const direction = axis.toUpperCase();
    if (shearEnabled) {
      const rows = (result.shear ?? []).filter(row => row.axis === axis);
      const worst = governingRow(rows.filter(row => !row.error), row => row.ratio);
      const error = result.shearError ?? rows.find(row => row.error)?.error;
      const check = resistanceRow('Shear ' + direction, worst?.ratio, error ?? worst?.name);
      if (error && check.status !== 'fail') check.status = 'incomplete';
      checks.push(check);
    } else {
      checks.push({ label: 'Shear ' + direction, status: 'off' });
    }
  }
  for (const axis of ['x', 'y']) {
    const label = 'Slenderness ' + axis.toUpperCase();
    if (!slenderness) {
      checks.push({ label, status: 'off', hideRatio: true });
      continue;
    }
    const rows = slenderness.map((result, index) => ({
      ratio: result[axis].lambda / result[axis].lambdaLim,
      slender: result[axis].slender, name: loads[index]?.name,
    }));
    const worst = governingRow(rows, row => row.ratio);
    checks.push({
      label, detail: worst?.name, hideRatio: true,
      status: worst ? (worst.slender ? 'second-order' : 'pass') : 'incomplete',
      statusLabel: worst ? (worst.slender ? 'Slender' : 'Non-slender') : 'Input required',
    });
  }
  renderColumnSummary(panel, checks, undefined, 'UR');
}
