import { boltProperties, grid, solveGroup } from './bolt-group.mjs';
import { beamToBeamLayout, checkBeamFit } from './beam-layout.mjs';
import { notchChecks, notchGeometry } from './notched-beam.mjs';
import { validateInputs } from './inputs.mjs';
import { bearingTerms, sciBoltChecks, sciPlateChecks, sciPlateStability, sciSupportChecks, sciWeldThickness } from './sci-p358.mjs';

function bearingAt(point, points, bounds, bolt, thickness, fu, reaction) {
  const axis = (key, other, force) => {
    const sign = force < 0 ? -1 : 1;
    const ahead = points.filter(p => p[other] === point[other] && sign * (p[key] - point[key]) > 0);
    const pitch = Math.min(...ahead.map(p => Math.abs(p[key] - point[key])));
    const edge = sign > 0 ? bounds[key][1] - point[key] : point[key] - bounds[key][0];
    const cross = points.filter(p => p[key] === point[key] && p[other] !== point[other]);
    const sidePitch = Math.min(...cross.map(p => Math.abs(p[other] - point[other])));
    const sideEdge = Math.min(point[other] - bounds[other][0], bounds[other][1] - point[other]);
    return bearingTerms(bolt, thickness, fu, edge, pitch, sideEdge, sidePitch);
  };
  const x = axis('x', 'y', reaction * point.fx);
  const y = axis('y', 'x', reaction * point.fy);
  const { resistance: fx } = x;
  const { resistance: fy } = y;
  const ratio = (force, capacity) => force === 0 ? 0 : Math.abs(force) / capacity;
  return { fx, fy, x, y, utilization: ratio(point.fx, fx) + ratio(point.fy, fy) };
}

