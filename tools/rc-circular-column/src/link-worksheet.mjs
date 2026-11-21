import { A4, PAGE_GAP } from '../../../../src/export/pageGeometry.ts';
import { linkChecks, linkGeometry } from './inputs.mjs';

const R = String.raw;
const define = (key, expr) => key + R`\coloneq ` + expr;
const call = (fn, ...args) => R`\mathrm{${fn}}\left(${args.join(',')}\right)`;
const mm = R`\,\mathrm{mm}`;
const layerKey = (symbol, index) => symbol + '_{L' + index + '}';

function layerPage(document, shapes, values) {
  const prototype = shapes.s_col_29.props;
  const stride = A4.h + PAGE_GAP;
  for (const shape of Object.values(shapes)) shape.y += 2 * stride;
  document.settings.pages += 2;
  let counter = 0;
  function add(type, x, y, props) {
    const id = 'circ_link_' + counter++;
    shapes[id] = { id, type, x, y, props };
  }
  const text = (x, y, html, fontSize = 13) =>
    add('text', x, y, { w: 640, h: 22, html, fontFamily: 'Inter', fontSize, color: '#334155', align: 'left' });
  const math = (x, y, key, expr, unit = '') =>
    add('math', x, y, { ...prototype, w: 120, latex: define(key, expr), displayUnit: unit, displayMode: 'formulaResult', precision: 2 });

  text(76, 90, 'Circular column · Reinforcement layers', 19);
  text(76, 122, 'Radial order: closed link, longitudinal bars, then the next inner link and bars.');
  text(76, 145, 'Clearance basis: EN 1992-1-1:2004 §8.2(2), recommended values.');
  math(76, 179, 'D', values.diameter + mm, 'mm');
  math(277, 179, 'c_{nom}', values.cover + mm, 'mm');
  math(486, 179, 'd_{g}', values.aggregate + mm, 'mm');
  text(76, 215, 'Diameter');
  text(277, 215, 'Cover to outer link');
  text(486, 215, 'Maximum aggregate size');
  values.layers.forEach((layer, index) => {
    const i = index + 1;
    const y = 257 + index * 85;
    const key = symbol => layerKey(symbol, i);
    const bar = key(R`\phi`);
    const linkDia = 'w_{L' + i + '}';
    const spacing = key('s'), count = key('n');
    text(76, y - 22, 'L' + i + ' · Bars, longitudinal Ø, closed link Ø and vertical spacing');
    math(76, y, count, String(layer.count));
    math(227, y, bar, layer.bar + mm, 'mm');
    math(379, y, linkDia, layer.link + mm, 'mm');
    math(541, y, spacing, layer.spacing + mm, 'mm');
    const previousBar = layerKey(R`\phi`, i - 1);
    const gap = R`g_{L${i}}`;
    if (index) math(76, y + 31, gap, call('max', '20' + mm, previousBar, bar, R`d_{g}+5` + mm, linkDia), 'mm');
    const radius = index
      ? R`${layerKey('r', i - 1)}-0.5${previousBar}-${gap}-0.5${bar}`
      : R`0.5D-c_{nom}-${linkDia}-0.5${bar}`;
    math(index ? 393 : 76, y + 31, key('r'), radius, 'mm');
  });
  text(76, 946, 'Shear resistance credits the outer closed link only. Verify link anchorage and end zones.');

  text(76, stride + 90, 'Reinforcement detailing checks', 19);
  text(76, stride + 122, 'EN 1992-1-1:2004 §8.2 and §9.5.3, recommended values for the regular column zone.');
  const diameters = values.layers.map((_, index) => layerKey(R`\phi`, index + 1));
  math(76, stride + 165, 'w_{min}', call('max', '6' + mm, '0.25' + call('max', ...diameters)), 'mm');
  math(370, stride + 165, 's_{max}', call('min', '400' + mm, 'D', '20' + call('min', ...diameters)), 'mm');
  function check(x, y, latex) {
    add('math', x, y, { ...prototype, w: 130, latex, displayUnit: 'mm', displayMode: 'formulaResult', precision: 1 });
  }
  values.layers.forEach((_, index) => {
    const i = index + 1;
    const y = stride + 245 + index * 87;
    const bar = layerKey(R`\phi`, i);
    const spacing = layerKey('s', i);
    const link = layerKey('w', i);
    const clear = layerKey('a', i);
    const halfAngle = R`\frac{\pi\mathrm{rad}}{${layerKey('n', i)}}`;
    text(76, y - 25, 'L' + i + ' · Longitudinal bar clearance, link diameter and vertical spacing');
    math(76, y, clear, '2' + layerKey('r', i) + R`\sin\left(${halfAngle}\right)-${bar}`, 'mm');
    check(76, y + 32, clear + R`\ge ` + call('max', '20' + mm, bar, 'd_{g}+5' + mm));
    check(354, y + 32, link + R`\ge w_{min}`);
    check(510, y, spacing + R`\ge ` + link);
    check(510, y + 32, spacing + R`\le s_{max}`);
  });
}

