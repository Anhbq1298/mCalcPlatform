// Punching shear design of slab–column connections to EN 1992-1-1:2004 §6.4 and §9.4.3:
// internal, edge and corner columns, openings, in-plane stress, individual link layouts.
import { shearDemand } from './demand.mjs';
import { betaFor } from './beta.mjs';
import { detailingChecks } from './detailing.mjs';
import { STATES, groupLayers, restoreInputs, validateBeta, validateGeometry, validateLoad, validateMaterials, validateReinforcement } from './inputs.mjs';
import { arcLengthAt, arrangedLayers, faceGaps, gridOnBars, outerPerimeterEf } from './arrangement.mjs';
import { toLocal } from './geometry.mjs';
import { dropFillPoints, ringGaps } from './grid-thin.mjs';
import { buildLinks, layerSummary } from './layout.mjs';
import { offsetForLength } from './perimeters.mjs';
import { profileFor } from './profile.mjs';
import { CODE_PARAMETERS as P, outerPerimeterLength, requiredAswPerPerimeter } from './resistance.mjs';
import { checkLayout, row } from './reinforcement-checks.mjs';
import { createContext, geometryLimits, positionIssues } from './setup.mjs';

const ORDER = [STATES.unsupportedGeometry, STATES.unsupportedLoading, STATES.fail, STATES.incomplete, STATES.notVerified, STATES.confirm, STATES.pass];
const informational = state => state === STATES.notRequired || state === STATES.linksRequired;
export const worstState = states => ORDER.find(state => states.map(item => (informational(item) ? STATES.pass : item)).includes(state)) ?? STATES.pass;
const counts = entry => entry.ur !== null && Number.isFinite(entry.ur) && !informational(entry.status) && entry.unit !== 'layers';

function normaliseLoads(loads = []) {
  return loads.map((load, index) => ({ id: load.id, name: load.name || 'Combination ' + (index + 1), V: load.V, Mx: load.Mx ?? 0, My: load.My ?? 0 }));
}

function demandFor(ctx, load) {
  const beta = betaFor(ctx, load);
  if (!Number.isFinite(beta.value)) return { load, beta, unsupported: true };
  const { d, u0, u1, res, model } = ctx;
  const vEd0 = shearDemand({ V: load.V, beta: beta.value, u: u0, d: ctx.faceD });
  const vEd1 = shearDemand({ V: load.V, beta: beta.value, u: u1, d });
  const required = vEd1 > res.vRdc + 1e-12;
  const uOut = outerPerimeterLength({ beta: beta.value, V: load.V, vRdc: res.vRdc, d });
  const aOut = offsetForLength(model, uOut, (m, r) => m.intervalsAt(r));
  const aswReq = required ? requiredAswPerPerimeter({ vEd: vEd1, vRdc: res.vRdc, u1, sr: ctx.envelopeSr, fywdEf: ctx.fywdEf }) : 0;
  return { load, beta, vEd0, vEd1, required, uOut, aOut, aswReq };
}

