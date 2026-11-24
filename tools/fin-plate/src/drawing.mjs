import { drawSupportedWidth, drawSupportingElevation, drawSupportingPlan } from './beam-drawing.mjs';
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

function elevation(s, beam, _input, result, options) {
  const { height, width, beamCentre, clear, group, bolt, notch, beamLayout, beamGap: gap } = result;
  const top = height - beamCentre - beam.h / 2;
  const span = Math.max(width, notch?.shoulder ?? 0) + Math.max(80, beam.h * 0.15);
  const supporting = beamLayout ? drawSupportingElevation(s, beamLayout, top, options.dimensions) : null;
  const widthDimension = Math.max(height, top + beam.h, supporting?.bottom ?? 0) + 45;
  const lower = top + beam.h;
  const shoulder = notch?.shoulder ?? gap;
  const nt = notch?.top ?? 0;
  const nb = notch?.bottom ?? 0;
  const outline = [[gap, top + nt], [shoulder, top + nt], [shoulder, top], [span, top],
    [span, lower], [shoulder, lower], [shoulder, lower - nb], [gap, lower - nb]];
  s.add('polygon', { points: outline.map(point => point.join(',')).join(' '), class: 'beam' });
  s.line(nt ? shoulder : gap, top + beam.tf, span, top + beam.tf);
  s.line(nb ? shoulder : gap, lower - beam.tf, span, lower - beam.tf);
  s.line(nt ? shoulder : gap, height - beamCentre - clear / 2, span, height - beamCentre - clear / 2, 'axis');
  s.line(nb ? shoulder : gap, height - beamCentre + clear / 2, span, height - beamCentre + clear / 2, 'axis');
  s.rect(0, 0, width, height, 'plate');
  if (!supporting) s.line(0, -20, 0, height + 20, 'support');
  if (supporting && options.dimensions && Number.isFinite(beamLayout.referenceFraction)) {
    const referenceY = top + beam.h * beamLayout.referenceFraction;
    s.line(supporting.left - 4, referenceY, span + 4, referenceY, 'level-reference')
      .setAttribute('data-alignment', beamLayout.alignment);
  }
  for (const b of group.bolts) s.add('circle', { cx: b.x, cy: height - b.y, r: bolt.hole / 2, class: 'bolt' });
  if (options.dimensions) {
    s.line(0, widthDimension, width, widthDimension, 'dimension');
    for (const x of [0, width]) s.line(x, widthDimension - 7, x, widthDimension + 7, 'dimension');
    s.label(width / 2, widthDimension - 9, mm(width));
    const heightDimension = span + (supporting ? 155 : 28);
    s.line(heightDimension, 0, heightDimension, height, 'dimension');
    for (const y of [0, height]) s.line(heightDimension - 7, y, heightDimension + 7, y, 'dimension');
    s.label(heightDimension + 12, height / 2, mm(height), 'start');
    if (notch) {
      const dimY = Math.min(top, 0) - 30;
      s.line(gap, dimY, shoulder, dimY, 'dimension');
      s.label((gap + shoulder) / 2, dimY - 8, mm(notch.length));
      for (const x of [gap, shoulder]) s.line(x, dimY - 5, x, dimY + 5, 'dimension');
      if (nt) s.label(shoulder + 8, top + nt / 2, 'Top notch ' + mm(nt), 'start');
      if (nb) s.label(shoulder + 8, lower - nb / 2, 'Bottom notch ' + mm(nb), 'start');
    }
    if (supporting) {
      const x = span + 24;
      s.line(x, top, x, lower, 'dimension');
      for (const y of [top, lower]) s.line(x - 6, y, x + 6, y, 'dimension');
      s.label(x + 12, (top + lower) / 2 + 24, 'h ' + mm(beam.h), 'start');
      s.label(span, top - 15, 'Supported · ' + (beam.name ?? 'I-section'), 'end');
      s.label(span, lower + 30, 'tw ' + mm(beam.tw) + ' · tf ' + mm(beam.tf), 'end');
      const gapY = widthDimension + 27;
      s.line(0, gapY, gap, gapY, 'dimension');
      for (const x of [0, gap]) s.line(x, gapY - 6, x, gapY + 6, 'dimension');
      s.label(gap / 2, gapY + 25, 'g ' + mm(gap));
    } else if (!notch) s.label(gap, top - 12, 'Supported beam', 'start');
  }
  if (supporting) {
    const left = supporting.left - 165;
    const y = Math.min(top, supporting.top, 0) - 75;
    return [left, y, span - left + 290, widthDimension - y + 75];
  }
  return [-78, Math.min(top, -20) - 45, span + 240, widthDimension - Math.min(top, -20) + 75];
}

