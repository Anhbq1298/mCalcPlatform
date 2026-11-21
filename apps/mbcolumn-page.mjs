import { registerPage } from './tool-page.mjs';
import { renderRectangularSummary } from '../tools/mbcolumn-lite/src/check-summary.mjs';
import './column-summary.css';
import { buildColumnReport } from '../tools/mbcolumn-lite/src/report.mjs';

import { generateLinkLayout, resolveShearLinks, restoreShearSettings } from '../tools/mbcolumn-lite/src/link-layout.mjs';
import { drawGeneratedLinks, drawSectionDimensions } from '../tools/mbcolumn-lite/src/link-drawing.mjs';
import { createColumnSolver } from '../tools/mbcolumn-lite/src/solver-client.mjs';
import { renderShearResults, shearColumns, shearReportRows } from '../tools/mbcolumn-lite/src/shear-view.mjs';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './mbcolumn-workspace.css';

window.mcalcColumnSummary = renderRectangularSummary;
window.mcalcColumnSolver = createColumnSolver();
window.mcalcColumnShear = { render: renderShearResults, columns: shearColumns, rows: shearReportRows };

window.mcalcLinkLayout = {
  generate: generateLinkLayout,
  resolve: resolveShearLinks,
  restore: restoreShearSettings,
  draw: drawGeneratedLinks,
  dimensions: drawSectionDimensions,
};
window.dispatchEvent(new Event('mcalc-column-drawing-ready'));

document.getElementById('calculateBtn').disabled = false;
const page = window.mcalcColumnAdapter;
registerPage('mbcolumn-lite', {
  snapshot: () => page.snapshot(),
  restore: inputs => page.restore(inputs),
  report: () => buildColumnReport(page.reportData()),
});
