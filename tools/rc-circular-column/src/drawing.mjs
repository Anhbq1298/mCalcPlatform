import { cageGeometry, linkGeometry } from './inputs.mjs';

function frame(canvas) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  context.scale(scale, scale);
  return { context, width, height };
}

const layerColors = ['#214c7b', '#28664e', '#8b4d2b', '#624487'];
const svgNS = 'http://www.w3.org/2000/svg';

function svgElement(parent, tag, attributes, text) {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  parent.append(element);
  return element;
}

export function drawSection(svg, legend, values) {
  svg.replaceChildren();
  const radius = values.diameter / 2;
  if (!(radius > 0) || !Number.isFinite(radius)) {
    legend.textContent = 'Enter the section diameter to view the reinforcement.';
    return;
  }
  const links = values.transverse === 'links';
  const rings = links ? linkGeometry(values) : cageGeometry(values).map(cage => ({
    ...cage, linkRadius: cage.spiralRadius, link: cage.spiral, spacing: cage.pitch,
  }));
  const scale = 180 / radius;
  const x = 250, y = 200;
  const section = svgElement(svg, 'g', { transform: 'translate(' + x + ' ' + y + ')' });
  svgElement(section, 'circle', { r: 180, fill: '#fcfcfa', stroke: '#26333e', 'stroke-width': 1.5 });
  svgElement(section, 'path', { d: 'M-190 0H190 M0-190V190', stroke: '#939fa7', 'stroke-width': .8, 'stroke-dasharray': '9 4 2 4' });
  const legends = [];
  rings.forEach((ring, index) => {
    if (!(ring.barRadius > 0 && ring.linkRadius > 0 && ring.link > 0)
      || !Number.isInteger(ring.count) || ring.count < 3 || ring.count > 300) return;
    const color = layerColors[index % layerColors.length];
    const group = svgElement(section, 'g', { 'data-layer': index + 1 });
    svgElement(group, 'circle', { class: 'section-link', r: ring.linkRadius * scale,
      fill: 'none', stroke: color, 'stroke-width': ring.link * scale });
    for (let bar = 0; bar < ring.count; bar++) {
      const angle = 2 * Math.PI * bar / ring.count;
      svgElement(group, 'circle', { class: 'section-bar',
        cx: ring.barRadius * scale * Math.cos(angle), cy: -ring.barRadius * scale * Math.sin(angle),
        r: ring.bar / 2 * scale, fill: color });
    }
    const mark = 'L' + (index + 1);
    const gap = ring.radialClear == null ? '' : ' · radial clear ' + ring.radialClear.toFixed(1) + ' mm';
    legends.push(mark + ': ' + ring.count + 'Ø' + ring.bar + ' · ' + (links ? 'link' : 'spiral')
      + ' Ø' + ring.link + ' @ ' + ring.spacing + ' mm' + gap);
  });
  svgElement(svg, 'path', { d: 'M70 203v216 M430 203v216 M67 409H433 M65 414l10-10 M425 414l10-10',
    stroke: '#44515c', 'stroke-width': .9, fill: 'none' });
  svgElement(svg, 'text', { x, y: 435, 'text-anchor': 'middle', class: 'cad-dimension' },
    'Ø' + values.diameter + ' mm');
  legend.replaceChildren(...legends.map(text => {
    const line = document.createElement('span');
    line.textContent = text;
    return line;
  }));
}

function gridTicks(min, max, requested, divisions) {
  const span = max - min;
  const magnitude = 10 ** Math.floor(Math.log10(span / divisions));
  const step = requested > 0 && span / requested <= 40
    ? requested
    : [1, 2, 5, 10].map(value => value * magnitude).find(value => span / value <= divisions);
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step);
  const labelEvery = Math.max(1, Math.ceil((last - first) / divisions));
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const tick = index + first;
    return { value: tick * step, label: tick % labelEvery === 0 };
  });
}

function plotLine(g, x0, y0, x1, y1) {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

function plotAxis(g, x0, y0, x1, y1, color) {
  const vertical = x0 === x1;
  g.strokeStyle = g.fillStyle = color;
  plotLine(g, x0, y0, x1, y1);
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x1 + (vertical ? -4 : -7), y1 + (vertical ? 7 : -4));
  g.lineTo(x1 + (vertical ? 4 : -7), y1 + (vertical ? 7 : 4));
  g.closePath();
  g.fill();
}

const tickFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 3 });

export function drawInteraction(canvas, result, { gridP, gridM, angle }) {
  const { context: g, width, height } = frame(canvas);
  if (!result?.curve.length) return;
  const [moment, axial] = result.demand;
  const maxM = Math.max(1, moment, ...result.curve.map(([m]) => m)) * 1.08;
  const minP = Math.min(0, axial, ...result.curve.map(([, p]) => p));
  const maxP = Math.max(1, axial, ...result.curve.map(([, p]) => p));
  const margin = (maxP - minP) * 0.08;
  const lo = minP - margin, hi = maxP + margin;
  const pTicks = gridTicks(lo, hi, gridP, 5);
  g.font = '12px Roboto, sans-serif';
  const left = Math.ceil(Math.max(30, ...pTicks.filter(tick => tick.label)
    .map(tick => g.measureText(tickFormat.format(tick.value)).width))) + 9;
  const right = width - 43, top = 29, bottom = height - 24;
  if (right <= left || bottom <= top) return;

  const x = m => left + m / maxM * (right - left);
  const y = p => bottom - (p - lo) / (hi - lo) * (bottom - top);
  const ink = '#26333e', purple = '#6a3fa1';
  g.strokeStyle = '#c3cbc8';
  g.fillStyle = '#435159';
  g.lineWidth = 1;
  g.textAlign = 'right';
  for (const tick of pTicks) {
    const yy = y(tick.value);
    plotLine(g, left, yy, right, yy);
    if (tick.label) g.fillText(tickFormat.format(tick.value), left - 6, yy + 4);
  }
  g.textAlign = 'center';
  const divisions = Math.max(2, Math.min(5, Math.floor((right - left) / 53)));
  for (const tick of gridTicks(0, maxM, gridM, divisions)) {
    const xx = x(tick.value);
    plotLine(g, xx, top, xx, bottom);
    if (tick.label) g.fillText(tickFormat.format(tick.value), xx, bottom + 16);
  }

  g.lineWidth = 1.25;
  plotAxis(g, left, bottom, left, 10, purple);
  plotAxis(g, left, y(0), width - 6, y(0), ink);
  g.fillStyle = purple;
  g.textAlign = 'left';
  g.fillText('+P compression', left + 7, 14);
  g.fillStyle = ink;
  g.textAlign = 'right';
  g.fillText('+M', width - 5, y(0) - 8);
  if (angle != null && y(0) + 16 < height - 10) g.fillText('θ ' + angle.toFixed(0) + '°', width - 5, y(0) + 16);

  g.save();
  g.beginPath();
  g.rect(left, top, right - left, bottom - top);
  g.clip();
  g.strokeStyle = '#2b3a8c';
  g.lineWidth = 2;
  g.beginPath();
  result.curve.forEach(([m, p], index) => {
    if (index === 0) g.moveTo(x(m), y(p));
    else g.lineTo(x(m), y(p));
  });
  g.stroke();
  g.restore();

  g.fillStyle = '#d89b15';
  g.strokeStyle = ink;
  g.lineWidth = 1;
  g.beginPath();
  g.arc(x(moment), y(axial), 4.5, 0, 2 * Math.PI);
  g.fill();
  g.stroke();
}
