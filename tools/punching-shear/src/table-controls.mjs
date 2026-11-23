// Editable row tables (load combinations, openings, link layers) using the layer-table styles of
// mConcreteCircCol. Columns: [key, header, type ('number' | 'text' | 'select'), options]. Headers may
// contain $…$ LaTeX spans.
import { labelHtml, labelText } from './tex.mjs';

export function mountTable(container, { caption, columns, getRows, newRow, onChange, minRows = 0, addLabel, removeLabel, rowLabel, onEdit }) {
  const table = document.createElement('table');
  table.className = 'layer-table';
  const head = table.createTHead().insertRow();
  for (const title of ['', ...columns.map(column => column[1])]) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.innerHTML = labelHtml(title);
    head.append(cell);
  }
  const body = table.createTBody();
  const buttons = document.createElement('div');
  buttons.className = 'layer-buttons';
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = addLabel;
  add.setAttribute('aria-label', caption + ': add row');
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = removeLabel;
  remove.setAttribute('aria-label', caption + ': remove last row');
  buttons.append(add, remove);
  container.append(table, buttons);

  add.addEventListener('click', () => {
    const rows = getRows();
    rows.push(newRow(rows.length, rows.at(-1)));
    refresh();
    onChange();
  });
  remove.addEventListener('click', () => {
    const rows = getRows();
    if (rows.length > minRows) rows.pop();
    refresh();
    onChange();
  });
  body.addEventListener('input', event => {
    const control = event.target;
    const index = Number(control.dataset.row);
    const column = columns.find(entry => entry[0] === control.dataset.key);
    if (!column) return;
    const rows = getRows();
    rows[index][column[0]] = column[2] === 'number' ? control.valueAsNumber : column[2] === 'select' && typeof column[3][0].value === 'number' ? Number(control.value) : control.value;
    onEdit?.(index, column[0]);
    onChange();
  });

  function refresh() {
    const rows = getRows();
    const focused = document.activeElement;
    const focusKey = focused?.dataset?.key && body.contains(focused) ? focused.dataset.key + ':' + focused.dataset.row : null;
    body.replaceChildren();
    rows.forEach((entry, index) => {
      const row = body.insertRow();
      const label = document.createElement('th');
      label.scope = 'row';
      label.textContent = rowLabel(index);
      row.append(label);
      for (const [key, header, type, options] of columns) {
        let control;
        if (type === 'select') {
          control = document.createElement('select');
          for (const item of options) control.append(new Option(item.label, String(item.value)));
          control.value = String(entry[key]);
        } else {
          control = document.createElement('input');
          control.type = type;
          if (type === 'number') control.step = 'any';
          control.value = entry[key] ?? '';
        }
        control.dataset.key = key;
        control.dataset.row = String(index);
        control.setAttribute('aria-label', `${rowLabel(index)} ${labelText(header)}`);
        row.insertCell().append(control);
        if (focusKey === key + ':' + index) queueMicrotask(() => control.focus());
      }
    });
    remove.disabled = rows.length <= minRows;
  }
  return refresh;
}
