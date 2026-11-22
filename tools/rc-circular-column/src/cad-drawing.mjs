const layerColors = ['#214c7b', '#28664e', '#8b4d2b', '#624487'];
const collisionColor = '#a12420';
const svgNS = 'http://www.w3.org/2000/svg';
const mm = value => value.toFixed(1) + ' mm';

function svgElement(parent, tag, attributes, text) {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  parent.append(element);
  return element;
}

const dimensionStyle = { stroke: '#44515c', 'stroke-width': 0.9, fill: 'none' };

export function drawSection(svg, legend, input, geometry) {
  svg.replaceChildren();
  if (!geometry) {
    legend.textContent = 'Enter valid reinforcement inputs to view the section.';
    return;
  }
  const { concreteRadius: radius, rings } = geometry;
  const scale = 180 / radius;
  const x = 250, y = 200;
  const section = svgElement(svg, 'g', { transform: 'translate(' + x + ' ' + y + ')' });
  svgElement(section, 'circle', { r: 180, fill: '#fcfcfa', stroke: '#26333e', 'stroke-width': 1.5 });
  svgElement(section, 'path', { d: 'M-190 0H190 M0-190V190', stroke: '#939fa7',
    'stroke-width': .8, 'stroke-dasharray': '9 4 2 4' });
  const legends = [];
  const mode = input.transverse === 'links' ? 'link' : 'helix';
  for (const [index, ring] of rings.entries()) {
    const color = ring.collision ? collisionColor : layerColors[index % layerColors.length];
    const group = svgElement(section, 'g', { 'data-layer': index + 1, 'data-collision': ring.collision });
    if (ring.linkRadius > 0 && ring.barRadius > 0) {
      svgElement(group, 'circle', { class: 'section-link', r: ring.linkRadius * scale,
        fill: 'none', stroke: color, 'stroke-width': ring.link * scale });
      for (const bar of ring.bars) {
        svgElement(group, 'circle', { class: 'section-bar', cx: bar.x * scale, cy: -bar.y * scale,
          r: ring.bar / 2 * scale, fill: color });
      }
    }
    const mark = 'L' + (index + 1);
    const gap = ring.radialClear === null ? ' · cover ' + mm(ring.cover)
      : ' · radial clear ' + mm(ring.radialClear) + ' · to inner ' + mode + ' ' + mm(ring.placementGap);
    legends.push(mark + ' · ' + ring.count + 'Ø' + ring.bar + ' · ' + mode + ' Ø' + ring.link + ' @ ' +
      ring.spacing + ' mm · radii ' + mm(ring.barRadius) + ' / ' + mm(ring.linkRadius) + gap);
  }
  const outer = rings[0];
  const inner = rings[1];
  if (outer.cover >= 0 && outer.linkRadius > 0) {
    const edge = (outer.linkRadius + outer.link / 2) * scale;
    svgElement(section, 'path', { d: 'M' + edge + ' 5v12 M180 5v12 M' + edge + ' 12H180', ...dimensionStyle });
    svgElement(section, 'text', { x: 182, y: 28, class: 'cad-dimension', 'text-anchor': 'end' }, 'c = ' + mm(outer.cover));
  }
  if (inner?.placementGap > 0) {
    const u = (outer.barRadius - outer.bar / 2) * scale;
    const v = (inner.linkRadius + inner.link / 2) * scale;
    svgElement(section, 'path', { d: 'M' + (-u) + ' 4v14 M' + (-v) + ' 4v14 M' + (-u) + ' 12H' + (-v),
      ...dimensionStyle });
    svgElement(section, 'text', { x: -182, y: 32, class: 'cad-dimension' }, 'gap ' + mm(inner.placementGap));
  }
  svgElement(svg, 'path', { d: 'M70 203v216 M430 203v216 M67 409H433 M65 414l10-10 M425 414l10-10', ...dimensionStyle });
  svgElement(svg, 'text', { x, y: 435, 'text-anchor': 'middle', class: 'cad-dimension' }, 'Ø' + input.diameter + ' mm');
  if (mode === 'helix') legends.push('Helix rings show the plan projection over one complete turn.');
  legend.replaceChildren(...legends.map(text => {
    const line = document.createElement('span');
    line.textContent = text;
    return line;
  }));
}
