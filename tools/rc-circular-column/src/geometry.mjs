const radians = Math.PI / 180;
const tolerance = 1e-7;
export const barArea = diameter => Math.PI * diameter ** 2 / 4;

// EN 1992-1-1:2004 §8.2(2), recommended k1 and k2.
export const minimumClearance = (bar, adjacentBar, aggregate) => Math.max(20, bar, adjacentBar, aggregate + 5);

export function geometry(input) {
  const concreteRadius = input.diameter / 2;
  const outerRings = [];
  const rings = input.layers.map((layer, index) => {
    const previous = outerRings.at(-1);
    const active = input.reinforcement[input.transverse][index];
    // Reserve the larger transverse diameter so switching modes alone cannot move longitudinal bars.
    const envelope = Math.max(input.reinforcement.links[index].diameter, input.reinforcement.spirals[index].diameter);
    const required = previous ? minimumClearance(previous.bar, layer.bar, input.aggregate) : null;
    const automaticRadius = previous
      ? previous.barRadius - previous.bar / 2 - required - envelope - layer.bar / 2
      : concreteRadius - input.cover - envelope - layer.bar / 2;
    const barRadius = layer.radius ?? automaticRadius;
    const linkRadius = barRadius + (layer.bar + active.diameter) / 2;
    const cover = concreteRadius - linkRadius - active.diameter / 2;
    const clear = 2 * barRadius * Math.sin(Math.PI / layer.count) - layer.bar;
    const radialClear = previous ? previous.barRadius - barRadius - (previous.bar + layer.bar) / 2 : null;
    const placementGap = previous ? radialClear - active.diameter : null;
    const transverseGap = previous ? previous.linkRadius - linkRadius - (previous.link + active.diameter) / 2 : null;
    const bars = Array.from({ length: layer.count }, (_, index) => {
      const angle = (layer.offset % 360) * radians + index * 2 * Math.PI / layer.count;
      return { x: barRadius * Math.cos(angle), y: barRadius * Math.sin(angle), angle, area: barArea(layer.bar) };
    });
    let nearestBar = clear;
    let clashesWithOuter = false;
    for (const outer of outerRings) {
      for (const other of bars) {
        for (const old of outer.bars) {
          nearestBar = Math.min(nearestBar, Math.hypot(other.x - old.x, other.y - old.y) - (layer.bar + outer.bar) / 2);
        }
      }
      const outerBarToLink = outer.barRadius - outer.bar / 2 - linkRadius - active.diameter / 2;
      if (outerBarToLink < -tolerance) clashesWithOuter = true;
    }
    const collision = barRadius <= 0 || clear < -tolerance || cover < -tolerance || nearestBar < -tolerance ||
      clashesWithOuter || (transverseGap !== null && transverseGap < -tolerance);
    const helixAngle = Math.atan2(active.spacing, 2 * Math.PI * linkRadius);
    // Lower-bound the chord distance using chord >= (2/pi) times arc for phase differences up to pi.
    const turnClear = input.transverse === 'links' ? active.spacing - active.diameter
      : active.spacing / Math.hypot(1, active.spacing / (4 * linkRadius)) - active.diameter;
    const ring = { ...layer, barRadius, linkRadius, link: active.diameter, spacing: active.spacing,
      cover, clear, radialClear, required, placementGap, transverseGap, nearestBar, collision: Boolean(collision),
      helixAngle, turnClear, bars };
    outerRings.push(ring);
    return ring;
  });
  return { concreteRadius, rings, bars: rings.flatMap(ring => ring.bars),
    collision: rings.some(ring => ring.collision) };
}
