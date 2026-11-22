// Auto arrangement as a constrained search (DECON / The Concrete Centre practice). The user sets the
// arrangement type, the smallest bar Ø, the largest bar Ø (default 16) and the maximum radial spacing s_r;
// links follow the slab bars for the grid. When the layout as first built does not pass, the remedies are
// tried in this order, and the first layout that passes every check is kept:
//   1. a larger bar Ø for the whole layout (next size up to the maximum, while the hook still fits);
//   2. more rails: orthogonal rails per face (stud rails) — for the grid, no ring widening;
//   3. more links: a smaller s_r (on the bar grid, the next smaller multiple of the bar spacing).
// Failures that links cannot fix (v_Rd,max at u0, k_max at u1) end the search at once. If nothing passes,
// the layout with the lowest governing UR is reported with a note.
import { gridOnBars } from './arrangement.mjs';
import { detailingChecks } from './detailing.mjs';
import { LINK_DIAMETERS, STATES } from './inputs.mjs';

const UNFIXABLE = ['max', 'kmax'];
const MAX_EXTRA = 4;

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

  let best = null;
  for (const sr of spacings) {
    for (const step of steps) {
      for (const diameter of sizes) {
        const result = run({ ...r, sr, diameter, ...step });
        const what = [
          diameter > r.diameter ? `Ø${diameter} (raised from Ø${r.diameter})` : `Ø${diameter}`,
          step.extra ? `${step.extra} extra orthogonal rail${step.extra > 1 ? 's' : ''}` : step.thin === false && r.thin !== false ? 'no ring widening' : null,
          `s_r = ${result.envelope?.sr ?? sr} mm`,
        ].filter(Boolean).join(', ');
        if (result.status === STATES.pass) {
          result.notes = [`Auto arrangement: ${what}.`, ...(result.notes ?? [])];
          return result;
        }
        if (!best || (result.governing?.ur ?? Infinity) < (best.governing?.ur ?? Infinity)) best = Object.assign(result, { tried: what });
      }
    }
  }
  best.notes = [`Auto arrangement: no layout within the constraints passes (bar Ø up to ${r.diameterMax ?? 16}, s_r ≤ ${limit} mm); the lowest UR is shown (${best.tried}). Raise the bar Ø limit or s_r, or change the slab.`, ...(best.notes ?? [])];
  return best;
}
