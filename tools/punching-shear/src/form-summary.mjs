// One-line summaries shown on the collapsed input cards (keys are the group titles).
const n0 = value => (Number.isFinite(value) ? String(Math.round(value)) : '—');
const PROFILE = { cen: 'CEN values', sg: 'SG NA', uk: 'UK NA' };
const POSITION = { internal: 'internal', edge: 'edge', corner: 'corner' };

export const SUMMARY = {
  'Design basis': s => `${PROFILE[s.code.profile] ?? s.code.profile} · ${POSITION[s.column.position] ?? s.column.position}`,
  Column: s => (s.column.shape === 'circular' ? `Ø${n0(s.column.diameter)}` : `${n0(s.column.cx)} × ${n0(s.column.cy)}${s.column.rotation ? ` · ${s.column.rotation}°` : ''}`),
  Slab: s => `h ${n0(s.slab.h)} · ${s.slab.depthMode === 'explicit' ? `d ${n0((s.slab.dx + s.slab.dy) / 2)}` : 'd from bars'}`,
  'Drop panel / column head': s => (s.head?.enabled ? (s.head.shape === 'circular' ? `Ø${n0(s.head.diameter)}` : `${n0(s.head.lx)} × ${n0(s.head.ly)}`) + ` × ${n0(s.head.depth)}` : 'none'),
  Openings: s => (s.openings?.length ? `${s.openings.length} opening${s.openings.length > 1 ? 's' : ''}` : 'none'),
  Materials: s => `f_ck ${n0(s.materials.fck)} · f_yk ${n0(s.materials.fyk)}`,
  'In-plane normal stress': s => (s.prestress?.sigmaX || s.prestress?.sigmaY ? `σ ${s.prestress.sigmaX ?? 0} / ${s.prestress.sigmaY ?? 0} MPa` : 'none'),
  'Top flexural reinforcement': s => (s.flexure.areaMode === 'explicit' ? `A_s ${n0(s.flexure.asx)} / ${n0(s.flexure.asy)} mm²/m` : `Ø${s.flexure.phiX}@${s.flexure.sX} / Ø${s.flexure.phiY}@${s.flexure.sY}`),
  'Design actions': s => `${s.loads.length} comb. · V_Ed ≤ ${n0(Math.max(0, ...s.loads.map(load => load.V || 0)))} kN`,
  'Load increment factor $\\beta$': s => (s.beta.method === 'simplified' ? 'simplified' : s.beta.method === 'user' ? `user ${s.beta.userValue}` : 'from moments'),
  'Punching reinforcement': s => `${s.reinforcement.mode === 'auto' ? 'auto' : 'provided'} · Ø${s.reinforcement.diameter} ${s.reinforcement.shape === 'double' ? 'two-leg' : 'single-leg'}`,
};
