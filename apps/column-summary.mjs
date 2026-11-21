const formatRatio = ratio => Number.isFinite(ratio) ? ratio.toFixed(3) : ratio === Infinity ? '∞' : '—';

export function governingRow(rows, getRatio) {
  return rows.reduce((worst, row) => !worst || getRatio(row) > getRatio(worst) ? row : worst, null);
}

export function renderColumnSummary(panel, checks = [], message = 'Awaiting results') {
  const governing = governingRow(checks.filter(row => row.isUR && row.ratio != null), row => row.ratio);
  const incomplete = checks.some(row => row.status === 'incomplete');
  const failed = checks.some(row => row.status === 'fail');
  const status = failed ? 'fail' : incomplete ? 'incomplete' : 'pass';
  const statusLabel = failed ? 'FAIL' : incomplete ? 'INCOMPLETE' : 'PASS';

  const headline = document.createElement('div');
  headline.className = 'column-summary-verdict';
  if (governing) {
    const ratio = document.createElement('strong');
    ratio.dataset.overallUr = '';
    ratio.dataset.tone = status;
    ratio.textContent = formatRatio(governing.ratio);
    const badge = document.createElement('span');
    badge.dataset.tone = status;
    badge.textContent = statusLabel;
    headline.append(ratio, badge);
  }
  const note = document.createElement('p');
  note.className = 'column-summary-note';
  note.textContent = governing
    ? (incomplete ? 'Governing available UR · ' : 'Governing UR · ') + governing.label + (governing.detail ? ' · ' + governing.detail : '')
    : message;
  panel.replaceChildren(headline, note);
  if (!checks.length) return;

  const table = document.createElement('table');
  table.className = 'column-summary-table';
  const header = table.createTHead().insertRow();
  for (const title of ['Check', 'UR / ratio', 'Status']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = title;
    header.append(cell);
  }
  const body = table.createTBody();
  for (const check of checks) {
    const row = body.insertRow();
    if (check === governing) row.className = 'column-summary-governing';
    const label = document.createElement('th');
    label.scope = 'row';
    label.textContent = check.label;
    if (check.detail) {
      const detail = document.createElement('small');
      detail.textContent = check.detail;
      label.append(detail);
    }
    row.append(label);
    row.insertCell().textContent = formatRatio(check.ratio);
    const cell = row.insertCell();
    cell.dataset.tone = check.status;
    cell.textContent = check.statusLabel ?? { pass: 'Pass', fail: 'Fail', incomplete: 'Unavailable', off: 'Off' }[check.status];
  }
  panel.append(table);
}

export function resistanceRow(label, ratio, detail) {
  return { label, ratio, detail, isUR: true, status: ratio == null ? 'incomplete' : ratio <= 1 ? 'pass' : 'fail' };
}
