// Result panels: check summary (shared column-summary component), intermediate values, messages,
// code basis and the layer schedule.
import { renderColumnSummary } from '../../../apps/column-summary.mjs';
import { STATES } from './inputs.mjs';
import { LINK_SHAPES } from './layout.mjs';

const fmt = (value, digits = 3) => (value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits));
const tone = state => (state === STATES.pass ? 'pass' : state === STATES.fail ? 'fail' : state === STATES.notRequired || state === STATES.linksRequired ? 'off' : 'incomplete');
const informational = state => state === STATES.notRequired || state === STATES.linksRequired;

export function summaryRows(load) {
  return load.rows.map(row => {
    const values = row.demand !== null && row.resistance !== null && row.unit
      ? `${fmt(row.demand, row.unit === 'MPa' ? 3 : 0)} / ${fmt(row.resistance, row.unit === 'MPa' ? 3 : 0)} ${row.unit}` : '';
    return {
      label: row.label,
      detail: [row.clause, values, row.detail].filter(Boolean).join(' · '),
      ratio: row.ur,
      isUR: row.ur !== null && !informational(row.status) && row.unit !== 'layers',
      status: tone(row.status),
      statusLabel: row.status,
    };
  });
}

export function renderSummary(panel, statusLine, result, loadName) {
  if (!result.loads?.length) {
    renderColumnSummary(panel, [], result.issues?.[0]?.message ?? 'Awaiting results');
    statusLine.textContent = 'Design status: ' + result.status;
    statusLine.dataset.tone = tone(result.status);
    return;
  }
  const load = result.loads.find(entry => entry.id === loadName) ?? result.loads.find(entry => entry.id === result.governing.loadId);
  renderColumnSummary(panel, summaryRows(load));
  statusLine.textContent = `Design status: ${result.status} · governing: ${result.governing.load}, ${result.governing.check ?? '—'}`;
  statusLine.dataset.tone = tone(result.status);
}

export function renderDetails(list, result, loadName) {
  list.replaceChildren();
  if (!result.section) return;
  const load = result.loads.find(entry => entry.id === loadName) ?? result.loads[0];
  const { section, resistance: r } = result;
  if (!load.vEd1) return;
  const entries = [
    ['Column position', result.position.kind === 'internal' ? 'Internal' : `${result.position.kind === 'edge' ? 'Edge' : 'Corner'}: c1 = ${fmt(result.position.c1, 0)}, c2 = ${fmt(result.position.c2, 0)} mm`],
    ['d_x, d_y', `${fmt(section.dx, 1)}, ${fmt(section.dy, 1)} mm`],
    ['Mean d', `${fmt(section.d, 1)} mm`],
    ['ρ_x, ρ_y', `${fmt(section.rhoX * 100, 3)} %, ${fmt(section.rhoY * 100, 3)} %`],
    ['ρ_l = √(ρ_x ρ_y) ≤ 2 %', `${fmt(r.rho * 100, 3)} %`],
    ['k = 1 + √(200/d) ≤ 2', fmt(r.k, 3)],
    ['v_min (Eq. 6.3N)', `${fmt(r.vMin)} MPa`],
    ['v_Rd,c (Eq. 6.47)', `${fmt(r.vRdc)} MPa`],
    [`v_Rd,max (${result.profile.vRdMaxFactor} ν f_cd)`, `${fmt(result.vRdMax)} MPa`],
    ['u_0, u_1', `${fmt(result.u0, 0)}, ${fmt(result.u1, 0)} mm`],
    ...(result.u1Star ? [['u_1* (Fig. 6.20)', `${fmt(result.u1Star, 0)} mm`]] : []),
    ...(r.sigmaCp ? [['σ_cp (Eq. 6.47)', `${fmt(r.sigmaCp, 2)} MPa`]] : []),
    ['f_ywd,ef', `${fmt(result.fywdEf, 1)} MPa`],
    ['β', `${fmt(load.beta.value)} · ${load.beta.method}`],
    ['v_Ed at u_0, u_1', `${fmt(load.vEd0)}, ${fmt(load.vEd1)} MPa`],
  ];
  if (load.beta.terms?.W1) entries.push([result.position.kind === 'edge' ? 'k, W_1 (Table 6.1 with c1/2c2, Eq. 6.45)' : 'k, W_1 (Table 6.1, Eq. 6.41)', `${fmt(load.beta.terms.k, 3)}, ${fmt(load.beta.terms.W1 / 1e6, 4)}·10⁶ mm²`]);
  if (load.beta.terms?.ePerp !== undefined) entries.push(['e ⊥ edge (interior +), e ∥ edge', `${fmt(load.beta.terms.ePerp, 1)}, ${fmt(load.beta.terms.ePar, 1)} mm`]);
  if (load.beta.terms?.betaCrossed) entries.push(['β, both Eq. 6.43 pairings', `${fmt(load.beta.terms.betaParallel)}, ${fmt(load.beta.terms.betaCrossed)}`]);
  if (load.required) {
    entries.push(['u_out,req (Eq. 6.54)', `${fmt(load.uOut, 0)} mm at a_out = ${fmt(load.aOut, 0)} mm`]);
    const outer = load.rows.find(row => row.id === 'outer' && row.measure === 'perimeter-length');
    if (outer) entries.push(['u_out,ef (Fig. 6.22)', `${fmt(outer.resistance, 0)} mm`]);
    entries.push(['A_sw required per perimeter', `${fmt(load.aswReq, 0)} mm² at s_r = ${fmt(result.envelope.sr, 0)} mm`]);
  }
  for (const entry of result.detailing?.rows ?? []) entries.push([`${entry.label} (${entry.clause})`, `${entry.status}${entry.detail ? ' · ' + entry.detail : ''}`]);
  for (const [label, value] of entries) {
    const name = document.createElement('dt');
    name.textContent = label;
    const cell = document.createElement('dd');
    cell.textContent = value;
    list.append(name, cell);
  }
}

