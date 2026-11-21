// Flowing A4 page layout for a generated Canvas worksheet (text, math, image and table shapes).
// Page geometry is passed in (A4 height and gap from the Canvas page model) so the builder stays pure.

const MARGIN_X = 76;
const CONTENT_W = 640;
const TOP = 70;
const BOTTOM = 90;

export const R = String.raw;
export const define = (key, expr) => key + R`\coloneq ` + expr;
export const unit = {
  mm: R`\,\mathrm{mm}`, MPa: R`\,\mathrm{MPa}`, kN: R`\,\mathrm{kN}`, kNm: R`\,\mathrm{kN}\cdot\mathrm{m}`, mm2: R`\,\mathrm{mm}^2`,
};
export const num = (value, digits = 6) => {
  const text = Number(value.toFixed(digits)).toString();
  return text.startsWith('-') ? R`\left(${text}\right)` : text;
};

export function createDocument({ pageHeight, pageGap, title }) {
  const shapes = [];
  let page = 0;
  let y = TOP;
  let counter = 0;
  const stride = pageHeight + pageGap;
  const id = () => 'ps_' + (counter++).toString(36);
  const ensure = height => {
    if (y + height > pageHeight - BOTTOM) { page += 1; y = TOP; }
    return page * stride + y;
  };
  const textShape = (x, top, html, fontSize, extra = {}) => {
    const lines = Math.max(1, Math.ceil((html.replace(/<[^>]+>/g, '').length * fontSize * 0.5) / (extra.w ?? CONTENT_W)));
    const h = Math.ceil(lines * fontSize * 1.45) + 4;
    shapes.push({ id: id(), type: 'text', x, y: top, props: { w: CONTENT_W, h, html, fontFamily: 'Inter', fontSize, color: '#334155', align: 'left', ...extra } });
    return h;
  };
  const mathProps = (latex, displayUnit, displayMode, precision) => ({
    w: 260, h: 27, baseline: 18, latex, displayMode, displayUnit, precision, autoSize: true, fontSize: 15, color: '#0f172a',
  });

  const api = {
    shapes,
    heading(text, level = 2) {
      const size = level === 1 ? 20 : level === 2 ? 16 : 14;
      if (level === 1 && y > TOP) { page += 1; y = TOP; }
      const top = ensure(size * 2.2);
      y += textShape(MARGIN_X, top, text, size, { heading: level, color: level === 1 ? '#1e3a5f' : '#0f172a' }) + 8;
    },
    text(html, fontSize = 13) {
      const estimate = Math.ceil((html.length * fontSize * 0.5) / CONTENT_W) * fontSize * 1.45 + 6;
      const top = ensure(estimate);
      y += textShape(MARGIN_X, top, html, fontSize) + 4;
    },
    // Label on the left, math region on the right.
    math(label, latex, { displayUnit = '', mode = 'formulaResult', precision = 3 } = {}) {
      const top = ensure(34);
      if (label) shapes.push({ id: id(), type: 'text', x: MARGIN_X, y: top + 4, props: { w: 250, h: 22, html: label, fontFamily: 'Inter', fontSize: 12, color: '#475569', align: 'left' } });
      shapes.push({ id: id(), type: 'math', x: MARGIN_X + 260, y: top, props: mathProps(latex, displayUnit, mode, precision) });
      y += 34;
      return shapes.at(-1);
    },
    image(svg, width, height) {
      const top = ensure(height + 10);
      const src = 'data:image/svg+xml;base64,' + toBase64(svg);
      shapes.push({ id: id(), type: 'image', x: MARGIN_X, y: top, props: { w: width, h: height, src } });
      y += height + 12;
    },
    table(rows, columnWidths) {
      const height = rows.length * 30 + 4;
      const top = ensure(Math.min(height, pageHeight - TOP - BOTTOM));
      shapes.push({
        id: id(), type: 'table', x: MARGIN_X, y: top,
        props: { w: columnWidths.reduce((a, b) => a + b, 0), h: rows.length * 30, rows: rows.length, columns: columnWidths.length, cells: rows.map(row => row.map(value => ({ value: String(value) }))), columnWidths, headerRow: true },
      });
      y += height + 10;
    },
    gap(amount = 10) { y += amount; },
    finish() {
      const now = new Date(0).toISOString();
      return {
        format: 'calccanvas', id: 'doc_punching_shear', version: 3, title,
        metadata: { project: 'Project name', calculationReference: 'CALC-PS-01', preparedBy: '', checkedBy: '', revision: 'A' },
        settings: { unitSystem: 'SI', precision: 2, canvasMode: 'page', pageOrientation: 'portrait', showHeaderFooter: true, textFont: 'Inter', baselineSnap: 'minor', snapToGrid: false, optimizePrintLayout: true, pages: page + 1 },
        inputResult: { title: 'Batch calculation', inputs: [], outputs: [], rows: [] },
        shapes, createdAt: now, updatedAt: now,
      };
    },
  };
  return api;
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
