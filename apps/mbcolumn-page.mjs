import { registerPage } from './tool-page.mjs';
import { buildColumnReport } from '../tools/mbcolumn-lite/src/report.mjs';

import { createColumnSolver } from '../tools/mbcolumn-lite/src/solver-client.mjs';
import { renderShearResults, shearColumns, shearReportRows } from '../tools/mbcolumn-lite/src/shear-view.mjs';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './mbcolumn-workspace.css';

window.mcalcColumnSolver = createColumnSolver();
window.mcalcColumnShear = { render: renderShearResults, columns: shearColumns, rows: shearReportRows };

document.getElementById('calculateBtn').disabled = false;
const page = window.mcalcColumnAdapter;
registerPage('mbcolumn-lite', {
  snapshot: () => page.snapshot(),
  restore: inputs => page.restore(inputs),
  report: () => buildColumnReport(page.reportData()),
});
