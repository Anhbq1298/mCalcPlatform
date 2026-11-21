import { solveColumn } from './solver.mjs';
import { buildReport } from './report.mjs';
self.onmessage = ({ data: { id, values } }) => {
  try {
    const result = solveColumn(values);
    self.postMessage({ id, result, document: buildReport(values, result) });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