function loadResult(ctx, item, layout, summary, links, detailing) {
  if (item.unsupported) {
    const rows = [row('beta', '§6.4.3', 'Load increment factor β', null, null, item.beta.state, { detail: item.beta.message })];
    return { ...item.load, beta: item.beta, rows, status: item.beta.state, ur: 0, required: false };
  }
  const { load, beta, vEd0, vEd1, required, aOut } = item;
  const { res, d, input } = ctx;
  const face = ctx.options.face;
  const rows = [
    ...(face?.skip ? [] : [row('max', '§6.4.5(3), Eq. 6.53', face?.label ?? 'Maximum punching stress at u0', vEd0, ctx.vRdMax, null, { unit: 'MPa', detail: face?.detail })]),
    required && !layout.layers.length && !ctx.options.noLinks
      ? row('concrete', '§6.4.4(1), Eq. 6.47', 'Concrete punching resistance at u1 (links required)', vEd1, res.vRdc, STATES.fail, { unit: 'MPa', detail: layout.reason || 'No links provided.' })
      : required && ctx.options.noLinks
      ? row('concrete', '§6.4.4(1), Eq. 6.47', ctx.options.label ? ctx.options.label + ': concrete punching resistance' : 'Concrete punching resistance at u1', vEd1, res.vRdc, STATES.unsupportedGeometry, { unit: 'MPa', detail: ctx.options.noLinks })
      : required
      ? row('concrete', '§6.4.4(1), Eq. 6.47', 'Concrete punching resistance at u1 (links required)', vEd1, res.vRdc, STATES.linksRequired, { unit: 'MPa', detail: 'v_Ed > v_Rd,c: links provide the resistance.' })
      : row('concrete', '§6.4.4(1), Eq. 6.47', ctx.options.label ? ctx.options.label + ': concrete punching resistance' : 'Concrete punching resistance at u1', vEd1, res.vRdc, null, { unit: 'MPa' }),
  ];
  if (beta.state) rows.push(row('beta', '§6.4.3', 'Load increment factor β', null, null, beta.state, { detail: beta.message }));
  let layoutCheck = null;
  if (required && ctx.options.noLinks) return { ...item, ...load, rows, layoutCheck, status: worstState(rows.map(entry => entry.status)), ur: Math.max(0, ...rows.filter(counts).map(entry => entry.ur)) };
  if (!required) rows.push(row('reinforced', '§6.4.5', 'Punching reinforcement', null, null, STATES.notRequired, { detail: 'v_Ed ≤ v_Rd,c' }));
  else if (!layout.layers.length) {
    // The upper limit with links applies whether or not links are placed (and the report shows it).
    rows.push(row('kmax', ctx.profile.kMaxClause, 'Upper limit with links, ' + ctx.profile.kMaxLabel, vEd1, ctx.profile.kMax * res.vRdc, null, { unit: 'MPa' }));
  }
  else {
    const { materials } = input;
    const outerEf = layout.outerEf ? { ...layout.outerEf, uReq: item.uOut } : null;
    layoutCheck = checkLayout({ d, fck: materials.fck, fyk: materials.fyk, vRdc: res.vRdc, vEd: vEd1, u1: ctx.u1, aOut: Math.min(aOut, ctx.layoutOut ?? aOut), summary, links, kMax: ctx.profile.kMax, kMaxLabel: ctx.profile.kMaxLabel, kMaxClause: ctx.profile.kMaxClause, detailing, outerEf, compactOuterZone: ctx.compactOuterZone });
    rows.push(...layoutCheck.rows);
  }
  return { ...item, ...load, rows, layoutCheck, status: worstState(rows.map(entry => entry.status)), ur: Math.max(0, ...rows.filter(counts).map(entry => entry.ur)) };
}

