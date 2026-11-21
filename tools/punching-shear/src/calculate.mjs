// Punching shear design of internal slab–column connections to EN 1992-1-1:2004 §6.4 and §9.4.3.
import { basicPerimeter, loadedPerimeter, offsetOfPerimeter, openingDistance, pathExtent, perimeterAtOffset } from './geometry.mjs';
import { BETA_SIMPLIFIED_INTERNAL, betaMoment, shearDemand } from './demand.mjs';
import {
  CODE_PARAMETERS as P, concreteResistance, fywdEffective, maximumResistance, outerPerimeterLength,
  reinforcementRatio, requiredAswPerPerimeter,
} from './resistance.mjs';
import { STATES, derivedSection, validateBeta, validateGeometry, validateLoad, validateMaterials, validateReinforcement } from './inputs.mjs';
import { autoLayout, buildLinks, layerSummary } from './layout.mjs';
import { checkLayout, row } from './reinforcement-checks.mjs';
import { PROFILE } from './profile.mjs';

export { PROFILE };
const ORDER = [STATES.unsupportedGeometry, STATES.unsupportedLoading, STATES.fail, STATES.incomplete, STATES.notVerified, STATES.confirm, STATES.pass];
export const worstState = states => ORDER.find(state => states.includes(state)) ?? STATES.pass;
const informational = state => state === STATES.notRequired || state === STATES.linksRequired;
const counts = entry => entry.ur !== null && Number.isFinite(entry.ur) && !informational(entry.status) && entry.unit !== 'layers';

function normaliseLoads(loads = []) {
  return loads.map((load, index) => ({ name: load.name || 'Combination ' + (index + 1), V: load.V, Mx: load.Mx ?? 0, My: load.My ?? 0 }));
}

function betaFor(input, d, load) {
  if (input.beta.method === 'simplified') return { value: BETA_SIMPLIFIED_INTERNAL, method: '§6.4.3(6) simplified value, conditions confirmed by the user' };
  if (input.beta.method === 'user') return { value: input.beta.userValue, method: 'User-defined value; not calculated or independently verified by the tool' };
  return betaMoment(input.column, d, load.V, load.Mx, load.My);
}

function geometryLimits(input, d, reach) {
  const issues = [];
  const notes = [];
  const extent = pathExtent(input.column, reach);
  const { slab } = input;
  if (extent.xMin < slab.xMin || extent.xMax > slab.xMax || extent.yMin < slab.yMin || extent.yMax > slab.yMax) {
    issues.push({ state: STATES.unsupportedGeometry, message: `A check perimeter or link layer (up to ${reach.toFixed(0)} mm from the column face) reaches a slab edge. Perimeter clipping at free edges is not supported; treat the column as an edge or corner column.` });
  }
  (input.openings || []).forEach((opening, index) => {
    const distance = openingDistance(input.column, opening);
    const limit = Math.max(6 * d, reach);
    if (distance <= limit) {
      issues.push({ state: STATES.unsupportedGeometry, message: `Opening O${index + 1} is ${distance.toFixed(0)} mm from the column face, within ${limit.toFixed(0)} mm (6d per §6.4.2(3), or the reinforcement zone). Perimeter reduction for openings is not implemented.` });
    } else notes.push(`Opening O${index + 1} is ${distance.toFixed(0)} mm from the column face, beyond 6d and the reinforcement zone; no perimeter reduction applies (§6.4.2(3)).`);
  });
  return { issues, notes };
}

