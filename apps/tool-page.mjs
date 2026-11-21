import { findTool } from './registry.mjs';
import { mountToolShell } from '../packages/design-sdk/src/index.mjs';
import '../packages/ui-kit/shell.css';

let active;

export function registerPage(id, adapter, reportOwner) {
  if (!active) {
    const tool = findTool(id);
    if (!tool) throw new Error('Missing tool registration: ' + id);
    const home = new URL('../'.repeat(tool.entry.split('/').length - 1), document.baseURI);
    active = { adapter };
    mountToolShell({ tool, getAdapter: () => active?.adapter, home, reportUrl: new URL('calc/', home), reportOwner });
  } else active.adapter = adapter;
}

export function resolveReport(start, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The report did not finish. Try again after the calculation completes.')), timeout);
    start(report => {
      clearTimeout(timer);
      if (report && typeof report === 'object' && !Array.isArray(report)) resolve(report);
      else reject(new Error('The tool did not return a worksheet report.'));
    });
  });
}
