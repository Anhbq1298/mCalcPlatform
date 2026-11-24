const dim = value => value.toFixed(1) + ' mm';
const designation = (beam, role) => role + ' · ' + (beam.name ?? 'I-section');

export function drawSupportingElevation(s, layout, supportedTop, dimensions) {
  const { profile: beam, projection, offset, c } = layout;
  const left = -(beam.tw + projection) / c;
  const web = -beam.tw / c;
  const right = projection / c;
  const top = supportedTop - offset;
  const bottom = top + beam.h;
  const a = top + beam.tf;
  const b = bottom - beam.tf;
  const corner = beam.r / c;
  s.add('path', {
    d: `M${left},${top} H${right} V${a} H${corner}
      Q0,${a} 0,${a + beam.r} V${b - beam.r} Q0,${b} ${corner},${b}
      H${right} V${bottom} H${left} V${b} H${web - corner}
      Q${web},${b} ${web},${b - beam.r} V${a + beam.r}
      Q${web},${a} ${web - corner},${a} H${left} Z`,
    class: 'support-beam',
  });
  if (dimensions) {
    s.label(left, top - 16, designation(beam, 'Supporting'), 'start');
    s.label(left - 17, (top + bottom) / 2, 'h ' + dim(beam.h), 'end');
    s.line(left - 11, top, left - 11, bottom, 'dimension');
    for (const y of [top, bottom]) s.line(left - 17, y, left - 5, y, 'dimension');
    s.label(left, bottom + 32, 'tw ' + dim(beam.tw) + ' · tf ' + dim(beam.tf), 'start');
  }
  return { left, top, bottom, right };
}

export function drawSupportingPlan(s, layout, depth, dimensions) {
  const { profile: beam, projection } = layout;
  const left = -projection - beam.tw;
  s.rect(left, -depth, beam.b, 2 * depth, 'support-beam');
  for (const x of [-beam.tw, 0]) s.line(x, -depth, x, depth, 'axis');
  if (dimensions) {
    s.label(left, -depth - 17, designation(beam, 'Supporting'), 'start');
    const y = depth + 28;
    s.line(left, y, projection, y, 'dimension');
    for (const x of [left, projection]) s.line(x, y - 6, x, y + 6, 'dimension');
    s.label((left + projection) / 2, y + 25, 'b ' + dim(beam.b));
    s.label(left, depth - 12, 'tw ' + dim(beam.tw), 'start');
  }
  return left;
}

export function drawSupportedWidth(s, point, beam, end) {
  const cross = beam.b / 2;
  const axis = end + 18;
  s.line(...point(axis, -cross), ...point(axis, cross), 'dimension');
  for (const y of [-cross, cross]) s.line(...point(axis - 6, y), ...point(axis + 6, y), 'dimension');
  const [x, y] = point(axis + 9, 0);
  s.label(x + 6, y, 'b ' + dim(beam.b), 'start');
  s.label(x, y + 30, designation(beam, 'Supported'), 'start');
}
