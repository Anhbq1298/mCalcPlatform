import { boltProperties, grid, solveGroup } from './bolt-group.mjs';
import { validateInputs } from './inputs.mjs';
import { directionalBearing, sciBoltChecks, sciPlateChecks, sciPlateStability, sciSupportChecks, sciWeldThickness } from './sci-p358.mjs';

function bearingAt(point, points, bounds, bolt, thickness, fu, reaction) {
  const axis = (key, other, force) => {
    const sign = force < 0 ? -1 : 1;
    const ahead = points.filter(p => p[other] === point[other] && sign * (p[key] - point[key]) > 0);
    const pitch = Math.min(...ahead.map(p => Math.abs(p[key] - point[key])));
    const edge = sign > 0 ? bounds[key][1] - point[key] : point[key] - bounds[key][0];
    const cross = points.filter(p => p[key] === point[key] && p[other] !== point[other]);
    const sidePitch = Math.min(...cross.map(p => Math.abs(p[other] - point[other])));
    const sideEdge = Math.min(point[other] - bounds[other][0], bounds[other][1] - point[other]);
    return directionalBearing(bolt, thickness, fu, edge, pitch, sideEdge, sidePitch);
  };
  const fx = axis('x', 'y', reaction * point.fx);
  const fy = axis('y', 'x', reaction * point.fy);
  const ratio = (force, capacity) => force === 0 ? 0 : Math.abs(force) / capacity;
  return { fx, fy, utilization: ratio(point.fx, fx) + ratio(point.fy, fy) };
}

