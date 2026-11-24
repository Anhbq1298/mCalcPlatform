import { supportNames } from './inputs.mjs';

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
  const { height, width, beamCentre, clear, group, bolt, notch } = result;
  const top = height - beamCentre - beam.h / 2;
  const span = Math.max(width, notch?.shoulder ?? 0) + Math.max(80, beam.h * 0.15);
  const widthDimension = Math.max(height, top + beam.h) + 40;
  const lower = top + beam.h;
  const shoulder = notch?.shoulder ?? input.gap;
  const nt = notch?.top ?? 0;
  const nb = notch?.bottom ?? 0;
  const outline = [[input.gap, top + nt], [shoulder, top + nt], [shoulder, top], [span, top],
    [span, lower], [shoulder, lower], [shoulder, lower - nb], [input.gap, lower - nb]];
  s.add('polygon', { points: outline.map(point => point.join(',')).join(' '), class: 'beam' });
  s.line(nt ? shoulder : input.gap, top + beam.tf, span, top + beam.tf);
  s.line(nb ? shoulder : input.gap, lower - beam.tf, span, lower - beam.tf);
  s.line(nt ? shoulder : input.gap, height - beamCentre - clear / 2, span, height - beamCentre - clear / 2, 'axis');
  s.line(nb ? shoulder : input.gap, height - beamCentre + clear / 2, span, height - beamCentre + clear / 2, 'axis');
  s.rect(0, 0, width, height, 'plate');
  s.line(0, -20, 0, height + 20, 'support');
  const maximum = Math.max(1, ...group.bolts.map(b => b.force));
  for (const b of group.bolts) {
    const y = height - b.y;
    const isGoverning = b.id === options.governing;
    s.add('circle', { cx: b.x, cy: y, r: bolt.hole / 2, class: isGoverning ? 'governing' : 'bolt' });
    if (isGoverning) s.label(b.x + bolt.hole / 2 + 7, y - bolt.hole / 2, String(b.id), 'start').classList.add('bolt-label');
    if (!options.forces || !b.force) continue;
    const length = Math.min(52, input.pitch / 2) / maximum;
    const x2 = b.x + length * b.fx;
    const y2 = y - length * b.fy;
    s.line(b.x, y, x2, y2, 'force').setAttribute('marker-end', `url(#${options.idPrefix}-arrow)`);
  }
  if (options.dimensions) {
    s.line(0, widthDimension, width, widthDimension, 'dimension');
    for (const x of [0, width]) s.line(x, widthDimension - 7, x, widthDimension + 7, 'dimension');
    s.label(width / 2, widthDimension - 9, mm(width));
    const heightDimension = span + 28;
    s.line(heightDimension, 0, heightDimension, height, 'dimension');
    for (const y of [0, height]) s.line(heightDimension - 7, y, heightDimension + 7, y, 'dimension');
    s.label(heightDimension + 12, height / 2, mm(height), 'start');
    if (notch) {
      const dimY = Math.min(top, 0) - 30;
      s.line(input.gap, dimY, shoulder, dimY, 'dimension');
      s.label((input.gap + shoulder) / 2, dimY - 8, mm(notch.length));
      for (const x of [input.gap, shoulder]) s.line(x, dimY - 5, x, dimY + 5, 'dimension');
      if (nt) s.label(shoulder + 8, top + nt / 2, 'Top notch ' + mm(nt), 'start');
      if (nb) s.label(shoulder + 8, lower - nb / 2, 'Bottom notch ' + mm(nb), 'start');
    } else s.label(input.gap, top - 12, 'Supported beam', 'start');
  }
  return [-78, Math.min(top, -20) - 45, span + 240, widthDimension - Math.min(top, -20) + 75];
}

function plan(s, beam, input, result, options) {
  const angle = input.skew * Math.PI / 180;
  const c = Math.cos(angle);
  const t = Math.sin(angle);
  const end = Math.max(result.width + 60, result.z + 65);
  const point = (x, y) => [c * x - t * y, t * x + c * y];
  const polygon = (corners, style, attrs = {}) => s.add('polygon', {
    points: corners.map(([x, y]) => point(x, y).join(',')).join(' '), class: style, ...attrs,
  });
  const b = beam.b / 2;
  const beamOutline = [[input.gap, -b], [end, -b], [end, b], [input.gap, b]];
  polygon(beamOutline, 'beam');
  polygon([[0, 0], [result.width, 0], [result.width, input.thickness], [0, input.thickness]], 'plate');
  const depth = Math.max(120, Math.abs(t * end) + b + 24);
  if (result.supportClearance < 0) {
    const clip = s.add('clipPath', { id: options.idPrefix + '-overlap-clip' });
    scene(clip).rect(-b - 54, -depth, b + 54, 2 * depth, '');
    polygon(beamOutline, 'beam-overlap', { 'clip-path': `url(#${options.idPrefix}-overlap-clip)` });
  }
  s.line(0, -depth, 0, depth, result.supportClearance < 0 ? 'support conflict' : 'support');
  s.line(0, 0, ...point(end, 0), 'axis');
  s.line(0, 0, end, 0, 'axis');
  const [actualX, actualY] = point(result.group.centroid.x, 0);
  s.add('circle', { cx: actualX, cy: actualY, r: 5, class: 'governing' });
  const [x, y] = point(result.z, 0);
  if (options.dimensions) {
    if (Math.abs(result.z - result.group.centroid.x) > 0.01) s.add('circle', { cx: x, cy: y, r: 5, class: 'bolt' });
    s.line(0, y, x, y, 'dimension');
    s.label(Math.max(45, x / 2), y - 10, mm(result.normal));
    s.label(20, -depth - 12, supportNames[input.support], 'start');
    s.label(x + 12, y + 24, input.skew + '°', 'start');
  }
  return [-b - 54, -depth - 40, end + 2 * b + 108, 2 * depth + 80];
}

export function draw(node, beam, input, result, options) {
  node.replaceChildren();
  options = { idPrefix: 'fin', ...options };
  if (options.view === 'elevation') {
    const marker = scene(node).add('marker', { id: options.idPrefix + '-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5,
      markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    scene(marker).add('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'arrow-head' });
  }
  const render = { elevation, plan }[options.view];
  return render(scene(node), beam, input, result, options);
}