export function calculate(input, beam) {
  validateInputs(input, beam);
  const beamLayout = beamToBeamLayout(input, beam);
  if (beamLayout) input = { ...input, gap: beamLayout.gap, supportThickness: beamLayout.profile.tw };
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
  const notch = notchGeometry(input, beam, beamCentre);
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
  const webBounds = { x: [gap, Infinity], y: [notch?.bottom ? notch.lower : -Infinity, notch?.top ? notch.upper : Infinity] };
  const bolts = group.bolts.map(point => ({
    ...point,
    shear: point.force / shearResistance,
    plate: input.coordinates ? null : bearingAt(point, points, plateBounds, bolt, thickness, input.plateFu, -1),
    web: input.coordinates ? null : bearingAt(point, points, webBounds, bolt, beam.tw, input.beamFu, 1),
  }));
  const details = checkBeamFit(beamLayout, beam, beamCentre, height, notch);
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
  if (notch && points.some(p => Math.min(
    notch.top ? notch.upper - p.y : Infinity,
    notch.bottom ? p.y - notch.lower : Infinity,
  ) < edge)) details.push('A bolt is too close to the reduced web edge at the notch.');
  if (Math.abs(offset) + height / 2 > beam.h / 2 - beam.tf) {
    details.push('The fin plate intersects a beam flange in elevation.');
  }
  if (!beamLayout && supportClearance < 0) {
    details.push('The square beam end crosses the idealized support face in plan. Check the end cut and support clearance.');
  }
  const metrics = [['Bolt shear', p => p.shear]];
  if (!input.coordinates) metrics.push(['Beam-web bearing · screening', p => p.web.utilization],
    ['Fin-plate bearing · screening', p => p.plate.utilization]);
  const checks = metrics.map(([name, get]) => {
    const governing = bolts.reduce((worst, p) => get(p) > get(worst) ? p : worst);
    return { name, ratio: get(governing), bolt: governing.id,
      ...(name === 'Bolt shear' ? { demand: governing.force, resistance: shearResistance } : {}) };
  });

  const orthogonal = !input.coordinates && columns <= 2 && skew === 0
    && vertical >= 0 && horizontal === 0 && appliedMoment === 0 && input.eccentricityMode === 'geometry' && details.length === 0;
  const extended = beamLayout?.layout === 'outside';
  const standard = orthogonal && input.type === 'standard' && !extended;
  const openChecks = [];
  if (extended) openChecks.push('Extended fin plate. Verify plate bending and stability, welds and support resistance for the increased eccentricity.');
  let notchedBeam;
  if (notch) {
    if ((standard || (orthogonal && extended && ['standard', 'extended'].includes(input.type))) && Math.max(...xs) <= notch.shoulder) {
      notchedBeam = notchChecks(input, beam, notch, bolt, group);
      checks.push(...notchedBeam.checks);
      if (points[0].x > thickness / 0.15) {
        openChecks.push('P358 Check 4 · Additional web resistance checks for a long fin plate remain open.');
      }
    } else {
      openChecks.push('P358 Checks 4–6 · The notch calculation requires a regular one- or two-column layout, bolt centres within the notched length, and standard vertical shear loading.');
    }
    if (!input.restrained) {
      openChecks.push('P358 Checks 6–7 · Verify local notch stability and overall lateral-torsional stability with the member design.');
    } else if (![275, 355].includes(input.beamFy ?? 355)) {
      openChecks.push('P358 Check 6 · Verify local notch stability for the specified beam grade.');
    }
  }
  const weld = standard ? sciWeldThickness(input.plateFy, thickness, input.weldLeg) : null;
  if (weld) checks.push({ name: 'P358 double fillet weld sizing', ratio: weld.ratio, demand: weld.minimum, resistance: weld.throat, unit: 'mm' });
  let support;
  if (standard && input.supportThickness > 0 && ['beam-web', 'column-web', 'rhs', 'shs', 'chs'].includes(input.support)) {
    support = { ...sciSupportChecks({ ...input, height }), thickness: input.supportThickness };
    checks.push({ name: 'P358 support local shear', ratio: vertical / support.localShear, demand: vertical, resistance: support.localShear },
      { name: 'P358 support punching shear', ratio: support.punching, demand: thickness, resistance: support.punchLimit, unit: 'mm' });
  }
  let sci;
  const standardThickness = input.plateFy === 275 ? 0.5 : input.plateFy === 355 ? 0.42 : 0;
  if (standard && (!notch || notchedBeam) && bolt.diameter === 20 && input.grade === '8.8' && input.threaded
    && thickness <= standardThickness * bolt.diameter && height > 0.6 * beam.h && beam.h <= 610
    && Math.min(top, bottom, plateEdge, beamEnd) >= 2 * bolt.diameter) {
    const sciZ = centroidX;
    const end = Math.min(top, bottom);
    const resistance = sciBoltChecks({ group, bolt, shearResistance, z: sciZ, pitch, gauge: columns === 1 ? Infinity : gauge,
      plateEnd: end, plateEdge, beamVerticalEnd: notch ? Math.min(notch.upper - Math.max(...ys), Math.min(...ys) - notch.lower) : Infinity, beamEnd, plateThickness: thickness,
      beamThickness: beam.tw, plateFu: input.plateFu, beamFu: input.beamFu });
    const plate = sciPlateChecks({ height, thickness, rows, columns, gauge, edge: plateEdge,
      end: Math.max(top, bottom), d0, fy: input.plateFy, fu: input.plateFu, z: sciZ });
    const stability = sciPlateStability({ height, thickness, fy: input.plateFy, z: sciZ,
      firstBolt: points[0].x, restrained: input.restrained });
    sci = { z: sciZ, resistance, plate, stability };
    for (const [name, capacity] of [
      ['P358 bolt shear', resistance.bolt], ['P358 beam-web bearing', resistance.web.resistance],
      ['P358 plate bearing', resistance.plate.resistance], ['P358 gross plate shear', plate.gross],
      ['P358 net plate shear', plate.net], ['P358 plate block tearing', plate.block], ['P358 plate bending', plate.bending],
      ['P358 ' + stability.type + ' plate stability', stability.resistance],
    ]) {
      if (capacity !== null) checks.push({ name, ratio: vertical / capacity, demand: vertical, resistance: capacity });
    }
  }
  return {
    height, width, beamLayout, beamGap: gap, beamCentre, clear, supportClearance, z, normal: z * cosine, moment, bolt, shearResistance, longJoint, jointLength,
    group: { ...group, bolts }, details, openChecks, checks, sci, weld, support, notch, notchedBeam, customLayout: Boolean(input.coordinates),
    complete: false,
    status: details.length ? 'Detailing requires revision' : 'Partial assessment',
  };
}
