// Compact output: governing utilisation, one UR bar per check (informational rows left out), key
// parameters, and the working of the selected check with numbers substituted. The full list of
// intermediate values stays available in "All intermediate values" below.
import { STATES } from './inputs.mjs';
import { htmlSubscripts } from './subscript.mjs';

const SHORT = {
  max: 'Face, u_0', concrete: 'Concrete at u_1', reinforced: 'With links at u_1', kmax: 'k_max limit',
  outer: 'Outer coverage, a_out', perimeters: 'Number of perimeters', first: 'First layer ≤ 0.5d', 'first-min': 'First layer ≥ 0.3d',
  radial: 's_r ≤ 0.75d', tangential: 'Tangential spacing s_t', minimum: 'Minimum leg area', anchorage: 'Anchorage and detailing',
  'ext-concrete': 'Slab outside the drop, u_1,ext', 'ext-max': 'Face (slab section)',
};
const INFO = [STATES.notRequired, STATES.linksRequired];
// Short name of a check; slab-section rows beyond a drop reuse the base name.
const shortName = row => (row.id === 'concrete' && row.status === STATES.fail && /links required/.test(row.label) ? 'Links required · concrete at u_1' : null) ?? (row.measure === 'perimeter-length' ? (row.id === 'outer' ? 'Effective outer perimeter' : 'Outside drop · effective outer perimeter') : null) ?? SHORT[row.id] ?? (row.id.startsWith('ext-') && SHORT[row.id.slice(4)] ? `Outside drop · ${SHORT[row.id.slice(4)]}` : row.label);
const f = (value, digits = 3) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
const esc = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// What the inputs make of the design: position, drop class, openings and where the links went.
function caseLine(result) {
  const parts = [];
  const head = result.head;
  if (head?.lH) {
    const lH = Math.min(...head.lH).toFixed(0);
    const two = (2 * head.hH).toFixed(0);
    if (head.kind === 'small') parts.push(`drop l_H = ${lH} < 2h_H = ${two} (Fig. 6.17): one section at 2d from the drop`);
    else parts.push(`drop l_H = ${Math.max(...head.lH).toFixed(0)} ≥ 2h_H = ${two} (Fig. 6.18): sections inside (d_H) and outside the drop`);
  }
  const openings = result.input?.openings?.length ?? 0;
  if (openings) parts.push(`${openings} opening${openings > 1 ? 's' : ''}`);
  const layers = result.layout?.layers ?? [];
  if (!layers.length) parts.push(result.loads.some(load => load.required || load.ext?.required) ? 'links required' : 'no links');
  else {
    const where = [...new Set(layers.map(layer => layer.zone))].map(zone => (zone === 'drop' ? 'in the drop' : zone === 'slab' ? 'beyond the drop' : null)).filter(Boolean);
    parts.push(`links ${layers[0].id}–${layers.at(-1).id}${where.length ? ' ' + where.join(' and ') : ''}`);
  }
  return parts.join(' · ');
}

// Working of one check, as lines of text (subscripts are applied afterwards).
function working(id, row, load, result) {
  const r = result.resistance ?? {};
  const d = result.section?.d;
  const d0 = result.faceD ?? d;
  const beta = load.beta?.value;
  const V = load.V;
  const ext = result.head?.sections?.find(item => item.id === 'ext');
  const vEd = (u, dd) => `v_Ed = β·V_Ed/(u·d) = ${f(beta)} × ${f(V, 1)}×10³ / (${f(u, 0)} × ${f(dd, 0)}) = ${f((beta * V * 1000) / (u * dd))} MPa`;
  const vRdc = `v_Rd,c = max(C_Rd,c·k·(100ρ_l·f_ck)^(1/3), v_min) + k_1·σ_cp = max(${f(r.cRdc)} × ${f(r.k)} × (100 × ${f(r.rho, 5)} × ${f(r.fckShear, 0)})^(1/3), ${f(r.vMin)}) + 0.1 × ${f(r.sigmaCp, 2)} = ${f(r.vRdc)} MPa`;
  switch (id) {
    case 'max':
      return [vEd(result.u0, d0).replace('u·d', 'u_0·d'), `v_Rd,max = ${result.profile?.vRdMaxFactor ?? 0.4}·ν·f_cd = ${f(result.vRdMax)} MPa (§6.4.5(3))`];
    case 'concrete':
      return [vEd(result.u1, d).replace('u·d', 'u_1·d'), vRdc];
    case 'reinforced':
      return [vEd(result.u1, d).replace('u·d', 'u_1·d'),
        `v_Rd,cs = 0.75·v_Rd,c + 1.5·(d/s_r)·A_sw·f_ywd,ef/(u_1·d) = 0.75 × ${f(r.vRdc)} + 1.5 × (${f(d, 0)}/${f(row.srMax, 0)}) × ${f(row.aswMin, 0)} × ${f(result.fywdEf, 1)} / (${f(result.u1, 0)} × ${f(d, 0)}) = ${f(row.resistance)} MPa`,
        'A_sw: smallest layer; s_r: largest radial spacing (§6.4.5(1)).'];
    case 'kmax':
      return [vEd(result.u1, d).replace('u·d', 'u_1·d'), `limit = k_max·v_Rd,c = ${f(row.resistance / r.vRdc, 2)} × ${f(r.vRdc)} = ${f(row.resistance)} MPa`];
    case 'outer':
    case 'ext-outer':
      if (row.measure === 'perimeter-length') return [
        `Required length u_out,req = ${f(row.demand, 0)} mm. Effective length u_out,ef = ${f(row.resistance, 0)} mm.`,
        row.detail,
      ].filter(Boolean);
      if (id === 'ext-outer') return [row.detail ?? row.label];
      return [`u_out,req = β·V_Ed/(v_Rd,c·d) = ${f(beta)} × ${f(V, 1)}×10³ / (${f(r.vRdc)} × ${f(d, 0)}) = ${f(load.uOut, 0)} mm`,
        `a_out = ${f(load.aOut, 0)} mm from the face; outermost layer ≥ a_out − 1.5d = ${f(row.demand, 0)} mm, provided ${f(row.resistance, 0)} mm`];
    case 'ext-concrete':
      return ext ? [vEd(ext.u1, ext.d).replace('u·d', 'u_1,ext·d'), `v_Rd,c with d = ${f(ext.d, 0)} mm = ${f(row.resistance)} MPa`] : [];
    default:
      return [`${row.label}: ${f(row.demand, row.unit === 'MPa' ? 3 : 0)} against ${f(row.resistance, row.unit === 'MPa' ? 3 : 0)}${row.unit ? ' ' + row.unit : ''}`, row.detail ?? ''].filter(Boolean);
  }
}

