import { A4, PAGE_GAP } from '../../../../src/export/pageGeometry.ts';

const R = String.raw;
const asReportValue = value => Number.isFinite(value) ? Number(value.toPrecision(8)).toString() : 'Unavailable';
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function createReport(template, input, section, result) {
  const document = JSON.parse(template);
  const math = document.shapes.find(shape => shape.id === 's_col_29').props;
  const interaction = document.shapes.find(shape => shape.id === 's_col_41').props;
  const shapes = [];
  const stride = A4.h + PAGE_GAP;
  let page = 0;
  let y = 75;
  function add(type, props) {
    if (y + props.h > A4.h - 55) {
      page++;
      y = 75;
    }
    shapes.push({ id: 'circular_report_' + shapes.length, type, x: 74, y: y + page * stride, props });
    y += props.h + 10;
  }
  const text = (content, heading = false) => add('text', {
    w: 630, h: heading ? 32 : content.length > 92 ? 43 : 22, html: escape(content),
    fontFamily: 'Inter', fontSize: heading ? 18 : 14, color: '#334155', align: 'left',
  });
  const define = (key, value, unit) => add('math', { ...math, w: 230, h: 30,
    latex: key + R`\coloneq ` + asReportValue(value) + unit, displayMode: 'formulaResult', displayUnit: '', precision: 2 });

  text('Circular RC Column Check', true);
  text('Section resistance snapshot for the saved actions. Recalculate in the column tool after changing inputs.');
  text('Section material model: pinned Canvas assumptions. Confinement enhancement is disabled.');
  text('Detailing and slenderness screen: EN 1992-1-1:2004 recommended values. National Annex unverified.');
  define('D', input.diameter, R`\,\mathrm{mm}`);
  define('f_{ck}', input.concrete, R`\,\mathrm{MPa}`);
  define('f_{yk}', input.steel, R`\,\mathrm{MPa}`);
  define('N_{Ed}', input.axial, R`\,\mathrm{kN}`);
  define('M_{Ed.x}', input.mx, R`\,\mathrm{kN}\cdot\mathrm{m}`);
  define('M_{Ed.y}', input.my, R`\,\mathrm{kN}\cdot\mathrm{m}`);
  define('V_{Ed}', input.shear, R`\,\mathrm{kN}`);
  text(input.transverse === 'links' ? 'Circular Stirrups (Closed Links)' : 'Continuous Spiral (Helix)', true);
  for (const [index, ring] of section.rings.entries()) {
    text('L' + (index + 1) + ' · ' + ring.count + 'Ø' + ring.bar + ' · Bar radius ' +
      asReportValue(ring.barRadius) + ' mm · Offset ' + ring.offset + '° · Ø' + ring.link + ' @ ' + ring.spacing + ' mm');
  }
  text('Design summary', true);
  for (const row of result.rows) {
    const ratio = row.ratio === Infinity ? ' · outside interaction envelope'
      : Number.isFinite(row.ratio) ? ' · UR ' + row.ratio.toFixed(3) : '';
    text(row.label + ' · ' + (row.statusLabel ?? row.status.toUpperCase()) + ratio + (row.detail ? ' · ' + row.detail : ''));
  }
  if (result.curve.length) {
    const { series: [curve, , , , capacity, demand], ...presentation } = interaction;
    const vector = (index, unit) => R`\mathrm{stack}\left(` + result.curve.map(point => point[index].toFixed(6)).join(',')
      + R`\right)\,` + unit;
    add('graph', { ...presentation, w: 520, h: 310, xLabel: 'M (kNm)', yLabel: 'P (kN)', background: '#ffffff',
      title: 'P–M at demand direction', series: [
        { ...curve, x: vector(0, R`\mathrm{kN}\cdot\mathrm{m}`), y: vector(1, R`\mathrm{kN}`) },
        { ...capacity, label: 'Capacity at NEd', x: result.capacity.toFixed(6) + R`\,\mathrm{kN}\cdot\mathrm{m}`, y: 'N_{Ed}' },
        { ...demand, x: R`\sqrt{M_{Ed.x}^2+M_{Ed.y}^2}` },
      ] });
  }
  document.title = 'Circular RC Column Check';
  document.shapes = shapes;
  document.settings.pages = page + 1;
  return document;
}
