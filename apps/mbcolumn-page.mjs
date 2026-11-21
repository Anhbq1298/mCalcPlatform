import { registerPage } from './tool-page.mjs';
import { buildColumnReport } from '../tools/mbcolumn-lite/src/report.mjs';

const page = window.mcalcColumnAdapter;
registerPage('mbcolumn-lite', {
  snapshot: () => page.snapshot(),
  restore: inputs => page.restore(inputs),
  report: () => buildColumnReport(page.reportData()),
});