export function calculate(rawInput) {
  const loads = normaliseLoads(rawInput.loads);
  const input = { ...rawInput, loads };
  const issues = [...validateGeometry(input), ...validateMaterials(input), ...loads.flatMap(validateLoad), ...validateBeta(input.beta), ...validateReinforcement(input.reinforcement)];
  if (!loads.length) issues.push({ state: STATES.incomplete, message: 'Add at least one load combination.' });
  if (issues.length) return { status: worstState(issues.map(item => item.state)), issues, notes: [], profile: PROFILE, loads: [], input };

  const { column, materials, reinforcement } = input;
  const section = derivedSection(input);
  const { d } = section;
  const rhoX = reinforcementRatio(section.asx, section.dx);
  const rhoY = reinforcementRatio(section.asy, section.dy);
  const res = concreteResistance({ fck: materials.fck, d, rhoX, rhoY });
  const u0 = loadedPerimeter(column);
  const u1 = basicPerimeter(column, d);
  const vRdMax = maximumResistance({ fck: materials.fck });
  const fywdEf = fywdEffective(materials.fyk, d);
  const srDesign = Math.floor((P.radialSpacing * d) / 5 + 1e-9) * 5;

  const demands = loads.map(load => {
    const beta = betaFor(input, d, load);
    const vEd0 = shearDemand({ V: load.V, beta: beta.value, u: u0, d });
    const vEd1 = shearDemand({ V: load.V, beta: beta.value, u: u1, d });
    const required = vEd1 > res.vRdc + 1e-12;
    const uOut = outerPerimeterLength({ beta: beta.value, V: load.V, vRdc: res.vRdc, d });
    const aOut = offsetOfPerimeter(column, uOut);
    const aswReq = required ? requiredAswPerPerimeter({ vEd: vEd1, vRdc: res.vRdc, u1, sr: srDesign, fywdEf }) : 0;
    return { load, beta, vEd0, vEd1, required, uOut, aOut, aswReq };
  });
  const needing = demands.filter(item => item.required);
  const envelope = {
    aswReq: Math.max(0, ...needing.map(item => item.aswReq)),
    aOut: Math.max(0, ...needing.map(item => item.aOut)),
    sr: srDesign,
  };
  envelope.uOut = needing.length ? perimeterAtOffset(column, envelope.aOut) : null;

  const model = { column, slab: input.slab, openings: input.openings || [], legGap: reinforcement.legGap };
  let layout = { mode: reinforcement.mode, layers: [], reason: null };
  if (reinforcement.mode === 'auto') {
    const generated = needing.length
      ? autoLayout({ column, d, asw: envelope.aswReq, aOut: envelope.aOut, fck: materials.fck, fyk: materials.fyk, diameter: reinforcement.diameter, shape: reinforcement.shape, legGap: reinforcement.legGap, limits: P })
      : { layers: [], reason: 'No punching reinforcement required.' };
    layout = { mode: 'auto', layers: generated.layers, reason: generated.layers.length ? null : generated.reason };
  } else layout = { mode: 'provided', layers: reinforcement.layers.map(layer => ({ omitted: [], ...layer })), reason: null };
  const links = buildLinks(model, layout.layers, layout.mode === 'auto' ? 'auto' : 'user');
  const summary = layerSummary(model, layout.layers, links);

  const reach = Math.max(2 * d, envelope.aOut, ...layout.layers.map(layer => layer.offset));
  const geometry = geometryLimits(input, d, reach);
  const notes = [...geometry.notes];
  if (input.loadType === 'reaction') notes.push('V_Ed is the support reaction. The reduction for loads inside the control perimeter (§6.4.4(2)) is not applied, which is conservative.');

  const results = demands.map(item => {
    const { load, beta, vEd0, vEd1, required, uOut, aOut, aswReq } = item;
    const rows = [
      row('max', '§6.4.5(3), Eq. 6.53', 'Maximum punching stress at u0', vEd0, vRdMax, null, { unit: 'MPa' }),
      required
        ? row('concrete', '§6.4.4(1), Eq. 6.47', 'Concrete punching resistance at u1 (links required)', vEd1, res.vRdc, STATES.linksRequired, { unit: 'MPa', detail: 'v_Ed > v_Rd,c: links provide the resistance.' })
        : row('concrete', '§6.4.4(1), Eq. 6.47', 'Concrete punching resistance at u1', vEd1, res.vRdc, null, { unit: 'MPa' }),
    ];
    let layoutCheck = null;
    if (!required) {
      rows.push(row('reinforced', '§6.4.5', 'Punching reinforcement', null, null, STATES.notRequired, { detail: 'v_Ed ≤ v_Rd,c' }));
    } else if (!layout.layers.length) {
      rows.push(row('reinforced', '§6.4.5, Eq. 6.52', 'Reinforced punching resistance at u1', vEd1, 0.75 * res.vRdc, STATES.fail, { unit: 'MPa', detail: layout.reason || 'No links provided.' }));
    } else {
      layoutCheck = checkLayout({ d, fck: materials.fck, fyk: materials.fyk, vRdc: res.vRdc, vEd: vEd1, u1, aOut, summary, links });
      rows.push(...layoutCheck.rows);
    }
    const status = worstState(rows.map(entry => informational(entry.status) ? STATES.pass : entry.status));
    const ur = Math.max(0, ...rows.filter(counts).map(entry => entry.ur));
    return { ...load, beta, vEd0, vEd1, required, uOut, aOut, aswReq, rows, layoutCheck, status, ur };
  });

  const capped = results.filter(entry => entry.rows.some(item => (item.id === 'max' || item.id === 'kmax') && item.status === STATES.fail));
  if (capped.length) notes.unshift(`${capped.map(entry => entry.name).join(', ')}: v_Ed exceeds v_Rd,max or k_max·v_Rd,c. Adding links cannot resolve this; increase the slab depth, column size or concrete strength.`);
  const governing = results.reduce((best, entry) => (entry.ur > best.ur ? entry : best), results[0]);
  const governingRow = governing.rows.filter(counts).reduce((best, entry) => (!best || entry.ur > best.ur ? entry : best), null);
  const layerStatus = summary.map(layer => {
    const own = governing.layoutCheck?.layerRows.find(entry => entry.layer.id === layer.id);
    const reinforcementState = !governing.required ? STATES.notRequired : layer.asw >= envelope.aswReq - 1e-9 ? STATES.pass : STATES.fail;
    const detailRows = own ? [own.tangential, own.minimum, own.placement].filter(Boolean) : [];
    const detailingState = detailRows.some(entry => entry.status === STATES.fail) ? STATES.fail : STATES.confirm;
    return { ...layer, reinforcementState, detailingState, tangentialLimit: own?.limit ?? null, minArea: own?.minArea ?? null };
  });
  const status = worstState([...results.map(entry => entry.status), ...geometry.issues.map(entry => entry.state)].map(state => (informational(state) ? STATES.pass : state)));
  return {
    status, issues: geometry.issues, notes, profile: PROFILE, input,
    section: { ...section, rhoX, rhoY }, resistance: res, vRdMax, fywdEf, u0, u1, envelope,
    loads: results, governing: { load: governing.name, check: governingRow?.label ?? null, ur: governing.ur },
    layout: { ...layout, links, summary: layerStatus },
  };
}
