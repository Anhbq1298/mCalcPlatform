import { parseDesign } from './documents.mjs';
import { hashReport } from './package-file.mjs';

// Single-design files: inputs plus report snapshot. Each tool keeps its own extension; .mcalc stays the project package.
// .mccv is an export-only report and is not a design file.
const FORMAT = 'mcalc-design';
const VERSION = 1;
const decoder = new TextDecoder('utf-8', { fatal: true });
const DESIGN_EXTENSIONS = new Set(['mrcol', 'mcb', 'mccol', 'msbc', 'mpsh', 'mcbo']);

export function isDesignExtension(extension) {
  return DESIGN_EXTENSIONS.has(extension);
}

export function designFileName(design, tool) {
  const base = design.meta.name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'design';
  return `${base}.${tool.fileExtension}`;
}

export async function exportDesignFile(design, tool) {
  const extension = tool.fileExtension;
  if (!isDesignExtension(extension)) throw new Error(`${tool.name} exports reports only.`);
  const { report, reportHash, ...body } = parseDesign(design);
  const doc = report
    ? { ...body, report, reportHash: reportHash ?? await hashReport(report) }
    : body;
  const text = JSON.stringify({ format: FORMAT, version: VERSION, extension, ...doc }, null, 2);
  return new Blob([text], { type: 'application/json' });
}

export async function importDesignFile(file, tools) {
  const extension = String(file.name ?? '').split('.').pop().toLowerCase();
  if (!isDesignExtension(extension)) throw new Error('Unsupported design file.');
  let data;
  try {
    data = JSON.parse(decoder.decode(await file.arrayBuffer()));
  } catch {
    throw new Error('Invalid design file.');
  }
  if (data?.format !== FORMAT || data.version !== VERSION || data.extension !== extension) {
    throw new Error('Invalid design file.');
  }
  const tool = tools.find(item => item.id === data.tool);
  if (!tool || tool.fileExtension !== extension) throw new Error('Design file does not match an installed tool.');
  const body = { ...data };
  delete body.format;
  delete body.version;
  delete body.extension;
  try {
    return parseDesign(body);
  } catch {
    throw new Error('Invalid design file.');
  }
}