function plan(s, beam, input, result, options) {
  const angle = input.skew * Math.PI / 180;
  const c = Math.cos(angle);
  const t = Math.sin(angle);
  const { beamLayout, beamGap: gap, notch } = result;
  const end = Math.max(result.width + 60, result.z + 65, (notch?.shoulder ?? 0) + 50);
  const point = (x, y) => [c * x - t * y, t * x + c * y];
  const polygon = (corners, style, attrs = {}) => s.add('polygon', {
    points: corners.map(([x, y]) => point(x, y).join(',')).join(' '), class: style, ...attrs,
  });
  const b = beam.b / 2;
  const start = notch?.top ? notch.shoulder : gap;
  const depth = Math.max(120, Math.abs(t * (end + 65)) + b + 44);
  const left = beamLayout ? drawSupportingPlan(s, beamLayout, depth, options.dimensions) : -b - 54;
  const beamOutline = [[start, -b], [end, -b], [end, b], [start, b]];
  polygon(beamOutline, 'beam');
  if (notch?.bottom) {
    s.line(...point(notch.shoulder, -b), ...point(notch.shoulder, b), 'axis');
  }
  polygon([[gap, -beam.tw / 2], [end, -beam.tw / 2], [end, beam.tw / 2], [gap, beam.tw / 2]], 'projected-web');
  polygon([[0, 0], [result.width, 0], [result.width, input.thickness], [0, input.thickness]], 'plate');
  if (!beamLayout && result.supportClearance < 0) {
    const clip = s.add('clipPath', { id: options.idPrefix + '-overlap-clip' });
    scene(clip).rect(-b - 54, -depth, b + 54, 2 * depth, '');
    polygon(beamOutline, 'beam-overlap', { 'clip-path': `url(#${options.idPrefix}-overlap-clip)` });
  }
  if (!beamLayout) s.line(0, -depth, 0, depth, result.supportClearance < 0 ? 'support conflict' : 'support');
  s.line(0, 0, ...point(end, 0), 'axis');
  s.line(0, 0, end, 0, 'axis');
  const [actualX, actualY] = point(result.group.centroid.x, 0);
  s.add('circle', { cx: actualX, cy: actualY, r: 5, class: 'governing' });
  const [x, y] = point(result.z, 0);
  if (options.dimensions) {
    if (Math.abs(result.z - result.group.centroid.x) > 0.01) s.add('circle', { cx: x, cy: y, r: 5, class: 'bolt' });
    s.line(0, y, x, y, 'dimension');
    s.label(Math.max(45, x / 2), y - 10, mm(result.normal));
    if (beamLayout) drawSupportedWidth(s, point, beam, end);
    else s.label(20, -depth - 12, supportNames[input.support], 'start');
    s.label(x + 12, y + 24, input.skew + '°', 'start');
  }
  const bound = Math.min(left, ...beamOutline.map(p => point(...p)[0])) - 60;
  return [bound, -depth - 40, end + b - bound + (beamLayout ? 265 : 54), 2 * depth + 106];
}

export function draw(node, beam, input, result, options) {
  node.replaceChildren();
  options = { idPrefix: 'fin', ...options };
  const render = { elevation, plan }[options.view];
  return render(scene(node), beam, input, result, options);
}

export function drawBoltGroup(node, { group, bolt }, governing) {
  node.replaceChildren();
  const s = scene(node);
  const marker = s.add('marker', { id: 'fin-bolt-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5,
    markerWidth: 6, markerHeight: 6, orient: 'auto' });
  scene(marker).add('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'arrow-head' });
  const radius = bolt.hole / 2;
  const bolts = group.bolts.map(b => ({ ...b, x: b.dx, y: -b.dy }));
  const maxForce = Math.max(...bolts.map(b => b.force));
  const scale = maxForce > 0 ? Math.max(36, radius * 2.5) / maxForce : 0;
  const pad = Math.max(66, radius * 4);
  const left = Math.min(...bolts.map(b => b.x)) - pad;
  const right = Math.max(...bolts.map(b => b.x)) + pad;
  const top = Math.min(...bolts.map(b => b.y)) - pad;
  const bottom = Math.max(...bolts.map(b => b.y)) + pad;
  node.setAttribute('viewBox', [left, top, right - left, bottom - top].join(' '));
  s.line(left + 8, 0, right - 8, 0, 'axis');
  s.line(0, top + 8, 0, bottom - 8, 'axis');
  for (const b of bolts) {
    const item = s.add('g', { 'data-bolt': b.id });
    const draw = scene(item);
    draw.add('title', {}, 'Bolt ' + b.id + ': Fx ' + b.fx.toFixed(2) + ' kN, Fy ' + b.fy.toFixed(2)
      + ' kN, resultant ' + b.force.toFixed(2) + ' kN');
    draw.add('circle', { cx: b.x, cy: b.y, r: radius, class: b.id === governing ? 'governing' : 'bolt' });
    if (b.force > 0) draw.line(b.x, b.y, b.x + scale * b.fx, b.y - scale * b.fy, 'force')
      .setAttribute('marker-end', 'url(#fin-bolt-arrow)');
    draw.label(b.x, b.y + (b.fy >= 0 ? radius + 12 : -radius - 5), String(b.id), 'middle')
      .classList.add('bolt-label');
  }
}