export function calculate(rawInput, options = {}) {
  const restored = restoreInputs(rawInput); // fills fields added after a design was saved
  const loads = normaliseLoads(restored.loads);
  const input = { ...restored, loads };
  const issues = [...validateGeometry(input), ...validateMaterials(input), ...loads.flatMap(validateLoad), ...validateBeta(input.beta), ...validateReinforcement(input.reinforcement)];
  if (!loads.length) issues.push({ state: STATES.incomplete, message: 'Add at least one load combination.' });
  const profile = profileFor(input.code?.profile);
  if (issues.length) return { status: worstState(issues.map(item => item.state)), issues, notes: [], profile, loads: [], input };
  const ctx = createContext(input, options);
  const blocking = positionIssues(input, ctx.position);
  if (blocking.length) return { status: worstState(blocking.map(item => item.state)), issues: blocking, notes: [], profile, loads: [], input, position: ctx.position };

  const { d, model } = ctx;
  const { materials, reinforcement } = input;
  // Auto s_r: try the radial spacings the arrangement allows and keep the one with the fewest links that
  // passes (else the lowest UR). On the bar grid s_r is a whole multiple of the bar spacing.
  if (reinforcement.mode === 'auto' && reinforcement.enabled !== false && reinforcement.srAuto !== false && !options.srFixed) {
    // The entered s_r is the user's upper limit (constraint); the code limit is 0.75d.
    const limit = Math.min(Math.floor((P.radialSpacing * d) / 5 + 1e-9) * 5, reinforcement.sr > 0 ? reinforcement.sr : Infinity);
    const bars = gridOnBars(input, d);
    const candidates = bars.on
      ? Array.from({ length: Math.max(1, Math.floor(limit / bars.spacing + 1e-9)) }, (_, k) => (k + 1) * bars.spacing)
      : [...new Set([limit, ...Array.from({ length: 8 }, (_, k) => Math.floor((limit - 25 * (k + 1)) / 25) * 25).filter(v => v >= Math.max(50, Math.min(0.4 * d, limit)))])];
    if (!candidates.length) candidates.push(limit);
    const trials = candidates.map(sr => calculate({ ...input, reinforcement: { ...reinforcement, sr, srAuto: false } }, { ...options, srFixed: true }));
    const score = r => [r.status === STATES.pass ? 0 : 1, r.status === STATES.pass ? (r.layout?.links?.length ?? 0) : (r.governing?.ur ?? Infinity)];
    const best = trials.reduce((a, b) => { const [sa, va] = score(a); const [sb, vb] = score(b); return sb < sa || (sb === sa && vb < va) ? b : a; });
    if (best.envelope?.sr && best.layout?.layers?.length) best.notes = [`Auto s_r = ${best.envelope.sr} mm (fewest links that pass among ${candidates.join(', ')} mm).`, ...(best.notes ?? [])];
    return best;
  }
  // Radial spacing for the required A_sw (Eq. 6.52) and the layer grid: the auto arrangement's s_r, else
  // the recommended 0.75d rounded down to 5 mm.
  const srLimit = Math.floor((P.radialSpacing * d) / 5 + 1e-9) * 5;
  // Auto grid follows the flexural bars: links at bar intersections, s_r = s_t = bar spacing, when the
  // spacing is the same both ways, the column is not rotated and the spacing is within 0.75d.
  const barGrid = gridOnBars(input, d);
  // On the bar grid the rings stay on bar lines: s_r is rounded down to a whole multiple of the bar spacing.
  const sr = barGrid.on ? Math.max(1, Math.floor((reinforcement.sr || barGrid.spacing) / barGrid.spacing + 1e-9)) * barGrid.spacing : reinforcement.sr;
  ctx.envelopeSr = reinforcement.mode === 'auto' && sr > 0 ? Math.min(sr, srLimit) : srLimit;
  const srNote = barGrid.note ?? (reinforcement.mode === 'auto' && sr > srLimit + 1e-9
    ? `Auto arrangement: s_r = ${sr} mm exceeds 0.75d = ${(P.radialSpacing * d).toFixed(0)} mm (§9.4.3(1)); ${srLimit} mm used.` : null);
  const demands = loads.map(load => demandFor(ctx, load));
  const needing = demands.filter(item => item.required);
  if (needing.some(item => item.aOut === null)) {
    const issue = { state: STATES.unsupportedGeometry, message: 'The outer perimeter u_out,ef cannot be reached inside the slab.' };
    return { status: issue.state, issues: [issue], notes: [], profile, loads: [], input };
  }
  const envelope = { aswReq: Math.max(0, ...needing.map(item => item.aswReq)), aOut: Math.max(0, ...needing.map(item => item.aOut)), sr: ctx.envelopeSr };
  envelope.uOut = needing.length ? Math.max(...needing.map(item => item.uOut)) : null;
  ctx.compactOuterZone = Boolean(profile.compactOuterZone && envelope.aOut > 0 && envelope.aOut < 3 * d - 1e-6);
  const limitIssues = [];
  const linkLimit = options.linkLimit;
  let layoutOut = envelope.aOut;
  const limitNotes = [];
  if (!ctx.compactOuterZone && Number.isFinite(linkLimit) && needing.length) {
    // Layers sit on a grid first + k·s_r; keep the last one inside the drop.
    const first = Math.max(Math.ceil((P.firstLayerMin * d) / 5) * 5, Math.floor((0.4 * d) / 5 + 1e-9) * 5);
    const sr = ctx.envelopeSr;
    const lastNeeded = first + Math.max(0, Math.ceil((envelope.aOut - P.outerK * d - first) / sr - 1e-9)) * sr;
    if (lastNeeded > linkLimit + 1e-9) {
      layoutOut = first + Math.max(0, Math.floor((linkLimit - first) / sr + 1e-9)) * sr + P.outerK * d;
      limitNotes.push(`u_out,ef with d_H lies ${envelope.aOut.toFixed(0)} mm from the column face, beyond the drop. Links inside the drop stop at ${linkLimit.toFixed(0)} mm; the slab beyond the drop edge is checked, and given links where needed, in the section around the drop (u1,ext, see Help).`);
    }
  }

  let layout;
  if (options.noLinks) layout = { mode: 'auto', layers: [], reason: options.noLinks };
  else if (reinforcement.enabled === false) layout = { mode: 'none', layers: [], reason: 'No punching reinforcement: tick "Provide punching reinforcement" to add shear links.' };
  else if (reinforcement.mode === 'auto') {
    const type = reinforcement.arrangement ?? 'grid';
    // Inside a drop the links run out to the drop edge: the last perimeter lies within one s_r of the
    // drop limit (l_H,min − c), so the outer zone of the drop is reinforced up to the depth change.
    const dropEdgeOut = !ctx.compactOuterZone && Number.isFinite(linkLimit) && needing.length
      ? Math.max(layoutOut, linkLimit - ctx.envelopeSr + 1e-6 + P.outerK * d)
      : layoutOut;
    const first = Math.max(Math.ceil((P.firstLayerMin * d) / 5) * 5, Math.floor((0.4 * d) / 5 + 1e-9) * 5);
    // Fig. 6.22 (u_out,ef from the outer links) for internal columns without openings or a drop limit;
    // elsewhere the outer perimeter stays the clipped path at a_out and s_t ≤ 2d outside u1 is a check.
    const fig622 = ctx.position?.kind === 'internal' && !(input.openings?.length) && !Number.isFinite(linkLimit);
    const uReq = fig622 ? envelope.uOut : null;
    const generated = !needing.length
      ? { layers: [], reason: 'No punching reinforcement required.' }
      : arrangedLayers({ model, d, aOut: ctx.compactOuterZone ? 0 : dropEdgeOut, maxOffset: ctx.compactOuterZone ? Math.min(linkLimit ?? Infinity, 1.5 * d) : Infinity, type, sr: ctx.envelopeSr, st: barGrid.on ? barGrid.spacing : reinforcement.st, onBars: barGrid.on, aswReq: envelope.aswReq, rails: reinforcement.rails, diameter: reinforcement.diameter, shape: reinforcement.shape, first, outerK: P.outerK, legGap: reinforcement.legGap, uReq, thin: reinforcement.thin !== false, fck: materials.fck, fyk: materials.fyk });
    layout = { mode: 'auto', arrangement: type, fig622, layers: generated.layers, reason: generated.layers.length ? null : generated.reason };
    if (generated.note) limitNotes.push(generated.note);
    if (srNote && needing.length) limitNotes.push(srNote);
  } else {
    const layers = (options.layers ?? groupLayers(reinforcement)).map(layer => ({ omitted: [], ...layer }));
    const arrangement = layers[0]?.arrangement;
    const placed = layers.length && layers.every(layer => layer.points && layer.arrangement === arrangement);
    layout = { mode: 'provided', arrangement: placed ? arrangement : null, layers, reason: null,
      fig622: Boolean(placed && ctx.position.kind === 'internal' && !input.openings.length && !Number.isFinite(linkLimit)) };
  }
  const detailing = layout.layers.length ? detailingChecks({ slab: input.slab, anchorage: reinforcement.anchorage, diameters: layout.layers.map(layer => layer.diameter) }) : null;
  model.anchorageState = detailing?.status;
  const base = options.layerBase ?? 0;
  const links = buildLinks(model, layout.layers, layout.mode === 'auto' ? 'auto' : 'user', base);
  const summary = layerSummary(model, layout.layers, links, base);
  // Drop: grid links out to the drop edge beyond the last ring (detailing; not counted in the checks).
  if (!ctx.compactOuterZone && layout.mode === 'auto' && layout.arrangement === 'grid' && options.dropBox && layout.layers.length) {
    const fill = dropFillPoints({ column: model.column, layers: layout.layers, sr: ctx.envelopeSr, box: options.dropBox, d, widen: reinforcement.thin !== false });
    const last = layout.layers.at(-1);
    const edge = { ...last, id: 'E', points: fill.map(p => ({ ...p, s: arcLengthAt(model.column, last.offset, p) })), omitted: [] };
    if (fill.length) links.push(...buildLinks(model, [edge], 'auto', base).map(link => ({ ...link, layerId: 'E', layerIndex: -1, edge: true })));
    layout.edgeLinks = fill.length;
  }
  layout.layers = layout.layers.map((layer, i) => ({ ...layer, id: summary[i].id }));
  if (layout.arrangement === 'cruciform') summary.forEach(layer => { layer.tangential = faceGaps(model.column, layer.offset, layer.tangential); });
  // Grid rings (closed, internal column): s_t as straight distances between neighbouring links.
  if (layout.arrangement === 'grid' && layout.fig622) summary.forEach((layer, i) => {
    if (layout.layers[i].shape === 'single') layer.tangential = ringGaps(links.filter(link => link.layerId === layer.id).flatMap(link => link.legs.filter(leg => leg.effective).map(leg => toLocal(model.column, leg))));
  });
  if (layout.fig622 && layout.layers.length) {
    const outer = summary.at(-1);
    const points = links.filter(link => link.layerId === outer.id)
      .flatMap(link => link.legs.filter(leg => leg.effective).map(leg => toLocal(model.column, leg)));
    layout.outerEf = outerPerimeterEf(points, d, P.outerK);
  }
  const geometry = geometryLimits(ctx, Math.max(2 * d, envelope.aOut, ...layout.layers.map(layer => layer.offset)));
  if (Number.isFinite(linkLimit)) layout.layers.forEach((layer, index) => {
    if (layer.offset > linkLimit + 1e-9) limitIssues.push({ state: STATES.fail, message: `Layer ${layer.id ?? 'L' + (base + index + 1)} at ${layer.offset} mm lies outside the drop (links must stay within ${linkLimit.toFixed(0)} mm of the column face).` });
  });
  ctx.layoutOut = layoutOut;
  const results = demands.map(item => loadResult(ctx, item, layout, summary, links, detailing));

  const notes = [...geometry.notes, ...limitNotes, ...new Set(results.map(entry => entry.beta?.note).filter(Boolean))];
  const capped = results.filter(entry => entry.rows.some(item => (item.id === 'max' || item.id === 'kmax') && item.status === STATES.fail));
  if (capped.length) notes.unshift(`${capped.map(entry => entry.name).join(', ')}: v_Ed exceeds v_Rd,max or the upper limit with links. Adding links cannot resolve this; increase the slab depth, column size or concrete strength.`);
  const governing = results.reduce((best, entry) => (entry.ur > best.ur ? entry : best), results[0]);
  const governingRow = governing.rows.filter(counts).reduce((best, entry) => (!best || entry.ur > best.ur ? entry : best), null);
  const layerStatus = summary.map(layer => {
    const own = governing.layoutCheck?.layerRows.find(entry => entry.layer.id === layer.id);
    const reinforcementState = !governing.required ? STATES.notRequired : layer.asw >= envelope.aswReq - 1e-9 ? STATES.pass : STATES.fail;
    const detailRows = own ? [own.tangential, own.minimum, own.placement].filter(Boolean) : [];
    const detailingState = detailRows.some(entry => entry.status === STATES.fail) || detailing?.status === STATES.fail ? STATES.fail : detailing?.status ?? STATES.confirm;
    return { ...layer, reinforcementState, detailingState, tangentialLimit: own?.limit ?? null, minArea: own?.minArea ?? null };
  });
  const loadIssues = results.filter(entry => entry.beta?.state).map(entry => ({ state: entry.beta.state, message: entry.beta.message }));
  const allIssues = [...geometry.issues, ...limitIssues, ...loadIssues];
  return {
    status: worstState([...results.map(entry => entry.status), ...allIssues.map(entry => entry.state)]),
    issues: allIssues, notes, profile: ctx.profile, input, position: ctx.position, shadows: ctx.shadows,
    section: ctx.section, resistance: ctx.res, vRdMax: ctx.vRdMax, fywdEf: ctx.fywdEf, u0: ctx.u0, u1: ctx.u1, u1Star: ctx.u1Star, u1Offset: ctx.u1Offset, faceD: ctx.faceD,
    envelope, model, loads: results, detailing, compactOuterZone: ctx.compactOuterZone,
    methods: [
      ...(layout.outerEf ? ['Effective outer perimeter from the outer link geometry (Fig. 6.22)'] : []),
      ...(results.some(entry => entry.beta?.note) ? ['Opening shadows with β from the unreduced moment perimeter'] : []),
    ],
    governing: { load: governing.name, loadId: governing.id, check: governingRow?.label ?? null, ur: governing.ur },
    layout: { ...layout, links, summary: layerStatus },
  };
}
