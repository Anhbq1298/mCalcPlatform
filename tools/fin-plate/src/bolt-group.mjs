export const gammaBolt = 1.25;

// EN 1090-2 Table 11 normal clearance and nominal tensile stress areas (mm²).
export const boltSizes = new Map([
  [12, [13, 84.3]], [16, [18, 157]], [20, [22, 245]], [22, [24, 303]],
  [24, [26, 353]], [27, [30, 459]], [30, [33, 561]], [36, [39, 817]],
]);
export const boltGrades = new Map([
  ['4.6', [400, 0.6]], ['5.6', [500, 0.6]], ['8.8', [800, 0.6]], ['10.9', [1000, 0.5]],
]);

export function boltProperties(diameter, grade, threaded) {
  const size = boltSizes.get(diameter);
  const strength = boltGrades.get(grade);
  if (!size || !strength) throw new RangeError('Select a supported bolt size and grade.');
  const [hole, stressArea] = size;
  const [fub, threadedCoefficient] = strength;
  const area = threaded ? stressArea : Math.PI * diameter ** 2 / 4;
  const coefficient = threaded ? threadedCoefficient : 0.6;
  return { diameter, hole, area, coefficient, fub, shear: coefficient * fub * area / gammaBolt / 1000 };
}

export function grid({ columns, rows, pitch, gauge, secondGauge, gap, beamEnd, bottom }) {
  const xs = [gap + beamEnd, gap + beamEnd + gauge, gap + beamEnd + gauge + secondGauge];
  return Array.from({ length: rows * columns }, (_, index) => ({
    id: index + 1,
    x: xs[index % columns],
    y: bottom + Math.floor(index / columns) * pitch,
  }));
}

// Forces are in kN, coordinates in mm and the applied moment is in kN·mm.
export function solveGroup(points, horizontal, vertical, moment) {
  const n = points.length;
  if (!n || ![horizontal, vertical, moment].every(Number.isFinite)
    || !points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))) {
    throw new RangeError('The bolt group and applied loads must be finite.');
  }
  const centroid = points.reduce((sum, p) => ({ x: sum.x + p.x / n, y: sum.y + p.y / n }), { x: 0, y: 0 });
  const offsets = points.map(p => ({ ...p, dx: p.x - centroid.x, dy: p.y - centroid.y }));
  const polar = offsets.reduce((sum, p) => sum + p.dx ** 2 + p.dy ** 2, 0);
  if (polar === 0 && moment !== 0) throw new RangeError('A coincident bolt group cannot resist moment.');
  const rate = polar ? moment / polar : 0;
  const direct = { x: horizontal / n, y: vertical / n };
  const bolts = offsets.map(p => {
    const momentX = -rate * p.dy;
    const momentY = rate * p.dx;
    const fx = direct.x + momentX;
    const fy = direct.y + momentY;
    return { ...p, fx, fy, momentX, momentY, force: Math.hypot(fx, fy), angle: Math.atan2(fy, fx) * 180 / Math.PI };
  });
  const equilibrium = bolts.reduce((sum, b) => ({
    x: sum.x + b.fx, y: sum.y + b.fy, m: sum.m + b.dx * b.fy - b.dy * b.fx,
  }), { x: 0, y: 0, m: 0 });
  const scale = Math.max(1, Math.abs(horizontal), Math.abs(vertical), Math.abs(rate) * Math.sqrt(polar));
  if (Math.max(Math.abs(equilibrium.x - horizontal), Math.abs(equilibrium.y - vertical)) > 1e-9 * scale
    || Math.abs(equilibrium.m - moment) > 1e-9 * Math.max(1, Math.abs(moment), scale * Math.sqrt(polar))) {
    throw new Error('The elastic bolt forces did not satisfy equilibrium.');
  }
  return { centroid, polar, direct, bolts, equilibrium };
}