export function renderMessages(container, result) {
  container.replaceChildren();
  for (const issue of result.issues ?? []) container.append(message(issue.state + ': ' + issue.message, tone(issue.state)));
  for (const note of result.notes ?? []) container.append(message(note, 'note'));
  if (result.layout?.reason && result.layout.reason !== 'No punching reinforcement required.') container.append(message('Layout: ' + result.layout.reason, 'fail'));
}

function message(text, kind) {
  const item = document.createElement('p');
  item.className = 'punching-message';
  item.dataset.tone = kind;
  item.textContent = text;
  return item;
}

export function renderBasis(container, profile) {
  container.replaceChildren();
  const head = document.createElement('p');
  head.textContent = `${profile.standard}. ${profile.nationalAnnex}.`;
  const table = document.createElement('table');
  table.className = 'column-summary-table';
  const header = table.createTHead().insertRow();
  for (const title of ['Parameter', 'Value', 'Source']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = title;
    header.append(cell);
  }
  const body = table.createTBody();
  for (const parameter of profile.parameters) {
    const row = body.insertRow();
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = parameter.name;
    row.append(name);
    row.insertCell().textContent = typeof parameter.value === 'number' ? String(Number(parameter.value.toFixed(4))) : parameter.value;
    row.insertCell().textContent = `${parameter.source} · ${parameter.status}`;
  }
  const list = items => {
    const ul = document.createElement('ul');
    for (const text of items) { const li = document.createElement('li'); li.textContent = text; ul.append(li); }
    return ul;
  };
  const assumptions = document.createElement('h3');
  assumptions.textContent = 'Assumptions';
  const unsupported = document.createElement('h3');
  unsupported.textContent = 'Not supported in this release';
  container.append(head, table, assumptions, list(profile.assumptions), unsupported, list(profile.unsupported));
}

export function renderSchedule(table, result, selectedLayer) {
  const body = table.tBodies[0];
  body.replaceChildren();
  const layers = result.layout?.summary ?? [];
  if (!layers.length) {
    const cell = body.insertRow().insertCell();
    cell.colSpan = 12;
    cell.textContent = result.layout?.reason ?? 'No layers.';
    return;
  }
  layers.forEach((layer, index) => {
    const row = body.insertRow();
    row.dataset.layer = layer.id;
    if (layer.id === selectedLayer) row.className = 'column-summary-governing';
    const radial = index && layers[index - 1].zone === layer.zone ? layer.offset - layers[index - 1].offset : null;
    const cells = [
      layer.id, layer.zone === 'slab' ? `${fmt(layer.offset, 0)} (drop + ${fmt(layer.pathOffset, 0)})` : fmt(layer.offset, 0), 'Ø' + layer.diameter, LINK_SHAPES[layer.shape]?.label ?? layer.shape,
      String(layer.physicalLinks), `${layer.effectiveLegs} / ${layer.legs}`, fmt(layer.asw, 0),
      radial === null ? '—' : fmt(radial, 0), `${fmt(layer.tangential.max, 0)} ≤ ${fmt(layer.tangentialLimit, 0)}`,
    ];
    for (const value of cells) row.insertCell().textContent = value;
    for (const state of [layer.reinforcementState, layer.detailingState]) {
      const cell = row.insertCell();
      cell.dataset.tone = tone(state);
      cell.textContent = state;
    }
  });
}

