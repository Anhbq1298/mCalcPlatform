// Inner section of a rectangular head that straddles l_H = 2h_H (internal column, Fig. 6.18).
// Physics: the punching crack rises at θ = arctan(1/2) from the column face. On a face with l_H ≥ 2h_H it
// crosses the full d_H inside the head and reaches the top at 2d_H (inner section with d_H). On a face
// with l_H < 2h_H it would leave through the side of the head before crossing h_H, so there the head acts
// with the column and the crack starts at the head edge through the slab d (2d from the head outline).
// The inner section is therefore composite (tool method, see Help):
//   long faces (l_H ≥ 2h_H): straight parts of length = column face, at 2d_H from the face, with d_H;
//   the rest (short faces and corners): the slab section at 2d from the head outline, with d.
// Check: β·V_Ed ≤ Σ v_Rd,c(d_i)·u_i·d_i, reported as v_Ed = βV/Σ(u_i·d_i) against the d-weighted v_Rd,c.
// Links for this section are not designed: the row fails with a note when the concrete does not suffice.
import { worstState } from './calculate.mjs';
import { STATES } from './inputs.mjs';
import { row } from './reinforcement-checks.mjs';

const FACE = { xMax: 'cy', xMin: 'cy', yMax: 'cx', yMin: 'cx' }; // column face length per head side
const SIDE = { xMax: 'y', xMin: 'y', yMax: 'x', yMin: 'x' }; // head side length direction

export function compositeInner({ inner, outer, input, geo, d, dH }) {
  const e = geo.extents;
  const dropSide = { x: e.xMax - e.xMin, y: e.yMax - e.yMin };
  const long = Object.keys(FACE).filter(side => geo.lSides[side] >= 2 * geo.hH - 1e-9);
  const uLong = long.reduce((sum, side) => sum + input.column[FACE[side]], 0);
  const uRest = outer.u1 - long.reduce((sum, side) => sum + dropSide[SIDE[side]], 0);
  const sumUd = uLong * dH + uRest * d;
  inner.compositeSection = { uLong, uRest, d, dH, long };
  inner.loads.forEach((load, i) => {
    const out = outer.loads[i];
    const at = id => load.rows.findIndex(entry => entry.id === id);
    const k = at('concrete');
    const vRdcH = load.rows[k]?.resistance;
    const vRdcS = out?.rows.find(entry => entry.id === 'concrete')?.resistance;
    if (k < 0 || !(vRdcH > 0) || !(vRdcS > 0)) return;
    const beta = load.beta?.value ?? 1;
    const vEd = (beta * load.V * 1e3) / sumUd;
    const vRd = (vRdcH * uLong * dH + vRdcS * uRest * d) / sumUd;
    const detail = `Composite inner section (tool method, see Help): ${uLong.toFixed(0)} mm at 2d_H from the faces with l_H ≥ 2h_H, d_H = ${dH.toFixed(1)} mm, v_Rd,c = ${vRdcH.toFixed(3)} MPa; ${uRest.toFixed(0)} mm at 2d from the head outline, d = ${d.toFixed(1)} mm, v_Rd,c = ${vRdcS.toFixed(3)} MPa. β·V_Ed ≤ Σ v_Rd,c·u·d.`;
    const ok = vEd <= vRd + 1e-9;
    load.rows[k] = row('concrete', '§6.4.2(9), Fig. 6.18 (composite, tool method)', 'Inside the drop: composite section (d_H where l_H ≥ 2h_H, d elsewhere)', vEd, vRd, ok ? STATES.pass : STATES.fail, {
      unit: 'MPa',
      detail: ok ? detail : `${detail} Links are not designed for this section: extend the head to l_H ≥ 2h_H = ${(2 * geo.hH).toFixed(0)} mm on every face, or thicken the slab or head.`,
    });
    load.required = false;
    load.ur = Math.max(0, ...load.rows.filter(entry => Number.isFinite(entry.ur)).map(entry => entry.ur));
    load.status = worstState(load.rows.map(entry => entry.status));
  });
}
