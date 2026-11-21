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

export function drawInteraction(canvas, result) {
  const { context: g, width, height } = frame(canvas);
  if (!result?.curve.length) return;
  const [moment, axial] = result.demand;
  const maxM = Math.max(1, Math.abs(moment), ...result.curve.map(([m]) => Math.abs(m))) * 1.08;
  const minN = Math.min(0, axial, ...result.curve.map(([, n]) => n));
  const maxN = Math.max(1, axial, ...result.curve.map(([, n]) => n));
  const span = maxN - minN;
  const right = width - 22, left = 56, top = 22, bottom = height - 36;
  const x = m => left + (m + maxM) / (2 * maxM) * (right - left);
  const y = n => bottom - (n - minN) / span * (bottom - top);
  g.font = '12px Roboto, sans-serif';
  g.fillStyle = '#56636a';
  g.strokeStyle = '#c3cbc8';
  for (let i = 0; i <= 4; i++) {
    const n = minN + span * i / 4;
    g.fillText(n.toFixed(0), 6, y(n) + 4);
    g.beginPath(); g.moveTo(left, y(n)); g.lineTo(right, y(n)); g.stroke();
    const m = -maxM + 2 * maxM * i / 4;
    g.fillText(m.toFixed(0), x(m) - 14, bottom + 15);
  }
  g.fillText('N (kN)', 6, 12);
  g.fillText('M (kN·m)', (left + right) / 2 - 25, height - 3);
  g.strokeStyle = '#2b3a8c';
  g.lineWidth = 2;
  for (const sign of [1, -1]) {
    g.beginPath();
    result.curve.forEach(([m, n], index) => {
      if (index === 0) g.moveTo(x(sign * m), y(n));
      else g.lineTo(x(sign * m), y(n));
    });
    g.stroke();
  }
  g.fillStyle = '#b8322a';
  g.beginPath();
  g.arc(x(moment), y(axial), 5, 0, 2 * Math.PI);
  g.fill();
}