// Compact read-only schedule of the auto arrangement, shown in the Punching reinforcement card.
export function renderAutoSchedule(host, result) {
  const layers = result?.layout?.summary ?? [];
  if (!layers.length) {
    host.innerHTML = `<p class="table-caption">${result?.layout?.reason ?? 'No links.'}</p>`;
    return;
  }
  const edge = (result.layout.links ?? []).filter(link => link.edge).length;
  const rows = layers.map((layer, i) => {
    const sr = i && layers[i - 1].zone === layer.zone ? fmt(layer.offset - layers[i - 1].offset, 0) : '—';
    return `<tr><td>${layer.id}</td><td>${fmt(layer.offset, 0)}</td><td>${sr}</td><td>${layer.physicalLinks}</td><td>Ø${layer.diameter}</td><td>${fmt(layer.tangential.max, 0)}</td><td>${fmt(layer.asw, 0)}</td></tr>`;
  }).join('');
  const total = (result.layout.links ?? []).length;
  host.innerHTML = `<p class="card-subhead">Auto schedule</p>`
    + `<table class="column-summary-table auto-schedule"><thead><tr><th>Layer</th><th>From face</th><th>s_r</th><th>Links</th><th>Ø</th><th>s_t max</th><th>A_sw</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<p class="table-caption">${total} links${edge ? `, of which ${edge} fill the drop to its edge (detailing)` : ''}. mm, mm². Full checks per layer: Schedule tab.</p>`;
}

const comparisonCache = new WeakMap();

export function renderArrangementComparison(host, result, input, calculate) {
  host.replaceChildren();
  const note = document.createElement('p');
  note.className = 'table-caption';
  if (!input.reinforcement.enabled || input.head?.enabled || !result.loads?.some(load => load.required)) {
    note.textContent = 'Compare layouts for a slab without a drop when punching links are enabled and required.';
    host.append(note);
    return;
  }
  let comparisons = comparisonCache.get(result);
  if (!comparisons) {
    comparisons = [['grid', 'Grid arrangement'], ['radial', 'Radial arrangement']]
      .map(([arrangement, label]) => [label, calculate({ ...input, reinforcement: { ...input.reinforcement, mode: 'auto', arrangement } })]);
    comparisonCache.set(result, comparisons);
  }
  note.textContent = 'All arrangements use the current geometry, actions, link size and spacing limits.';
  const table = document.createElement('table');
  table.className = 'column-summary-table';
  const header = table.createTHead().insertRow();
  for (const label of ['Arrangement', 'Status', 'Links', 'ΣA_sw (mm²)', 'Governing s_t', 'u_out,req (mm)', 'u_out,ef (mm)', 'Combination']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    header.append(th);
  }
  const body = table.createTBody();
  for (const [label, design] of comparisons) {
    const governing = design.loads.find(load => load.id === design.governing?.loadId);
    const tangential = governing?.rows.find(check => check.id === 'tangential');
    const row = body.insertRow();
    const steel = (design.layout?.links ?? []).reduce((sum, link) => sum + (link.legs?.length ?? 1) * Math.PI * link.diameter ** 2 / 4, 0);
    for (const value of [label, design.status, design.layout?.links.length ?? '—', design.layout?.links.length ? fmt(steel, 0) : '—',
      tangential ? `${fmt(tangential.demand, 0)} / ${fmt(tangential.resistance, 0)} mm` : '—',
      fmt(design.envelope?.uOut, 0), fmt(design.layout?.outerEf?.u, 0), design.governing?.load ?? '—']) {
      row.insertCell().textContent = value;
    }
    if (design.layout?.reason) row.cells[1].title = design.layout.reason;
  }
  host.append(note, table);
}
