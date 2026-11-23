// Custom fastener layout editor (DOM): a point table plus tools to add, convert and delete
// points; clicking the plan adds a point of the active type or selects an existing one.
import { gridToPoints, snap } from './layout.mjs';

export function createLayoutEditor(host, getState, onChange) {
  const selected = new Set();
  let tool = 'stud';
  host.innerHTML = `<div class="layout-editor" hidden>
      <p class="table-caption">Click the plan to add a <b data-tool-name>stud</b>; click a point to select it. Coordinates snap to 5 mm.</p>
      <div class="layer-buttons" role="toolbar" aria-label="Layout tools">
        <button type="button" data-tool="stud" aria-pressed="true">Stud tool</button>
        <button type="button" data-tool="rebar" aria-pressed="false">Bar tool</button>
        <button type="button" data-act="convert">Stud ↔ Bar</button>
        <button type="button" data-act="delete">Delete</button>
        <button type="button" data-act="reset">From grid</button>
      </div>
      <table class="layer-table point-table"><thead><tr><th scope="col">Sel</th><th scope="col">Type</th><th scope="col">x</th><th scope="col">y</th><th scope="col">Ø</th><th scope="col" data-stiffness>k<sub>N</sub></th><th scope="col" data-stiffness>k<sub>V</sub></th></tr></thead><tbody></tbody></table>
    </div>`;
  const panel = host.querySelector('.layout-editor');
  const body = panel.querySelector('tbody');
  const points = () => getState().layout.points;
  const changed = () => { onChange(); refresh(); };

  panel.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.tool) {
      tool = button.dataset.tool;
      for (const other of panel.querySelectorAll('[data-tool]')) other.setAttribute('aria-pressed', String(other === button));
      panel.querySelector('[data-tool-name]').textContent = tool === 'stud' ? 'stud' : 'welded bar';
      return;
    }
    const list = points();
    if (button.dataset.act === 'convert') {
      for (const i of selected) {
        const p = list[i];
        if (p.type === 'stud') { p.type = 'rebar'; p.d = p.d ?? 16; } else p.type = 'stud';
      }
    } else if (button.dataset.act === 'delete') {
      getState().layout.points = list.filter((_, i) => !selected.has(i));
      selected.clear();
    } else if (button.dataset.act === 'reset') {
      getState().layout.points = gridToPoints(getState());
      selected.clear();
    }
    changed();
  });
  body.addEventListener('change', event => {
    const input = event.target;
    const i = Number(input.closest('tr').dataset.index);
    const p = points()[i];
    if (input.dataset.key === 'sel') {
      if (input.checked) selected.add(i); else selected.delete(i);
      onChange();
      return;
    }
    if (input.dataset.key === 'type') {
      p.type = input.value;
      if (p.type === 'rebar') p.d = p.d ?? 16;
    } else if (input.dataset.key.endsWith('Stiffness')) {
      p[input.dataset.key] = input.value === '' ? null : input.valueAsNumber;
    } else if (input.value !== '') p[input.dataset.key] = input.dataset.key === 'd' ? input.valueAsNumber : snap(input.valueAsNumber);
    changed();
  });

  function refresh() {
    const state = getState();
    const custom = state.layout.mode === 'custom';
    panel.hidden = !custom;
    if (!custom) return;
    const spatial = state.loading?.model === 'spatial';
    for (const head of panel.querySelectorAll('[data-stiffness]')) head.hidden = !spatial;
    body.replaceChildren(...state.layout.points.map((p, i) => {
      const tr = document.createElement('tr');
      tr.dataset.index = i;
      tr.innerHTML = `<td><input type="checkbox" data-key="sel" aria-label="Select point ${i + 1}" ${selected.has(i) ? 'checked' : ''}></td>`
        + `<td><select data-key="type" aria-label="Point ${i + 1} type"><option value="stud"${p.type === 'stud' ? ' selected' : ''}>Stud</option><option value="rebar"${p.type === 'rebar' ? ' selected' : ''}>Bar</option></select></td>`
        + `<td><input type="number" step="5" data-key="x" aria-label="Point ${i + 1} x" value="${p.x}"></td>`
        + `<td><input type="number" step="5" data-key="y" aria-label="Point ${i + 1} y" value="${p.y}"></td>`
        + `<td>${p.type === 'rebar' ? `<input type="number" step="1" data-key="d" aria-label="Point ${i + 1} bar diameter" value="${p.d}">` : `<span class="muted-cell">${state.studs.d}</span>`}</td>`;
      if (spatial) {
        for (const name of ['axial', 'shear']) {
          const cell = tr.insertCell();
          if (name === 'shear' && p.type === 'rebar') continue;
          const control = document.createElement('input');
          control.type = 'number';
          control.step = 'any';
          control.min = '0';
          control.value = p[name + 'Stiffness'] ?? '';
          control.placeholder = 'Global';
          control.dataset.key = name + 'Stiffness';
          control.setAttribute('aria-label', `Point ${i + 1} ${name} stiffness (N/mm)`);
          cell.append(control);
        }
      }
      return tr;
    }));
  }

  // Plan interaction: model coordinates come from the plan SVG transform attributes.
  function planClick(svg, event) {
    const state = getState();
    if (state.layout.mode !== 'custom') return;
    const hit = event.target.closest('[data-point]');
    if (hit) {
      const i = Number(hit.dataset.point);
      if (!event.shiftKey) { const keep = selected.has(i) && selected.size === 1; selected.clear(); if (!keep) selected.add(i); } else if (selected.has(i)) selected.delete(i); else selected.add(i);
      onChange();
      refresh();
      return;
    }
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const local = pt.matrixTransform(svg.getScreenCTM().inverse());
    const scale = Number(svg.dataset.scale);
    const x = snap((local.x - Number(svg.dataset.ox)) / scale);
    const y = snap((Number(svg.dataset.oy) - local.y) / scale);
    if (Math.abs(x) > state.plate.B / 2 || Math.abs(y) > state.plate.H / 2) return;
    state.layout.points.push(tool === 'stud' ? { type: 'stud', x, y } : { type: 'rebar', x, y, d: 16 });
    selected.clear();
    selected.add(state.layout.points.length - 1);
    changed();
  }

  return { refresh, planClick, selected };
}
