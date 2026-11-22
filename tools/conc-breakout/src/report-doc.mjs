// Flowing A4 page layout for a generated Canvas worksheet (text, math, image and table shapes).
// Page geometry is passed in from the Canvas page model so the builder stays pure.
const MARGIN_X = 76;
const CONTENT_W = 640;
const TOP = 70;
const BOTTOM = 90;

export const R = String.raw;
export const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function createDocument({ pageHeight, pageGap, title }) {
  const shapes = [];
  let page = 0;
  let y = TOP;
  let counter = 0;
  const stride = pageHeight + pageGap;
  const id = () => 'cb_' + (counter++).toString(36);
  const ensure = height => {
    if (y + height > pageHeight - BOTTOM) { page += 1; y = TOP; }
    return page * stride + y;
  };
  const textHeight = (html, fontSize) => Math.max(1, Math.ceil(html.replace(/<[^>]+>/g, '').length * fontSize * 0.5 / CONTENT_W)) * fontSize * 1.45 + 4;
  return {
    heading(text, level = 2) {
      const size = level === 1 ? 20 : 15;
      const top = ensure(size * 2.2);
      shapes.push({ id: id(), type: 'text', x: MARGIN_X, y: top, props: { w: CONTENT_W, h: size * 1.6, html: escape(text), fontFamily: 'Inter', fontSize: size, color: level === 1 ? '#1e3a5f' : '#0f172a', align: 'left', heading: level } });
      y += size * 1.6 + 8;
    },
    text(html, fontSize = 12) {
      const h = Math.ceil(textHeight(html, fontSize));
      const top = ensure(h);
      shapes.push({ id: id(), type: 'text', x: MARGIN_X, y: top, props: { w: CONTENT_W, h, html, fontFamily: 'Inter', fontSize, color: '#334155', align: 'left' } });
      y += h + 4;
    },
    value(label, latex, displayUnit = '') {
      const top = ensure(32);
      shapes.push({ id: id(), type: 'text', x: MARGIN_X, y: top + 4, props: { w: 300, h: 22, html: label, fontFamily: 'Inter', fontSize: 12, color: '#475569', align: 'left' } });
      shapes.push({ id: id(), type: 'math', x: MARGIN_X + 310, y: top, props: { w: 300, h: 27, baseline: 18, latex, displayMode: 'formulaResult', displayUnit, precision: 3, autoSize: true, fontSize: 15, color: '#0f172a' } });
      y += 32;
    },
    image(svg, width, height) {
      const top = ensure(height + 10);
      shapes.push({ id: id(), type: 'image', x: MARGIN_X, y: top, props: { w: width, h: height, src: 'data:image/svg+xml;base64,' + toBase64(svg) } });
      y += height + 12;
    },
    table(rows, columnWidths) {
      for (let start = 1; start < rows.length; start += 20) {
        const chunk = [rows[0], ...rows.slice(start, start + 20)];
        const top = ensure(chunk.length * 30 + 4);
        shapes.push({ id: id(), type: 'table', x: MARGIN_X, y: top, props: { w: columnWidths.reduce((a, b) => a + b, 0), h: chunk.length * 30, rows: chunk.length, columns: columnWidths.length, cells: chunk.map(row => row.map(value => ({ value: String(value) }))), columnWidths, headerRow: true } });
        y += chunk.length * 30 + 14;
      }
    },
    finish() {
      const now = new Date(0).toISOString();
      return {
        format: 'calccanvas', id: 'doc_conc_breakout', version: 3, title,
        metadata: { project: 'Project name', calculationReference: 'CALC-CB-01', preparedBy: '', checkedBy: '', revision: 'A' },
        settings: { unitSystem: 'SI', precision: 2, canvasMode: 'page', pageOrientation: 'portrait', showHeaderFooter: true, textFont: 'Inter', baselineSnap: 'minor', snapToGrid: false, optimizePrintLayout: true, pages: page + 1 },
        inputResult: { title: 'Batch calculation', inputs: [], outputs: [], rows: [] },
        shapes, createdAt: now, updatedAt: now,
      };
    },
  };
}
