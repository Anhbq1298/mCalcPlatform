const svg = 'http://www.w3.org/2000/svg';
const mm = value => value.toFixed(1) + ' mm';

function scene(node) {
  const add = (tag, attrs, label) => {
    const element = document.createElementNS(svg, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    if (label) element.textContent = label;
    node.append(element);
    return element;
  };
  return {
    add,
    line: (x1, y1, x2, y2, style = 'outline') => add('line', { x1, y1, x2, y2, class: style }),
    rect: (x, y, width, height, style) => add('rect', { x, y, width, height, class: style }),
    label: (x, y, value, anchor = 'middle') => add('text', { x, y, 'text-anchor': anchor }, value),
  };
}

function elevation(s, beam, input, result, options) {
  const { height, width, beamCentre, clear, group, bolt } = result;
  const top = height - beamCentre - beam.h / 2;
  const span = width + Math.max(80, beam.h * 0.15);
  const widthDimension = Math.max(height, top + beam.h) + 40;
  s.rect(input.gap, top, span - input.gap, beam.h, 'beam');
  for (const y of [top + beam.tf, top + beam.h - beam.tf]) s.line(input.gap, y, span, y);
  for (const y of [height - beamCentre - clear / 2, height - beamCentre + clear / 2]) {
    s.line(input.gap, y, span, y, 'axis');
  }
  s.rect(0, 0, width, height, 'plate');
  s.line(0, -20, 0, height + 20, 'support');
  const maximum = Math.max(1, ...group.bolts.map(b => b.force));
  for (const b of group.bolts) {
    const y = height - b.y;
    s.add('circle', { cx: b.x, cy: y, r: bolt.hole / 2, class: b.id === options.governing ? 'governing' : 'bolt' });
    if (!options.forces || !b.force) continue;
    const length = Math.min(52, input.pitch / 2) / maximum;
    const x2 = b.x + length * b.fx;
    const y2 = y - length * b.fy;
    s.line(b.x, y, x2, y2, 'force').setAttribute('marker-end', 'url(#fin-arrow)');
  }
  if (options.dimensions) {
    s.line(0, widthDimension, width, widthDimension, 'dimension');
    for (const x of [0, width]) s.line(x, widthDimension - 7, x, widthDimension + 7, 'dimension');
    s.label(width / 2, widthDimension - 9, mm(width));
    const heightDimension = span + 28;
    s.line(heightDimension, 0, heightDimension, height, 'dimension');
    for (const y of [0, height]) s.line(heightDimension - 7, y, heightDimension + 7, y, 'dimension');
    s.label(heightDimension + 12, height / 2, mm(height), 'start');
    s.label(input.gap, top - 12, 'Supported beam', 'start');
  }
  return [-78, Math.min(top, -20) - 45, span + 240, widthDimension - Math.min(top, -20) + 75];
}

function plan(s, beam, input, result, options) {
  const angle = input.skew * Math.PI / 180;
  const c = Math.cos(angle);
  const t = Math.sin(angle);
  const end = Math.max(result.width + 60, result.z + 65);
  const point = (x, y) => [c * x - t * y, t * x + c * y];
  const polygon = (corners, style) => s.add('polygon', {
    points: corners.map(([x, y]) => point(x, y).join(',')).join(' '), class: style,
  });
  const b = beam.b / 2;
  polygon([[input.gap, -b], [end, -b], [end, b], [input.gap, b]], 'beam');
  polygon([[0, 0], [result.width, 0], [result.width, input.thickness], [0, input.thickness]], 'plate');
  const depth = Math.max(120, Math.abs(t * end) + b + 24);
  s.line(0, -depth, 0, depth, 'support');
  s.line(0, 0, ...point(end, 0), 'axis');
  s.line(0, 0, end, 0, 'axis');
  const [actualX, actualY] = point(result.group.centroid.x, 0);
  s.add('circle', { cx: actualX, cy: actualY, r: 5, class: 'governing' });
  const [x, y] = point(result.z, 0);
  if (options.dimensions) {
    if (Math.abs(result.z - result.group.centroid.x) > 0.01) s.add('circle', { cx: x, cy: y, r: 5, class: 'bolt' });
    s.line(0, y, x, y, 'dimension');
    s.label(Math.max(45, x / 2), y - 10, mm(result.normal));
    s.label(20, -depth - 12, 'Support face', 'start');
    s.label(x + 12, y + 24, input.skew + '°', 'start');
  }
  return [-b - 54, -depth - 40, end + 2 * b + 108, 2 * depth + 80];
}

function section(s, beam, result, options) {
  const w = beam.tw / 2;
  const b = beam.b / 2;
  const h = beam.h;
  const f = beam.tf;
  const r = beam.r;
  s.add('path', { class: 'beam', d: [
    'M', -b, 0, 'H', b, 'V', f, 'H', w + r, 'Q', w, f, w, f + r,
    'V', h - f - r, 'Q', w, h - f, w + r, h - f, 'H', b, 'V', h,
    'H', -b, 'V', h - f, 'H', -w - r, 'Q', -w, h - f, -w, h - f - r,
    'V', f + r, 'Q', -w, f, -w - r, f, 'H', -b, 'Z',
  ].join(' ') });
  s.line(-b - 28, h / 2, b + 28, h / 2, 'axis');
  if (options.dimensions) {
    s.label(0, -15, mm(beam.b));
    s.label(b + 25, h / 2 - 10, mm(h), 'start');
    s.label(b + 25, h / 2 + 20, mm(result.clear) + ' clear web', 'start');
  }
  return [-b - 85, -55, 2 * b + 330, h + 110];
}

export function draw(node, beam, input, result, options) {
  node.replaceChildren();
  const marker = scene(node).add('marker', { id: 'fin-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5,
    markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
  scene(marker).add('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'arrow-head' });
  const render = { elevation, plan, section }[options.view];
  return render(scene(node), beam, input, result, options);
}
