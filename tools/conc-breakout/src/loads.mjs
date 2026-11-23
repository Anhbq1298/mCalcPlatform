// Right-handed plate axes: X right, Y up and Z outward.
// O lies at the centre of the plate's reference interface with concrete.
export const LOAD_KEYS = ['N', 'Vx', 'Vy', 'Mx', 'My', 'Mz'];
export const POINT_KEYS = ['x', 'y', 'z'];

export function transformLoads(point, applied) {
  const [x, y, z] = POINT_KEYS.map(key => point[key]);
  const [N, Vx, Vy, Mx, My, Mz] = LOAD_KEYS.map(key => applied[key]);
  if (![x, y, z, N, Vx, Vy, Mx, My, Mz].every(Number.isFinite)) {
    throw new Error('Enter finite load coordinates and six signed load components.');
  }
  const atOrigin = {
    N, Vx, Vy,
    Mx: Mx + (y * N - z * Vy) / 1000,
    My: My + (z * Vx - x * N) / 1000,
    Mz: Mz + (x * Vy - y * Vx) / 1000,
  };
  const internal = Object.fromEntries(LOAD_KEYS.map((key, index) => [
    key, atOrigin[key] * (index < 3 ? 1e3 : 1e6),
  ]));
  if (!Object.values(internal).every(Number.isFinite)) throw new Error('Equivalent loads exceed numerical range.');
  return { point: { x, y, z }, applied: { N, Vx, Vy, Mx, My, Mz }, atOrigin, internal };
}

export function legacyLoading(actions) {
  // Legacy V was positive down; positive M opened the top edge.
  // Keep the old moment datum when reproducing legacy results.
  return {
    point: { x: 0, y: 0, z: actions.e },
    applied: { N: actions.N, Vx: 0, Vy: -actions.V, Mx: actions.M, My: 0, Mz: 0 },
  };
}
