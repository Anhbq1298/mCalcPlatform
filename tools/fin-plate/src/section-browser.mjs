const mm = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const normalize = text => text.toLowerCase().replaceAll('×', 'x').replace(/\s+/g, '');
const families = ['UB', 'UC', 'IPE', 'HEA', 'HEB', 'HEM', 'W'];

export function sectionBrowser(catalogue, select) {
  const dialog = document.createElement('dialog');
  dialog.id = 'section-browser';
  dialog.setAttribute('aria-labelledby', 'section-browser-title');
  dialog.innerHTML = `
    <h2 id="section-browser-title">Steel section library</h2>
    <div class="section-filters">
      <label>Section family <select id="section-family"></select></label>
      <label>Search sections <input type="search" id="section-search" autofocus></label>
    </div>
    <div class="fin-table"><table>
      <thead><tr><th scope="col">Designation</th><th scope="col">h (mm)</th><th scope="col">b (mm)</th><th scope="col">Web (mm)</th><th scope="col">Flange (mm)</th></tr></thead>
      <tbody></tbody>
    </table></div>
    <p id="section-empty" hidden>No matching sections.</p>
    <div class="section-actions">
      <button type="button" id="use-custom-section">Custom I/H section</button>
      <form method="dialog"><button>Close</button></form>
    </div>`;
  document.body.append(dialog);

  const family = dialog.querySelector('select');
  const search = dialog.querySelector('input');
  const results = dialog.querySelector('tbody');
  const empty = dialog.querySelector('#section-empty');
  const items = [...catalogue].sort((a, b) => a.values.h - b.values.h || a.values.mass - b.values.mass);
  family.add(new Option('All I/H sections', ''));
  for (const name of families.filter(name => items.some(section => section.family === name))) {
    family.add(new Option(name, name));
  }
  let currentId;
  function choose(id) {
    select(id);
    dialog.close();
  }
  function render() {
    const query = normalize(search.value);
    const matches = items.filter(section => (!family.value || section.family === family.value)
      && normalize(section.name).includes(query));
    results.replaceChildren(...matches.map(section => {
      const row = document.createElement('tr');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = section.name;
      if (section.id === currentId) button.setAttribute('aria-current', 'true');
      button.onclick = () => choose(section.id);
      row.insertCell().append(button);
      for (const key of ['h', 'b', 'tw', 'tf']) row.insertCell().textContent = mm.format(section.values[key]);
      return row;
    }));
    empty.hidden = matches.length > 0;
  }
  family.onchange = search.oninput = render;
  dialog.querySelector('#use-custom-section').onclick = () => choose(0);
  return id => {
    currentId = id;
    family.value = '';
    search.value = '';
    render();
    dialog.showModal();
  };
}