export function renderCompact(panel, result, loadName, selectedId, onSelect) {
  if (!result.loads?.length) {
    panel.innerHTML = `<p class="compact-empty">${esc(result.issues?.[0]?.message ?? 'Awaiting results')}</p>`;
    return;
  }
  const load = result.loads.find(item => item.id === loadName) ?? result.loads.find(item => item.id === result.governing.loadId);
  const rows = load.rows.filter(row => Number.isFinite(row.ur) && !INFO.includes(row.status));
  const governing = rows.filter(row => row.unit !== 'layers').reduce((best, row) => (!best || row.ur > best.ur ? row : best), null);
  const pick = rows.find(row => row.id === selectedId) ?? governing;
  const tone = status => (status === STATES.pass ? 'pass' : status === STATES.fail ? 'fail' : 'warn');
  const bars = rows.map(row => {
    const width = Math.min(row.ur, 1.25) / 1.25 * 100;
    return `<button type="button" class="ur-row${row === pick ? ' is-selected' : ''}${row === governing ? ' is-governing' : ''}" data-check="${esc(row.id)}">`
      + `<span class="ur-name">${esc(shortName(row))}<small>${esc(row.clause)}</small></span>`
      + `<span class="ur-bar"><span class="ur-fill ${tone(row.status)}" style="width:${width.toFixed(1)}%"></span><span class="ur-one"></span></span>`
      + `<span class="ur-value ${tone(row.status)}">${row.ur.toFixed(2)}</span></button>`;
  }).join('');
  const r = result.resistance ?? {};
  const head = result.head;
  const keys = [
    [head?.kind === 'large' && head.inner ? 'd_H' : 'd', `${f(result.section.d, 0)} mm`], ['ρ_l', `${f(r.rho * 100, 2)} %`],
    ['u_0', `${f(result.u0, 0)} mm`], ['u_1', `${f(result.u1, 0)} mm`], ['β', f(load.beta?.value)],
    ['v_Ed', `${f(load.vEd1)} MPa`], ['v_Rd,c', `${f(r.vRdc)} MPa`], ['v_Rd,max', `${f(result.vRdMax)} MPa`],
    ...(load.required && load.aOut > 0 ? [['u_out,req', `${f(load.uOut, 0)} mm`], ['a_out', `${f(load.aOut, 0)} mm`]] : []),
    ...(result.layout?.outerEf ? [['u_out,ef', `${f(result.layout.outerEf.u, 0)} mm`]] : []),
    ...(head?.sections?.find(item => item.id === 'ext') ? [['u_1,ext', `${f(head.sections.find(item => item.id === 'ext').u1, 0)} mm`]] : []),
  ].map(([k, v]) => `<div class="key-param"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  const methods = result.methods?.map(method => `<p class="compact-case">Software method · ${esc(method)}</p>`).join('') ?? '';
  const lines = pick ? working(pick.id, pick, load, result) : [];
  // Detailing warnings (no UR): shown as a list under the bars.
  const warnings = load.rows.filter(row => row.warning && row.status !== STATES.pass)
    .map(row => `<p class="compact-warning">⚠ ${esc(row.detail ?? row.label)}</p>`).join('');
  panel.innerHTML = `<div class="compact-head"><span class="compact-ur ${tone(result.status)}">${governing ? governing.ur.toFixed(3) : '—'}</span><span class="compact-status ${tone(result.status)}">${esc(result.status)}</span></div>`
    + `<p class="compact-case">${esc(caseLine(result))}</p>` + methods
    + `<p class="compact-governing">Governing: ${esc(governing ? shortName(governing) : '—')} · ${esc(load.name)}</p>`
    + `<div class="ur-list" role="list">${bars}</div>${warnings}`
    + `<h3 class="compact-title">Key parameters</h3><div class="key-grid">${keys}</div>`
    + `<h3 class="compact-title">How: ${esc(pick ? shortName(pick) : '')}</h3><div class="how">${lines.map(line => `<p>${esc(line)}</p>`).join('')}</div>`;
  htmlSubscripts(panel);
  for (const button of panel.querySelectorAll('.ur-row')) button.addEventListener('click', () => onSelect(button.dataset.check));
}
