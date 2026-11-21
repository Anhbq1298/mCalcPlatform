function button(label, title, action) {
  const el = document.createElement('button');
  el.type = 'button'; el.textContent = label; el.setAttribute('aria-label', title);
  el.addEventListener('click', action);
  return el;
}

export function mountLayerTables(form, getState, changed) {
  const containers = {};
  for (const [key, title] of [['longitudinal', 'Longitudinal reinforcement'], ['transverse', 'Transverse reinforcement — circular closed links']]) {
    const group = document.createElement('fieldset'), legend = document.createElement('legend');
    legend.textContent = title; group.append(legend); form.append(group); containers[key] = group;
  }
  function render() {
    const state = getState();
    for (const key of ['longitudinal', 'transverse']) {
      const group = containers[key];
      while (group.children.length > 1) group.lastChild.remove();
      const table = document.createElement('table'); table.className = 'layer-table';
      table.setAttribute('aria-label', key === 'longitudinal' ? 'Longitudinal layers' : 'Transverse link layers');
      const titles = key === 'longitudinal' ? ['Layer', 'Bars', 'Ø mm', 'Angle °', 'Radial clear mm', ''] : ['Layer', 'Link Ø mm', 'Vertical spacing mm', ''];
      const head = table.createTHead().insertRow();
      titles.forEach(title => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; head.append(th); });
      const body = table.createTBody();
      state[key].forEach((layer, i) => {
        const row = body.insertRow();
        const id = key === 'longitudinal' ? layer.id : layer.layer;
        row.insertCell().textContent = id;
        const keys = key === 'longitudinal' ? ['count', 'diameter', 'angle', 'radialClear'] : ['diameter', 'spacing'];
        keys.forEach(field => {
          const cell = row.insertCell(), input = document.createElement('input');
          input.type = 'number'; input.step = field === 'count' ? '1' : 'any';
          input.setAttribute('aria-label', `${id} ${key} ${field}`);
          if (field !== 'angle') input.min = field === 'count' ? '4' : field === 'radialClear' ? '0' : '0.01';
          input.value = layer[field] ?? '';
          if (field === 'radialClear') { input.placeholder = i ? 'Auto' : '—'; input.disabled = i === 0; }
          input.addEventListener('input', () => {
            layer[field] = field === 'radialClear' && input.value === '' ? null : input.valueAsNumber;
            changed();
          });
          cell.append(input);
        });
        const remove = button('−', 'Remove ' + id + ' ' + key + ' layer', () => {
          state[key].splice(i, 1);
          if (key === 'longitudinal') state.transverse = state.transverse.filter(link => link.layer !== id);
          render(); changed();
        });
        remove.disabled = key === 'longitudinal' && state.longitudinal.length === 1;
        row.insertCell().append(remove);
      });
      group.append(table);
      const add = button('+', 'Add ' + key + ' layer', () => {
        if (key === 'longitudinal') {
          let i = 1;
          while (state.longitudinal.some(layer => layer.id === 'L' + i)) i++;
          state.longitudinal.push({ id: 'L' + i, count: 12, diameter: 25, angle: 0, radialClear: null });
        } else {
          const layer = state.longitudinal.find(layer => !state.transverse.some(link => link.layer === layer.id));
          if (layer) state.transverse.push({ layer: layer.id, diameter: 12, spacing: 150 });
        }
        render(); changed();
      });
      add.disabled = key === 'longitudinal' ? state.longitudinal.length >= 12
        : state.transverse.length >= state.longitudinal.length;
      group.append(add);
      const note = document.createElement('p');
      note.textContent = key === 'longitudinal'
        ? 'Outside → inside. Radial clear: blank uses the §8.2 minimum for adjacent bar diameters. Angle rotates bars in the section. Add a corresponding link below.'
        : 'One outside tangent link per associated longitudinal layer. + adds the first layer without a link. Closure and anchorage require review.';
      group.append(note);
    }
  }
  render();
  return render;
}
