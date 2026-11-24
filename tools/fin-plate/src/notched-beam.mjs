const root3 = Math.sqrt(3);
const gammaNet = 1.1;

// SCI P358 §5.5 Checks 4 and 5. The worked examples use a rectangular web
// and flange for the tee section properties, ignoring the root fillet area.
export function remainingSection(beam, top, bottom) {
  const depth = beam.h - top - bottom;
  const { tw, tf, b, r } = beam;
  if (top && bottom) return { depth, area: 0.9 * tw * depth, modulus: tw * depth ** 2 / 6 };
  const web = depth - tf;
  const af = b * tf;
  const aw = tw * web;
  const yf = tf / 2;
  const yw = tf + web / 2;
  const centre = (af * yf + aw * yw) / (af + aw);
  const inertia = (b * tf ** 3 + tw * web ** 3) / 12 + af * (centre - yf) ** 2 + aw * (centre - yw) ** 2;
  return { depth, area: aw + (tw + 2 * r) * tf / 2, modulus: inertia / Math.max(centre, depth - centre) };
}

export function notchGeometry(input, beam, beamCentre) {
  const { notchTop: top = 0, notchBottom: bottom = 0, notchLength: length = 0 } = input;
  if (input.support !== 'beam-web' || (!top && !bottom)) return null;
  return {
    top, bottom, length, shoulder: input.gap + length,
    lower: beamCentre - beam.h / 2 + bottom,
    upper: beamCentre + beam.h / 2 - top,
  };
}

export function notchChecks(input, beam, notch, bolt, group) {
  const { vertical, beamFu: fu, beamFy: fy = 355, rows, columns, pitch, gauge, beamEnd, gap } = input;
  const { top, bottom, length, lower, upper, shoulder } = notch;
  const { tw } = beam;
  const { hole: d0 } = bolt;
  const { depth, area, modulus } = remainingSection(beam, top, bottom);
  const y = group.bolts.map(p => p.y);
  const edge = Math.min(upper - Math.max(...y), Math.min(...y) - lower);
  const endToLastColumn = beamEnd + (columns - 1) * gauge;
  const net = area - rows * d0 * tw;
  const netTension = tw * (endToLastColumn - (columns - 0.5) * d0);
  const netShear = tw * (edge + (rows - 1) * pitch - (rows - 0.5) * d0);
  const grossResistance = area * fy / root3 / 1000;
  const netResistance = Math.max(0, net) * fu / root3 / gammaNet / 1000;
  const blockResistance = (0.5 * fu * Math.max(0, netTension) / gammaNet + fy * Math.max(0, netShear) / root3) / 1000;
  const ratio = (demand, resistance) => demand === 0 ? 0 : demand / resistance;
  const check = (name, resistance, demand = vertical, unit = 'kN') =>
    ({ name, resistance, demand, unit, ratio: ratio(demand, resistance) });
  const checks = [
    check('P358 Check 4 · Notched web gross shear', grossResistance),
    check('P358 Check 4 · Notched web net shear', netResistance),
    check('P358 Check 4 · Notched web block tearing', blockResistance),
  ];
  const bending = (name, shearResistance, lever) => {
    const reduction = Math.max(0, 1 - Math.max(0, 2 * ratio(vertical, shearResistance) - 1) ** 2);
    return { ...check(name, fy * modulus * reduction / 1e6, vertical * lever / 1000, 'kNm'),
      lever, shearResistance, reduction };
  };
  if (columns === 2 && length > endToLastColumn) {
    checks.push(bending('P358 Check 4 · Notched web bending at connection',
      Math.min(grossResistance, netResistance), gap + endToLastColumn));
  }
  const closeToLastColumn = columns === 2 && length - endToLastColumn < 2 * bolt.diameter;
  const lever = closeToLastColumn ? Math.max(shoulder, gap + endToLastColumn) : shoulder;
  const shoulderShear = closeToLastColumn ? Math.min(grossResistance, netResistance) : grossResistance;
  checks.push(bending('P358 Check 5 · Bending at notch shoulder', shoulderShear, lever));
  const slenderness = beam.h / tw;
  if (input.restrained && (fy === 275 || fy === 355)) {
    const stocky = fy === 275 ? 54.3 : 48;
    const coefficient = fy === 275 ? 160000 : 110000;
    checks.push(
      check('P358 Check 6 · Notch depth limit', beam.h / (top && bottom ? 5 : 2), Math.max(top, bottom), 'mm'),
      check('P358 Check 6 · Notch length limit',
        slenderness <= stocky ? beam.h : coefficient * beam.h / slenderness ** 3, length, 'mm'),
    );
  }
  return { depth, area, net, netTension, netShear, modulus, checks };
}
