import { maxLayers, newLayer, newTransverse } from './inputs.mjs';

export function mountLayers(root, getState, onChange) {
  const body = id => root.querySelector('#' + id + ' tbody');
  const add = root.querySelector('[data-add-layer]');
  const remove = root.querySelector('[data-remove-layer]');
  const addPair = root.querySelector('[data-add-pair]');
  const removePair = root.querySelector('[data-remove-pair]');

  function fill(table, layers, columns) {
    const tbody = body(table);
    tbody.replaceChildren();
    for (const [index, layer] of layers.entries()) {
      const mark = 'L' + (index + 1);
      const row = tbody.insertRow();
      row.insertCell().textContent = mark;
      for (const [key, title, min, max] of columns) {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = key === 'count' ? '1' : 'any';
        if (min !== undefined) input.min = min;
        if (max !== undefined) input.max = max;
        input.value = layer[key] ?? '';
        if (key === 'radius') input.placeholder = 'Auto';
        input.setAttribute('aria-label', mark + ' ' + title);
        row.insertCell().append(input);
        input.addEventListener('input', () => {
          layer[key] = key === 'radius' && !input.value && !input.validity.badInput ? null : input.valueAsNumber;
          onChange();
        });
      }
    }
  }

  function refresh() {
    const state = getState();
    const { layers, reinforcement, transverse } = state;
    const links = transverse === 'links';
    add.disabled = addPair.disabled = layers.length >= maxLayers;
    remove.disabled = removePair.disabled = layers.length <= 1;
    for (const radio of root.querySelectorAll('[name=transverse]')) radio.checked = radio.value === transverse;
    const spacing = links ? 'Link spacing (mm)' : 'Helix pitch (mm)';
    root.querySelector('#transverse-interval').textContent = links ? 'Spacing (mm)' : 'Pitch (mm)';
    fill('longitudinal-table', layers, [['count', 'Bars', 3, 300], ['bar', 'Bar Ø (mm)', 1]]);
    fill('coordinate-table', layers, [['offset', 'Angular offset (°)'], ['radius', 'Bar centre radius (mm)', 1]]);
    fill('transverse-table', reinforcement[transverse], [
      ['diameter', links ? 'Link Ø (mm)' : 'Helix Ø (mm)', 1], ['spacing', spacing, 1],
    ]);
  }

  function resize(event, increase) {
    const { layers, reinforcement } = getState();
    if (increase) {
      const index = layers.length;
      if (index >= maxLayers) return;
      layers.push(newLayer(index));
      reinforcement.links.push(newTransverse(index));
      reinforcement.spirals.push(newTransverse(index));
    } else {
      if (layers.length <= 1) return;
      layers.pop();
      reinforcement.links.pop();
      reinforcement.spirals.pop();
    }
    const table = event.currentTarget === addPair || event.currentTarget === removePair
      ? 'transverse-table' : 'longitudinal-table';
    refresh();
    onChange();
    body(table).lastElementChild?.querySelector('input').focus();
  }

  add.onclick = addPair.onclick = event => resize(event, true);
  remove.onclick = removePair.onclick = event => resize(event, false);
  for (const radio of root.querySelectorAll('[name=transverse]')) {
    radio.addEventListener('change', () => {
      getState().transverse = radio.value;
      refresh();
      onChange();
    });
  }
  return refresh;
}
