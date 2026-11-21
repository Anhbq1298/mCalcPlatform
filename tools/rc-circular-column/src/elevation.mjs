export function elevationGeometry(input, rings) {
  const closed = input.transverse === 'links';
  const inset = ring => input.cover + ring.link / 2;
  // Show the first 12 turns of the densest layer so individual lines remain readable.
  const preview = Math.min(input.height, ...rings.map(ring => inset(ring) + 12 * ring.spacing));
  const layers = rings.map(ring => {
    const start = inset(ring);
    const end = Math.min(preview, input.height - inset(ring));
    if (end < start || !(ring.linkRadius > 0)) return { ring, links: [], turns: [] };
    const count = Math.floor((end - start) / ring.spacing) + 1;
    if (closed) return { ring, turns: [], links: Array.from({ length: count }, (_, i) => start + i * ring.spacing) };
    const turns = [];
    const totalAngle = 2 * Math.PI * (end - start) / ring.spacing;
    for (let angle = 0; angle < totalAngle; angle += Math.PI) {
      const segmentLength = Math.min(Math.PI, totalAngle - angle);
      const points = Array.from({ length: 25 }, (_, step) => {
        const theta = angle + segmentLength * step / 24;
        return [ring.linkRadius * Math.cos(theta), start + theta * ring.spacing / (2 * Math.PI)];
      });
      turns.push({ rear: Math.round(angle / Math.PI) % 2 === 1, points });
    }
    return { ring, links: [], turns };
  });
  return { preview, layers };
}
