// Physical detailing of the links: slab depth (§9.3.2(1)), mandrel diameter (§8.3, Table 8.1N),
// anchorage of links by bends or hooks (§8.5, Fig. 8.5) and the fit of both bends within the slab.
// Whether each link encloses the flexural bars must be confirmed by the user.
import { STATES } from './inputs.mjs';

export const ANCHORAGE_TYPES = {
  hook: { label: 'Hook (135° or 180°)', extension: phi => Math.max(5 * phi, 50), rule: 'max(5φ, 50 mm)' },
  bend: { label: 'Bend (90°)', extension: phi => Math.max(10 * phi, 70), rule: 'max(10φ, 70 mm)' },
};

export const mandrelMinimum = phi => (phi <= 16 ? 4 : 7) * phi;

const item = (id, clause, label, demand, capacity, status, detail, unit = 'mm') => ({
  id, clause, label, demand, resistance: capacity, unit, detail,
  ur: capacity > 0 && Number.isFinite(demand) ? demand / capacity : null,
  status: status ?? (capacity > 0 && demand <= capacity + 1e-9 ? STATES.pass : STATES.fail),
});

export function detailingChecks({ slab, anchorage = {}, diameters }) {
  const type = ANCHORAGE_TYPES[anchorage.type] ?? ANCHORAGE_TYPES.hook;
  const rows = [item('depth', '§9.3.2(1)', 'Slab depth with shear reinforcement ≥ 200 mm', 200, slab.h, null, `h = ${slab.h} mm`)];
  for (const phi of [...new Set(diameters)].sort((a, b) => a - b)) {
    const mandrel = (anchorage.mandrelFactor ?? 4) * phi;
    rows.push(item('mandrel-' + phi, '§8.3, Table 8.1N', `Ø${phi} mandrel diameter ≥ ${phi <= 16 ? 4 : 7}φ`, mandrelMinimum(phi), mandrel, null, `φm = ${mandrel.toFixed(0)} mm`));
    rows.push(item('extension-' + phi, '§8.5, Fig. 8.5', `Ø${phi} ${type.label.toLowerCase()} extension ≥ ${type.rule}`, type.extension(phi), anchorage.extension ?? 0, null, `provided ${anchorage.extension ?? 0} mm`));
    const clear = slab.h - 2 * (slab.cover ?? 0);
    rows.push(item('fit-' + phi, 'Physical geometry', `Ø${phi} both bends fit: h − 2c ≥ φm + 2φ`, mandrel + 2 * phi, clear, null, `h − 2c = ${clear.toFixed(0)} mm`));
  }
  rows.push({
    id: 'engaged', clause: '§8.5, §9.4.3', label: 'Links enclose the top and bottom flexural bars', demand: null, resistance: null, ur: null,
    status: anchorage.engaged === true ? STATES.pass : STATES.confirm, detail: anchorage.engaged === true ? 'Confirmed by the user.' : 'Confirm the link engages the flexural bars at both ends.',
  });
  const status = rows.some(row => row.status === STATES.fail) ? STATES.fail : rows.some(row => row.status === STATES.confirm) ? STATES.confirm : STATES.pass;
  return { rows, status };
}
