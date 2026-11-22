// Auto arrangement as a constrained search. The user sets the arrangement type, the smallest bar Ø, the
// largest bar Ø (default 16) and the maximum radial spacing s_r; links follow the slab bars for the grid.
// When the layout as first built does not pass, every combination within the constraints is tried —
//   bar Ø (Ø min … Ø max, while the hook still fits), radial lines per face (radial: +0 … +4; grid: with
//   and without ring widening) and s_r (≤ the maximum; on the bar grid, multiples of the bar spacing) —
// and the passing layout with the least link steel ΣA_sw (all legs, π·Ø²/4 each) is kept; ties go to
// fewer links, then the smaller Ø, then the larger s_r. For each s_r and line count the sizes are tried
// from the smallest up and stop at the first that passes, since the same layout in a larger bar only adds
// steel; they also stop once the layout already carries as much steel as the best found. Failures that links cannot fix (v_Rd,max at u0, k_max at u1) end the search at once. If nothing
// passes, the layout with the lowest governing UR is reported with a note.
import { gridOnBars } from './arrangement.mjs';
import { detailingChecks } from './detailing.mjs';
import { LINK_DIAMETERS, STATES } from './inputs.mjs';

const UNFIXABLE = ['max', 'kmax'];
const MAX_EXTRA = 4;
const BAR_FIXABLE = ['reinforced', 'minimum'];

export function optimise(calculate, input, options, d) {
  const r = input.reinforcement;
  const run = reinforcement => calculate({ ...input, reinforcement }, { ...options, srFixed: true });
  const first = run(r);
  if (!first.loads?.length) return first;
  const needed = first.loads.some(load => load.required);
  const unfixable = first.loads.some(load => load.rows.some(row => UNFIXABLE.includes(row.id) && row.status === STATES.fail));
  if (!needed || unfixable) return first;

  const limit = Math.min(Math.floor((0.75 * d) / 5 + 1e-9) * 5, r.sr > 0 ? r.sr : Infinity);
  const bars = gridOnBars(input, d);
  const spacings = r.srAuto === false ? [r.sr]
    : bars.on ? Array.from({ length: Math.max(1, Math.floor(limit / bars.spacing + 1e-9)) }, (_, k) => (k + 1) * bars.spacing).reverse()
      : [...new Set([limit, ...Array.from({ length: 6 }, (_, k) => Math.floor((limit - 25 * (k + 1)) / 25) * 25)])].filter(v => v >= Math.max(50, Math.min(0.4 * d, limit)));
  const fits = phi => detailingChecks({ slab: input.slab, anchorage: r.anchorage, diameters: [phi] }).rows.every(row => row.status !== STATES.fail || row.id === 'depth');
  const sizes = LINK_DIAMETERS.filter(phi => phi >= r.diameter && phi <= (r.diameterMax ?? 16) && (phi === r.diameter || fits(phi)));
  const steps = r.arrangement === 'grid'
    ? (r.thin !== false ? [{ thin: true }, { thin: false }] : [{ thin: false }])
    : Array.from({ length: MAX_EXTRA + 1 }, (_, extra) => ({ extra }));

  const steel = result => (result.layout?.links ?? []).reduce((sum, link) => sum + (link.legs?.length ?? 1) * Math.PI * link.diameter ** 2 / 4, 0);
  const better = (a, b) => !b || a.steel < b.steel - 1e-6 || (Math.abs(a.steel - b.steel) <= 1e-6
    && (a.n < b.n || (a.n === b.n && (a.diameter < b.diameter || (a.diameter === b.diameter && a.sr > b.sr)))));
  let best = null;
  let chosen = null;
  let tried = 0;
  for (const sr of spacings) {
    for (const step of steps) {
      for (const diameter of sizes) {
        const result = run({ ...r, sr, diameter, ...step });
        tried += 1;
        // A larger bar in the same layout only adds steel: stop once this one already matches the best.
        if (chosen && steel(result) >= chosen.steel - 1e-6) break;
        const what = [
          diameter > r.diameter ? `Ø${diameter} (raised from Ø${r.diameter})` : `Ø${diameter}`,
          step.extra ? `${step.extra} extra radial line${step.extra > 1 ? 's' : ''} per face` : step.thin === false && r.thin !== false ? 'no ring widening' : null,
          `s_r = ${result.envelope?.sr ?? sr} mm`,
        ].filter(Boolean).join(', ');
        if (result.status === STATES.pass) {
          const cand = { result, what, steel: steel(result), n: result.layout.links.length, diameter, sr: result.envelope?.sr ?? sr };
          if (better(cand, chosen)) chosen = cand;
          break;
        }
        // Only Eq. 6.52 and Eq. 9.11 improve with a larger bar; any other failure (s_t, u_out,ef, s0, …) stays.
        const failing = result.loads.flatMap(load => load.rows.filter(row => row.status === STATES.fail).map(row => row.id));
        const barHelps = failing.length > 0 && failing.every(id => BAR_FIXABLE.includes(id));
        if (!best || (result.governing?.ur ?? Infinity) < (best.governing?.ur ?? Infinity)) best = Object.assign(result, { tried: what });
        if (!barHelps) break;
      }
    }
  }
  if (chosen) {
    chosen.result.notes = [`Auto arrangement: ${chosen.what} — least link steel of ${tried} layouts tried (ΣA_sw = ${Math.round(chosen.steel / 10) * 10} mm², ${chosen.n} links).`, ...(chosen.result.notes ?? [])];
    return chosen.result;
  }
  best.notes = [`Auto arrangement: no layout within the constraints passes (bar Ø up to ${r.diameterMax ?? 16}, s_r ≤ ${limit} mm); the lowest UR is shown (${best.tried}). Raise the bar Ø limit or s_r, or change the slab.`, ...(best.notes ?? [])];
  return best;
}
