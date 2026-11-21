// Punching shear design of slab–column connections to EN 1992-1-1:2004 §6.4 and §9.4.3:
// internal, edge and corner columns, openings, in-plane stress, individual link layouts.
import { shearDemand } from './demand.mjs';
import { betaFor } from './beta.mjs';
import { detailingChecks } from './detailing.mjs';
import { STATES, restoreInputs, validateBeta, validateGeometry, validateLoad, validateMaterials, validateReinforcement } from './inputs.mjs';
import { autoLayout, buildLinks, layerSummary } from './layout.mjs';
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
  return loads.map((load, index) => ({ name: load.name || 'Combination ' + (index + 1), V: load.V, Mx: load.Mx ?? 0, My: load.My ?? 0 }));
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
    required && ctx.options.noLinks
      ? row('concrete', '§6.4.4(1), Eq. 6.47', ctx.options.label ? ctx.options.label + ': concrete punching resistance' : 'Concrete punching resistance at u1', vEd1, res.vRdc, STATES.unsupportedGeometry, { unit: 'MPa', detail: ctx.options.noLinks })
      : required
      ? row('concrete', '§6.4.4(1), Eq. 6.47', 'Concrete punching resistance at u1 (links required)', vEd1, res.vRdc, STATES.linksRequired, { unit: 'MPa', detail: 'v_Ed > v_Rd,c: links provide the resistance.' })
      : row('concrete', '§6.4.4(1), Eq. 6.47', ctx.options.label ? ctx.options.label + ': concrete punching resistance' : 'Concrete punching resistance at u1', vEd1, res.vRdc, null, { unit: 'MPa' }),
  ];
  if (beta.state) rows.push(row('beta', '§6.4.3', 'Load increment factor β', null, null, beta.state, { detail: beta.message }));
  let layoutCheck = null;
  if (required && ctx.options.noLinks) return { ...item, ...load, rows, layoutCheck, status: worstState(rows.map(entry => entry.status)), ur: Math.max(0, ...rows.filter(counts).map(entry => entry.ur)) };
  if (!required) rows.push(row('reinforced', '§6.4.5', 'Punching reinforcement', null, null, STATES.notRequired, { detail: 'v_Ed ≤ v_Rd,c' }));
  else if (!layout.layers.length) rows.push(row('reinforced', '§6.4.5, Eq. 6.52', 'Reinforced punching resistance at u1', vEd1, 0.75 * res.vRdc, STATES.fail, { unit: 'MPa', detail: layout.reason || 'No links provided.' }));
  else {
    const { materials } = input;
    layoutCheck = checkLayout({ d, fck: materials.fck, fyk: materials.fyk, vRdc: res.vRdc, vEd: vEd1, u1: ctx.u1, aOut: Math.min(aOut, ctx.layoutOut ?? aOut), summary, links, kMax: ctx.profile.kMax, kMaxLabel: ctx.profile.kMaxLabel, detailing });
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
  ctx.envelopeSr = Math.floor((P.radialSpacing * d) / 5 + 1e-9) * 5;
  const demands = loads.map(load => demandFor(ctx, load));
  const needing = demands.filter(item => item.required);
  if (needing.some(item => item.aOut === null)) {
    const issue = { state: STATES.unsupportedGeometry, message: 'The outer perimeter u_out,ef cannot be reached inside the slab.' };
    return { status: issue.state, issues: [issue], notes: [], profile, loads: [], input };
  }
  const envelope = { aswReq: Math.max(0, ...needing.map(item => item.aswReq)), aOut: Math.max(0, ...needing.map(item => item.aOut)), sr: ctx.envelopeSr };
  envelope.uOut = needing.length ? model.intervalsAt(envelope.aOut).total : null;
  const limitIssues = [];
  const linkLimit = options.linkLimit;
  let layoutOut = envelope.aOut;
  if (Number.isFinite(linkLimit) && needing.length && envelope.aOut - P.outerK * d > linkLimit) {
    const first = Math.max(Math.ceil((P.firstLayerMin * d) / 5) * 5, Math.floor((0.4 * d) / 5 + 1e-9) * 5);
    layoutOut = first + Math.max(0, Math.floor((linkLimit - first) / ctx.envelopeSr + 1e-9)) * ctx.envelopeSr + P.outerK * d;
    limitIssues.push({ state: STATES.confirm, message: `u_out,ef with d_H lies ${envelope.aOut.toFixed(0)} mm from the column face, beyond the drop. Links are kept inside the drop (outermost layer ≤ ${linkLimit.toFixed(0)} mm) and the slab beyond the drop edge is covered by the check at u1,ext. This follows §6.4.2(9) but the layout rule is an interpretation.` });
  }

  let layout;
  if (options.noLinks) layout = { mode: 'auto', layers: [], reason: options.noLinks };
  else if (reinforcement.mode === 'auto') {
    const generated = needing.length
      ? autoLayout({ model, d, asw: envelope.aswReq, aOut: layoutOut, fck: materials.fck, fyk: materials.fyk, diameter: reinforcement.diameter, shape: reinforcement.shape, limits: P })
      : { layers: [], reason: 'No punching reinforcement required.' };
    layout = { mode: 'auto', layers: generated.layers, reason: generated.layers.length ? null : generated.reason };
  } else layout = { mode: 'provided', layers: reinforcement.layers.map(layer => ({ omitted: [], ...layer })), reason: null };
  const detailing = layout.layers.length ? detailingChecks({ slab: input.slab, anchorage: reinforcement.anchorage, diameters: layout.layers.map(layer => layer.diameter) }) : null;
  model.anchorageState = detailing?.status;
  const links = buildLinks(model, layout.layers, layout.mode === 'auto' ? 'auto' : 'user');
  const summary = layerSummary(model, layout.layers, links);
  const geometry = geometryLimits(ctx, Math.max(2 * d, envelope.aOut, ...layout.layers.map(layer => layer.offset)));
  if (Number.isFinite(linkLimit)) layout.layers.forEach((layer, index) => {
    if (layer.offset > linkLimit + 1e-9) limitIssues.push({ state: STATES.fail, message: `Layer L${index + 1} at ${layer.offset} mm lies outside the drop (links must stay within ${linkLimit.toFixed(0)} mm of the column face).` });
  });
  ctx.layoutOut = layoutOut;
  const results = demands.map(item => loadResult(ctx, item, layout, summary, links, detailing));

  const notes = [...geometry.notes];
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
    envelope, model, loads: results, detailing,
    governing: { load: governing.name, check: governingRow?.label ?? null, ur: governing.ur },
    layout: { ...layout, links, summary: layerStatus },
  };
}
