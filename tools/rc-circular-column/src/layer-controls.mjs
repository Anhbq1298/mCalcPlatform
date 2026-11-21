import { layerColumns, maxLayers, newLayer } from './inputs.mjs';

export function mountLayers(element, getState, onChange) {
  const body = element.querySelector('tbody');
  const add = element.querySelector('[data-add-layer]');
  const remove = element.querySelector('[data-remove-layer]');
  function refresh() {
    const values = getState();
    element.hidden = values.transverse !== 'links';
    if (element.hidden) return;
    add.disabled = values.layers.length >= maxLayers;
    remove.disabled = values.layers.length <= 1;
    body.replaceChildren();
    values.layers.forEach((layer, index) => {
      const mark = 'L' + (index + 1);
      const row = body.insertRow();
      row.insertCell().textContent = mark;
      for (const [key, title, min, max] of layerColumns) {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = min;
        if (max !== undefined) input.max = max;
        input.step = key === 'count' ? '1' : 'any';
        input.value = layer[key];
        input.setAttribute('aria-label', mark + ' ' + title);
        row.insertCell().append(input);
        input.addEventListener('input', () => {
          getState().layers[index][key] = input.valueAsNumber;
          onChange();
        });
      }
    });
  }
  add.onclick = () => {
    const { layers } = getState();
    if (layers.length >= maxLayers) return;
    layers.push(newLayer(layers.length));
    refresh();
    onChange();
    body.lastElementChild?.querySelector('input').focus();
  };
  remove.onclick = () => {
    const { layers } = getState();
    if (layers.length <= 1) return;
    layers.pop();
    refresh();
    onChange();
    body.lastElementChild?.querySelector('input').focus();
  };
  return refresh;
}