export function calculate(input, beam) {
  validateInputs(input, beam);
  const { columns, rows, pitch, gauge, secondGauge, thickness, beamEnd, plateEdge, gap,
    vertical, horizontal, appliedMoment, top, bottom, offset, skew } = input;
  const bolt = boltProperties(input.diameter, input.grade, input.threaded);
  const height = top + bottom + (rows - 1) * pitch;
  const standardPoints = grid(input);
  const width = standardPoints.at(-1).x + plateEdge;
  const points = input.coordinates ?? standardPoints;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const clear = beam.h - 2 * (beam.tf + beam.r);
  const beamCentre = height / 2 + offset;
  const centroidX = xs.reduce((sum, x) => sum + x, 0) / points.length;
  const skewRadians = skew * Math.PI / 180;
  const cosine = Math.cos(skewRadians);
  const supportClearance = gap * cosine - 0.5 * beam.b * Math.abs(Math.sin(skewRadians));
  const z = { geometry: centroidX, normal: input.eccentricity / cosine, axis: input.eccentricity }[input.eccentricityMode];
  const moment = vertical * z + appliedMoment * 1000;
  const group = solveGroup(points, horizontal, vertical, moment);
  const jointLength = Math.max(Math.max(...ys) - Math.min(...ys), Math.max(...xs) - Math.min(...xs));
  const longJoint = Math.max(0.75, Math.min(1, 1 - (jointLength - 15 * bolt.diameter) / (200 * bolt.diameter)));
  const shearResistance = bolt.shear * longJoint;
  const plateBounds = { x: [0, width], y: [0, height] };
  const webBounds = { x: [gap, Infinity], y: [-Infinity, Infinity] };
  const bolts = group.bolts.map(point => ({
    ...point,
    shear: point.force / shearResistance,
    plate: input.coordinates ? null : bearingAt(point, points, plateBounds, bolt, thickness, input.plateFu, -1),
    web: input.coordinates ? null : bearingAt(point, points, webBounds, bolt, beam.tw, input.beamFu, 1),
  }));
  const details = [];
  const d0 = bolt.hole;
  const edge = 1.2 * d0;
  if (points.some(p => Math.min(p.y, height - p.y, p.x - gap, width - p.x) < edge)) {
    details.push('An end or edge distance is below 1.2 × hole diameter.');
  }
  if (input.coordinates) {
    if (points.some((p, i) => points.slice(i + 1).some(q => Math.hypot(p.x - q.x, p.y - q.y) < d0))) {
      details.push('Two bolt holes overlap.');
    }
  } else {
    if (pitch < 2.2 * d0) details.push('Vertical pitch is below 2.2 × hole diameter.');
    if ((columns > 1 && gauge < 2.4 * d0) || (columns === 3 && secondGauge < 2.4 * d0)) {
      details.push('Horizontal pitch is below 2.4 × hole diameter.');
    }
  }
  if (points.some(p => Math.abs(p.y - beamCentre) + d0 / 2 > clear / 2)) {
    details.push('A bolt hole intersects a flange or root fillet.');
  }
  if (Math.abs(offset) + height / 2 > beam.h / 2 - beam.tf) {
    details.push('The fin plate intersects a beam flange in elevation.');
  }
  if (supportClearance < 0) {
    details.push('The square beam end crosses the idealized support face in plan. Check the end cut and support clearance.');
  }
  const metrics = [['Bolt shear', p => p.shear]];
  if (!input.coordinates) metrics.push(['Beam-web bearing · screening', p => p.web.utilization],
    ['Fin-plate bearing · screening', p => p.plate.utilization]);
  const checks = metrics.map(([name, get]) => {
    const governing = bolts.reduce((worst, p) => get(p) > get(worst) ? p : worst);
    return { name, ratio: get(governing), bolt: governing.id };
  });

  const standard = !input.coordinates && input.type === 'standard' && columns <= 2 && skew === 0
    && vertical >= 0 && horizontal === 0 && appliedMoment === 0 && input.eccentricityMode === 'geometry' && details.length === 0;
  const weld = standard ? sciWeldThickness(input.plateFy, thickness, input.weldLeg) : null;
  if (weld) checks.push({ name: 'P358 double fillet weld sizing', ratio: weld.ratio });
  let support;
  if (standard && input.supportThickness > 0 && ['beam-web', 'column-web', 'rhs', 'shs', 'chs'].includes(input.support)) {
    support = sciSupportChecks({ ...input, height });
    checks.push({ name: 'P358 support local shear', ratio: vertical / support.localShear, resistance: support.localShear },
      { name: 'P358 support punching shear', ratio: support.punching });
  }
  let sci;
  const standardThickness = input.plateFy === 275 ? 0.5 : input.plateFy === 355 ? 0.42 : 0;
  if (standard && bolt.diameter === 20 && input.grade === '8.8' && input.threaded
    && thickness <= standardThickness * bolt.diameter && height > 0.6 * beam.h && beam.h <= 610
    && Math.min(top, bottom, plateEdge, beamEnd) >= 2 * bolt.diameter) {
    const sciZ = centroidX;
    const end = Math.min(top, bottom);
    const resistance = sciBoltChecks({ group, bolt, shearResistance, z: sciZ, pitch, gauge: columns === 1 ? Infinity : gauge,
      plateEnd: end, plateEdge, beamVerticalEnd: Infinity, beamEnd, plateThickness: thickness,
      beamThickness: beam.tw, plateFu: input.plateFu, beamFu: input.beamFu });
    const plate = sciPlateChecks({ height, thickness, rows, columns, gauge, edge: plateEdge,
      end: Math.max(top, bottom), d0, fy: input.plateFy, fu: input.plateFu, z: sciZ });
    const stability = sciPlateStability({ height, thickness, fy: input.plateFy, z: sciZ,
      firstBolt: points[0].x, restrained: input.restrained });
    sci = { z: sciZ, resistance, plate, stability };
    for (const [name, capacity] of [
      ['P358 bolt shear', resistance.bolt], ['P358 un-coped web bearing', resistance.web.resistance],
      ['P358 plate bearing', resistance.plate.resistance], ['P358 gross plate shear', plate.gross],
      ['P358 net plate shear', plate.net], ['P358 plate block tearing', plate.block], ['P358 plate bending', plate.bending],
      ['P358 ' + stability.type + ' plate stability', stability.resistance],
    ]) {
      if (capacity !== null) checks.push({ name, ratio: vertical / capacity, resistance: capacity });
    }
  }
  return {
    height, width, beamCentre, clear, supportClearance, z, normal: z * cosine, moment, bolt, shearResistance, longJoint,
    group: { ...group, bolts }, details, checks, sci, weld, support, customLayout: Boolean(input.coordinates),
    complete: false,
    status: details.length ? 'Detailing requires revision' : 'Partial assessment',
  };
}
