// EN 1992-1-1:2004 §8.2 recommended NDPs; project applicability is reported separately.
export const inputVersion = 2;
export const exampleLayers = () => ({
  longitudinal: [{ id: 'L1', count: 20, diameter: 32, angle: 0, radialClear: null },
    { id: 'L2', count: 12, diameter: 25, angle: 0, radialClear: null }],
  transverse: [{ layer: 'L1', diameter: 12, spacing: 150 }, { layer: 'L2', diameter: 12, spacing: 150 }],
});

export function migrateInputs(raw, base) {
  const version = raw.inputVersion ?? 1;
  if (version > inputVersion) throw new Error('Newer reinforcement inputs are read-only.');
  if (![1, 2].includes(version)) throw new Error('Unsupported reinforcement input version.');
  if (version === 2 && (!Array.isArray(raw.longitudinal) || !Array.isArray(raw.transverse))) {
    throw new Error('Saved reinforcement layers are missing.');
  }
  const next = { ...structuredClone(base), ...structuredClone(raw) };
  if (version === 1 && !raw.longitudinal) {
    next.longitudinal = Array.from({ length: raw.cages ?? 1 }, (_, i) => ({
      id: 'L' + (i + 1), count: raw['count' + (i + 1)] ?? base['count' + (i + 1)],
      diameter: raw['bar' + (i + 1)] ?? base['bar' + (i + 1)], angle: 0,
      // Preserve old bar radii, even where the old radial spacing was inadequate.
      radialClear: i ? raw.spiral2 ?? base.spiral2 : null,
    }));
    next.transverse = next.longitudinal.map((layer, i) => ({ layer: layer.id,
      diameter: raw['spiral' + (i + 1)] ?? base['spiral' + (i + 1)],
      spacing: raw['pitch' + (i + 1)] ?? base['pitch' + (i + 1)],
    }));
    next.migrationReview = 'Legacy spiral inputs converted to closed links; bar radii retained. Verify closure, anchorage and shear applicability.';
  }
  next.inputVersion = inputVersion;
  return next;
}

export function minimumClear(input, ...diameters) {
  return Math.max(input.k1 * Math.max(...diameters), input.aggregate + input.k2, 20);
}

export function cageGeometry(input) {
  let previous;
  return input.longitudinal.map((layer, index) => {
    const link = input.transverse.find(item => item.layer === layer.id);
    const bar = layer.diameter;
    const clear = index ? layer.radialClear ?? minimumClear(input, previous.bar, bar) : null;
    const barRadius = index ? previous.barRadius - previous.bar / 2 - clear - bar / 2
      : input.diameter / 2 - input.cover - (link?.diameter ?? 0) - bar / 2;
    const cage = { ...layer, bar, link, radialClear: clear, barRadius,
      linkRadius: link ? barRadius + bar / 2 + link.diameter / 2 : null };
    cage.bars = Array.from({ length: layer.count }, (_, i) => {
      const angle = layer.angle * Math.PI / 180 + 2 * Math.PI * i / layer.count;
      return { x: barRadius * Math.cos(angle), y: barRadius * Math.sin(angle), diameter: bar, layer: layer.id };
    });
    previous = cage;
    return cage;
  });
}

export function validateLayers(input) {
  if (input.inputVersion !== inputVersion) throw new Error('Unsupported reinforcement input version.');
  if (!Array.isArray(input.longitudinal) || !input.longitudinal.length || input.longitudinal.length > 12
    || !Array.isArray(input.transverse) || input.transverse.length > 12) throw new Error('Use 1–12 longitudinal layers and up to 12 links.');
  const ids = new Set();
  let total = 0;
  for (const layer of input.longitudinal) {
    if (!layer || typeof layer.id !== 'string' || !/^[\w-]{1,40}$/.test(layer.id) || ids.has(layer.id)
      || !Number.isInteger(layer.count) || layer.count < 4 || layer.count > 300
      || !Number.isFinite(layer.diameter) || layer.diameter <= 0 || !Number.isFinite(layer.angle)
      || (layer.radialClear !== null && (!Number.isFinite(layer.radialClear) || layer.radialClear < 0))) {
      throw new Error('Check longitudinal layer IDs, counts, diameters, angles and radial clearances.');
    }
    ids.add(layer.id); total += layer.count;
  }
  if (total > 600) throw new Error('Use no more than 600 longitudinal bars.');
  const linked = new Set();
  for (const link of input.transverse) {
    if (!link || !ids.has(link.layer) || linked.has(link.layer) || !Number.isFinite(link.diameter)
      || link.diameter <= 0 || !Number.isFinite(link.spacing) || link.spacing <= 0) {
      throw new Error('Each link must have a unique longitudinal layer, positive diameter and positive vertical spacing.');
    }
    linked.add(link.layer);
  }
}