export function configureLinkWorksheet(document, values) {
  const shapes = Object.fromEntries(document.shapes.map(shape => [shape.id, shape]));
  // The pinned worksheet keeps both bending and shear models. Replace the
  // fixed two-ring input, geometry and bar definitions with the layer model.
  const remove = new Set([
    'v','w','x','y','z','10','11','12','13','14','15','16','17','18','19','1a','1b','1c','1d','1e','1f','1g',
    '2a','2b','2c','2d','2e','2f','2g','2h','2i','2j','2k','2l','2q','2r','2s','2t','2u','2v','2w','2x','2y','2z','30','31',
  ].map(id => 's_col_' + id));
  for (const shape of Object.values(shapes)) {
    const latex = shape.props.latex ?? '';
    if (latex.startsWith(R`\delta_{2}\coloneq`)) {
      remove.add(shape.id);
      const label = Object.values(shapes).find(candidate => candidate.props.html?.startsWith('Set-2 switch'));
      if (label) remove.add(label.id);
    }
  }
  const annexStart = shapes.s_col_5g.y;
  const nextAnnex = Math.min(...Object.values(shapes).filter(s => s.y > annexStart && s.props.annex?.kind === 'heading').map(s => s.y));
  const angle = Object.values(shapes).find(s => s.props.latex?.startsWith(R`\varphi_{t}\coloneq`));
  for (const shape of Object.values(shapes)) {
    if (shape.y > annexStart && shape.y < nextAnnex && shape !== angle) remove.add(shape.id);
  }
  for (const id of remove) delete shapes[id];
  const layers = values.layers.map((_, index) => {
    const i = index + 1;
    const r = layerKey('r', i), phi = layerKey(R`\phi`, i), n = layerKey('n', i);
    const area = R`0.25\pi${phi}^{2}`;
    const a = R`\frac{2\pi\mathrm{rad}}{${n}}` + call('seq', '0', n + '-1');
    return { i, r, phi, n, area, a };
  });
  const sumText = fn => layers.map(fn).join('+');
  function replace(key, expr, label) {
    const shape = Object.values(shapes).find(s => s.props.latex?.startsWith(key + R`\coloneq`));
    if (!shape) throw new Error('Missing worksheet definition ' + key);
    shape.props.latex = define(key, expr);
    if (label) {
      const previousId = 's_col_' + (parseInt(shape.id.slice(6), 36) - 1).toString(36);
      if (shapes[previousId]?.type === 'text') shapes[previousId].props.html = label;
    }
    return shape;
  }
  const graph = shapes.s_col_34;
  const [outline, hoop, bars] = graph.props.series;
  graph.props.series = [outline, ...layers.flatMap(({ i, r, phi, a }) => {
    const radius = R`\left(${r}+0.5${phi}+0.5w_{L${i}}\right)`;
    return [
      { ...hoop, id: 'link' + i, x: radius + R`\cos\left(\varphi_{t}\right)`, y: radius + R`\sin\left(\varphi_{t}\right)` },
      { ...bars, id: 'bar' + i, label: 'L' + i, x: r + R`\cos\left(${a}\right)`, y: r + R`\sin\left(${a}\right)`, r: '0.5' + phi },
    ];
  })];
  const stack = expressions => expressions.length === 1 ? expressions[0] : call('stack', ...expressions);
  replace('A_{st}', sumText(({ n, area }) => n + R`\cdot ` + area));
  replace('p_{l1}', stack(layers.map(({ r, a }) => r + R`\cos\left(${a}-\theta_{M}\right)`)), 'Projected bar coordinates, all layers');
  replace('p_{l2}', stack(layers.map(({ n, area }) =>
    R`\left(1+0\cdot${call('seq', '0', n + '-1')}\right)\cdot${area}`)), 'Bar areas in the same layer order');
  replace(R`d_{\theta}`, 'R-' + call('min', 'p_{l1}'));
  replace(R`N_{R}\left(c\right)`,
    R`\mathrm{sum}\left(\sigma_{c}\left(\varepsilon\left(c,x_{c}\right)\right)A_{c}\right)+\mathrm{sum}\left(\sigma_{b}\left(\varepsilon\left(c,p_{l1}\right)\right)p_{l2}\right)`);
  replace(R`M_{R}\left(c\right)`,
    R`\mathrm{sum}\left(\sigma_{c}\left(\varepsilon\left(c,x_{c}\right)\right)A_{c}x_{c}\right)+\mathrm{sum}\left(\sigma_{b}\left(\varepsilon\left(c,p_{l1}\right)\right)p_{l2}p_{l1}\right)`);
  replace('d', R`R+\frac{2}{\pi}\frac{${sumText(({ n, area, r }) => n + R`\cdot ` + area + R`\cdot ` + r)}}{A_{st}}`);
  replace(R`\rho_{w}`, R`\frac{2\cdot0.25\pi w_{L1}^{2}}{s_{L1}b_{w}}`, 'Shear reinforcement ratio (8.43), outer closed link');
  for (const shape of Object.values(shapes)) {
    if (!shape.props.html) continue;
    shape.props.html = shape.props.html.replace(/Concrete strips \(xc, Ac\) plus bars of set 1 and, when δ2 = 1, set 2:/,
      'Concrete strips (xc, Ac) plus longitudinal bars from all layers:')
      .replace(/Each spiral crosses the shear plane twice: Asw = 2·Aw\./, 'The outer closed link contributes two legs: Asw = 2·Aw.')
      .replace(/spirals/gi, 'closed links').replace(/spiral/gi, 'closed link');
  }
  layerPage(document, shapes, values);
  document.shapes = Object.values(shapes);
  const checks = linkChecks(values, linkGeometry(values));
  return checks;
}
