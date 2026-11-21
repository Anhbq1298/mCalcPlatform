import { shearColumns } from './shear-view.mjs';

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export function buildColumnReport(source) {
  const { data, images, headers } = source;
  const shapes = [];
  const pageHeight = 1123;
  const pageGap = 48;
  const left = 76;
  const width = 642;
  const top = 64;
  const bottom = pageHeight - 66;
  let page = 0, y = top;
  const nextPage = () => { page++; y = top; };
  const space = height => { if (y + height > bottom) nextPage(); };
  const add = (type, props) => {
    space(props.h);
    shapes.push({ id: 'column-' + (shapes.length + 1), type, x: left, y: page * (pageHeight + pageGap) + y, props });
    y += props.h + 10;
  };

  function text(value, size = 14, heading) {
    add('text', { w: width, h: Math.max(25, 20 * Math.ceil(String(value).length / 88)),
      html: escapeHtml(value), fontFamily: 'Inter', color: '#0f172a', fontSize: size, align: 'left', ...(heading ? { heading } : {}) });
  }
  function section(title, rows) {
    space(72);
    text(title, 17, 2);
    for (const [name, value] of rows) text(name + ' — ' + value);
  }
  function table(title, columns, rows, ratios) {
    if (!rows?.length) return;
    let offset = 0;
    while (offset < rows.length) {
      space(119);
      text(offset ? title + ' (continued)' : title, 17, 2);
      const capacity = Math.max(1, Math.floor((bottom - y) / 31) - 1);
      const batch = rows.slice(offset, offset + capacity);
      const cells = [columns, ...batch].map(row => row.map(value => ({ value: String(value) })));
      add('table', { w: width, h: cells.length * 31, rows: cells.length, columns: columns.length,
        cells, columnWidths: ratios.map(ratio => Math.floor(width * ratio)), headerRow: true });
      offset += batch.length;
    }
  }
  function figure(title, image) {
    if (!image?.jpg || image.w < 1 || image.h < 1) return;
    const factor = Math.min(width / image.w, 420 / image.h);
    const h = Math.floor(image.h * factor), w = Math.floor(image.w * factor);
    space(h + 60);
    text(title, 17, 2);
    add('image', { w, h, src: image.jpg });
  }

  text('mConcreteRecCol — Column check', 25, 1);
  if (data.gov) text('Governing case ' + data.gov.name + ' · D/C ' + Number(data.gov.ratio).toFixed(3) + ' · ' + (data.gov.pass ? 'PASS' : 'FAIL'));
  section('Design basis', data.basis);
  section('Materials', data.materials);
  section('Section', data.geometry);
  figure('Section and reinforcement', images.section);
  table('Reinforcement layout', headers.bars, data.bars, [.08,.2,.2,.23,.29]);
  table('Slenderness', headers.slenderness, data.slRows, [.18,.08,.1,.08,.1,.19,.135,.135]);
  figure('Moment diagrams', images.sl);
  table('Load cases and capacity', headers.cases, data.cases, [.17,.105,.115,.115,.07,.09,.075,.13,.13]);
  text(data.range);
  if (data.shearRows?.length || data.shearError) {
    section('Directional shear design basis', [['Method', data.shearBasis], ...(data.shearError ? [['Status', data.shearError]] : [])]);
    table('Directional shear results', shearColumns, data.shearRows, [.13,.055,.09,.08,.13,.125,.14,.105,.145]);
  }
  figure('Biaxial interaction surface', images.d3);
  figure('Axial force–moment interaction', images.pm);
  figure('Moment–moment interaction', images.mm);

  const date = new Date().toISOString();
  return {
    id: crypto.randomUUID(), title: 'mConcreteRecCol — Column check', version: 3, shapes,
    createdAt: date, updatedAt: date, metadata: {},
    settings: { unitSystem: 'SI', precision: 3, canvasMode: 'page', paper: 'A4', pageOrientation: 'portrait',
      showHeaderFooter: true, textFont: 'Inter', pages: page + 1, snapToGrid: false, optimizePrintLayout: false },
    inputResult: { title: 'Load cases', inputs: [], outputs: [], rows: [] },
  };
}
