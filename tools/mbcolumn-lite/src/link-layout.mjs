// The mCalcCanvas rectangular column worksheet uses the first-generation EC2
// 9.5.3(6) 150 mm restraint criterion. Check every face for load reversal.
const restraintLimit = 150;
const tolerance = 0.21; // The section editor stores coordinates rounded to 0.1 mm.
const near = (a, b) => Math.abs(a - b) <= tolerance;

function selectPositions(faces, axis, extent) {
  const atCorner = position => near(Math.abs(position), extent);
  const facePositions = faces.map(face => face.map(bar => bar[axis]));
  const anchors = facePositions.map(positions => positions.filter(atCorner));
  const candidates = facePositions[0].filter(position => !atCorner(position))
    .map(position => [position, facePositions[1].find(opposite => near(opposite, position))])
    .filter(pair => pair[1] !== undefined);
  const distance = (position, face) => Math.min(...anchors[face].map(anchor => Math.abs(anchor - position)));
  const selected = [];
  while (true) {
    const uncovered = facePositions.map((positions, face) =>
      positions.filter(position => distance(position, face) > restraintLimit));
    if (uncovered.every(face => !face.length)) break;
    const score = pair => uncovered.reduce((total, positions, face) =>
      total + positions.filter(position => Math.abs(position - pair[face]) <= restraintLimit).length, 0);
    const spread = pair => Math.max(...pair.map(distance));
    const options = candidates.filter(pair => !selected.includes(pair));
    options.sort((a, b) => score(b) - score(a) || spread(b) - spread(a) || a[0] - b[0]);
    const next = options[0];
    if (!next || !score(next)) return null;
    const add = pair => {
      selected.push(pair);
      pair.forEach((position, face) => anchors[face].push(position));
    };
    add(next);
    const mirror = options.find(pair => pair !== next && near(pair[0], -next[0]));
    if (mirror && score(mirror)) add(mirror);
  }
  return selected.map(([a, b]) => (a + b) / 2).sort((a, b) => a - b);
}

function appendLinks(shapes, positions, axis, extent) {
  for (let i = 0; i < Math.floor(positions.length / 2); i++) {
    const low = positions[i];
    const high = positions[positions.length - 1 - i];
    shapes.push(axis === 'x'
      ? { type: 'inner', left: low, right: high, bottom: -extent, top: extent }
      : { type: 'inner', left: -extent, right: extent, bottom: low, top: high });
  }
  if (positions.length % 2) {
    const middle = positions[Math.floor(positions.length / 2)];
    shapes.push(axis === 'x'
      ? { type: 'cross', start: [middle, extent], end: [middle, -extent] }
      : { type: 'cross', start: [-extent, middle], end: [extent, middle] });
  }
}

export function generateLinkLayout({ b, h, cover, link, bars }) {
  const radius = bars[0]?.radius;
  if (![b, h, cover, link, radius].every(Number.isFinite) || cover < 0 || link <= 0 || radius <= 0) {
    return { error: 'Enter a valid section, reinforcement, cover and link diameter.' };
  }
  if (bars.some(bar => bar.radius !== radius)) {
    return { error: 'Automatic links require one perimeter bar or bundle size. Use manual legs for mixed sizes.' };
  }
  const x = b / 2 - cover - link - radius;
  const y = h / 2 - cover - link - radius;
  const row = side => bars.filter(bar => near(bar.y, side * y));
  const column = side => bars.filter(bar => near(bar.x, side * x));
  const horizontal = [row(-1), row(1)];
  const vertical = [column(-1), column(1)];
  if (!(x > 0 && y > 0)
    || bars.some(bar => Math.abs(bar.x) > x + tolerance || Math.abs(bar.y) > y + tolerance
      || (!near(Math.abs(bar.x), x) && !near(Math.abs(bar.y), y)))
    || horizontal.some(face => !face.some(bar => near(bar.x, -x)) || !face.some(bar => near(bar.x, x)))) {
    return { error: 'Automatic links require perimeter bars with a bar at each corner. Use manual legs for this layout.' };
  }
  const yLegPositions = selectPositions(horizontal, 'x', x);
  const xLegPositions = selectPositions(vertical, 'y', y);
  if (!xLegPositions || !yLegPositions) {
    return { error: 'Straight links cannot meet the 150 mm restraint rule for these bars. Align opposite bars or use manual legs.' };
  }

  const shapes = [{ type: 'outer', left: -x, right: x, bottom: -y, top: y }];
  appendLinks(shapes, yLegPositions, 'x', y);
  appendLinks(shapes, xLegPositions, 'y', x);
  return {
    // The editor already reserves the bundle's enclosing radius for cover.
    // Wrap that envelope rather than the smaller equivalent-area diameter.
    shapes, bundles: bars.some(bar => bar.bundle),
    bendRadius: radius + link / 2, extension: Math.max(5 * link, 50),
    legsX: 2 + xLegPositions.length, legsY: 2 + yLegPositions.length,
  };
}

export function resolveShearLinks(shear, layout) {
  if (shear.mode === 'manual') return shear;
  if (layout.error) return { ...shear, layoutError: layout.error };
  return { ...shear, legsX: layout.legsX, legsY: layout.legsY };
}

export function restoreShearSettings(defaults, incoming) {
  const legacyLegs = ['legsX', 'legsY'].some(key => incoming?.[key] !== undefined && incoming[key] !== defaults[key]);
  const legacyMode = incoming?.enabled || legacyLegs ? 'manual' : defaults.mode;
  return { ...defaults, ...incoming, enabled: incoming?.enabled ?? false, mode: incoming?.mode ?? legacyMode };
}
