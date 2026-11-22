// Calculation context shared by all combinations: position, section, resistances and perimeters.
import { openingDistance, pathExtent } from './geometry.mjs';
import { STATES, derivedSection } from './inputs.mjs';
import { effectiveIntervals, openingShadows } from './perimeters.mjs';
import { classifyPosition, edgePerimeters } from './position.mjs';
import { profileFor } from './profile.mjs';
import { concreteResistance, fywdEffective, maximumResistance, reinforcementRatio } from './resistance.mjs';

export function positionIssues(input, position) {
  if (position.kind === 'invalid') return [{ state: STATES.unsupportedGeometry, message: position.message }];
  if (position.kind !== input.column.position) {
    const edges = position.normals.map(normal => normal.edge).join(' and ');
    return [{ state: STATES.incomplete, message: `Column position is set to ${input.column.position}, but the geometry is ${position.kind === 'internal' ? 'an internal column' : `${position.kind === 'edge' ? 'an edge' : 'a corner'} column (face flush with slab edge ${edges})`}. Correct the position or the slab edges.` }];
  }
  return [];
}

export function createContext(input, options = {}) {
  const { column, materials, slab } = input;
  const profile = profileFor(input.code?.profile);
  const position = classifyPosition(column, slab);
  const section = derivedSection(input);
  const { d } = section;
  const rhoX = reinforcementRatio(section.asx, section.dx);
  const rhoY = reinforcementRatio(section.asy, section.dy);
  const sigmaCp = ((input.prestress?.sigmaX ?? 0) + (input.prestress?.sigmaY ?? 0)) / 2;
  const fckShear = profile.fckShearCap ? Math.min(materials.fck, profile.fckShearCap) : materials.fck; // SG NA 3.1.2(2)P
  const res = { ...concreteResistance({ fck: fckShear, d, rhoX, rhoY, sigmaCp }), fckShear };
  const openings = input.openings || [];
  const shadows = openingShadows(column, openings, d);
  const memo = new Map();
  const model = { column, slab, openings, shadows, legGap: input.reinforcement.legGap };
  model.intervalsAt = r => {
    const key = Math.round(r * 1e6) / 1e6;
    if (!memo.has(key)) memo.set(key, effectiveIntervals(model, key));
    return memo.get(key);
  };
  const edge = edgePerimeters(position, d);
  const u1Offset = options.u1Offset ?? 2 * d;
  const u1 = model.intervalsAt(u1Offset).total;
  const u0 = options.face?.u0 ?? (edge ? edge.u0 : model.intervalsAt(0).total);
  return {
    input, profile, position, section: { ...section, rhoX, rhoY }, d, res, model, shadows, options, u1Offset,
    u0, u1, u1Star: edge?.u1Star ?? null, edge, faceD: options.face?.d ?? d,
    vRdMax: maximumResistance({ fck: fckShear, factor: profile.vRdMaxFactor }),
    fywdEf: fywdEffective(materials.fyk, d),
  };
}

// Geometry outside the verified scope: free edges reached by a perimeter or layer that are not the
// flush edges of an edge/corner column, and openings overlapping the column.
export function geometryLimits(ctx, reach) {
  const { input, position, shadows, d } = ctx;
  const issues = [];
  const notes = [];
  const extent = pathExtent(input.column, reach);
  const { slab } = input;
  const flush = position.flush ?? {};
  const crossing = [
    ['X min', !flush.xMin && extent.xMin < slab.xMin], ['X max', !flush.xMax && extent.xMax > slab.xMax],
    ['Y min', !flush.yMin && extent.yMin < slab.yMin], ['Y max', !flush.yMax && extent.yMax > slab.yMax],
  ].filter(([, hit]) => hit).map(([name]) => name);
  if (crossing.length) {
    issues.push({ state: STATES.unsupportedGeometry, message: `A check perimeter or link layer (up to ${reach.toFixed(0)} mm from the column face) reaches slab edge ${crossing.join(', ')}, which is not flush with the column. Fig. 6.15 perimeters for set-back edges are not implemented.` });
  }
  (input.openings || []).forEach((opening, index) => {
    const distance = openingDistance(input.column, opening);
    if (distance <= 1e-9) issues.push({ state: STATES.unsupportedGeometry, message: `Opening O${index + 1} overlaps the column.` });
    const shadow = shadows.find(item => item.index === index);
    if (shadow) notes.push(`Opening O${index + 1} is ${distance.toFixed(0)} mm from the column (≤ 6d = ${(6 * d).toFixed(0)} mm): the sector between the tangents is ineffective (§6.4.2(3))${shadow.replaced ? `, with l2 replaced by √(l1·l2) = ${shadow.effectiveWidth.toFixed(0)} mm` : ''}.`);
    else notes.push(`Opening O${index + 1} is ${distance.toFixed(0)} mm from the column, beyond 6d; only the opening itself is excluded from perimeters it crosses.`);
  });
  if (input.loadType === 'reaction') notes.push('V_Ed is the support reaction. No deduction is made for loads inside the control perimeter: EN 1992-1-1 gives V_Ed,red (Eq. 6.48) for column bases only.');
  if (ctx.res.fckShear < input.materials.fck) notes.push(`f_ck = ${ctx.res.fckShear} MPa used for shear strength (C_max = C50/60, NA 3.1.2(2)P).`);
  if (ctx.res.sigmaCp !== 0) notes.push(`σ_cp = ${ctx.res.sigmaCp.toFixed(2)} MPa included in Eq. 6.47 with k1 = 0.1.`);
  if (ctx.profile.needsConfirmation && input.code?.naConfirmed !== true) {
    issues.push({ state: STATES.notVerified, message: `${ctx.profile.label}: values come from secondary transcriptions of the National Annex. Confirm them against the NA text to remove this status.` });
  }
  if (ctx.res.vRdc <= 0) issues.push({ state: STATES.unsupportedLoading, message: 'In-plane tension makes v_Rd,c non-positive; this is outside the scope of Eq. 6.47.' });
  return { issues, notes };
}
