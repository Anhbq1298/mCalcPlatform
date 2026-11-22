// Plate bending at the welded bar rows (tension side). Units: N, mm, MPa.
// Model: each bar row loads a plate strip cantilevering from the toe of the member-to-plate weld
// on the tension flange. The strip width is the smallest yield-line length of an equivalent T-stub
// (EN 1993-1-8 Table 6.4, unstiffened flange, end-row patterns) adapted to welded bars. No prying:
// the bar force from equilibrium is not amplified, which needs the plate beyond the bar row not to
// bear on the concrete. Resistance per row: F_Rd = M_pl,Rd / m with M_pl,Rd = l_eff·t²·f_y / (4γ_M0).
import { GAMMA } from './materials.mjs';
import { stiffnessRatio } from './equilibrium.mjs';
import { anchorage } from './rebar.mjs';

export function effectiveLength({ n, p, m, e, B }) {
  const circular = n === 1 ? 2 * Math.PI * m : Math.min(n * 2 * Math.PI * m, 2 * Math.PI * m + 2 * (n - 1) * p);
  const nonCircular = 4 * m + 1.25 * e + (n - 1) * p;
  return { circular, nonCircular, leff: Math.min(circular, nonCircular, B) };
}

export function rowBending(row, bars, { plate, member, plateGrade, rebars, concrete }) {
  const rowBars = bars.filter(bar => bar.row === row.index);
  const F = rowBars.reduce((s, bar) => s + bar.F, 0);
  const base = { index: row.index, y: row.y, n: row.n, F };
  if (!(F > 0)) return { ...base, kind: 'unloaded' };
  if (row.y <= member.h / 2 - member.tf) return { ...base, kind: 'inside' };
  if (row.y <= member.h / 2) return { ...base, kind: 'flange' };
  const m = row.y - member.h / 2 - 0.8 * Math.SQRT2 * member.weld;
  if (!(m > 0)) return { ...base, kind: 'flange' };
  const p = row.n > 1 ? row.s : 0;
  const e = plate.B / 2 - (row.n - 1) * p / 2;
  const lengths = effectiveLength({ n: row.n, p, m, e, B: plate.B });
  const Mpl = lengths.leff * plate.t ** 2 * plateGrade.fy / (4 * GAMMA.M0);
  const FRd = Mpl / m;
  const tReq = Math.sqrt(4 * F * m * GAMMA.M0 / (lengths.leff * plateGrade.fy));
  const area = Math.PI * row.d ** 2 / 4;
  const lb = anchorage({ d: row.d, sigma: rebars.fyk / 1.15, concrete, goodBond: rebars.goodBond, shape: 'straight', cd: 0, provided: rebars.length });
  const le = 0.5 * Math.min(rebars.length, lb.lbRqd);
  const stiffness = stiffnessRatio({ leff: lengths.leff, t: plate.t, m, nBars: row.n, area, le });
  return { ...base, kind: 'cantilever', m, p, e, ...lengths, Mpl, FRd, MEd: F * m, tReq, le, stiffness };
}
