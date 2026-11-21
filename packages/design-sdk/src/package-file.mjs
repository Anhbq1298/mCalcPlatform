import { parseDesign, validateProject } from './documents.mjs';
import { decodeZip, encodeZip } from './zip.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const bytes = value => encoder.encode(JSON.stringify(value));

export async function hashReport(report) {
  const hash = await crypto.subtle.digest('SHA-256', bytes(report));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function exportPackage({ designs, project }) {
  const entries = new Map();
  const items = [];
  const ids = new Set();
  for (const item of designs) {
    const { inputs, report, ...doc } = parseDesign(item);
    if (ids.has(doc.id)) throw new Error('Duplicate design in package.');
    ids.add(doc.id);
    entries.set(`items/${doc.id}/inputs.json`, bytes(inputs));
    if (report) {
      entries.set(`items/${doc.id}/report.mccv`, bytes(report));
      doc.reportHash ??= await hashReport(report);
    }
    items.push(doc);
  }
  if (!project && items.length !== 1) throw new Error('A design package requires one design.');
  if (project) checkReferences(validateProject(project), ids);
  entries.set('manifest.json', bytes({ format: 'mcalc', version: 1, items, ...(project ? { project } : {}) }));
  return encodeZip(new Map([['manifest.json', entries.get('manifest.json')], ...[...entries].filter(([file]) => file !== 'manifest.json')]));
}

function checkReferences(project, ids) {
  if (project.folders.flatMap(folder => folder.designs).some(id => !ids.has(id))) {
    throw new Error('Project package is missing a referenced design.');
  }
}

export async function importPackage(blob) {
  const entries = await decodeZip(blob);
  const read = path => {
    const data = entries.get(path);
    if (!data) throw new Error(`Package is missing ${path}.`);
    return JSON.parse(decoder.decode(data));
  };
  const manifest = read('manifest.json');
  if (manifest?.format !== 'mcalc' || manifest.version !== 1 || !Array.isArray(manifest.items)
    || (!manifest.project && manifest.items.length !== 1)) throw new Error('Unsupported mCalc package.');
  const ids = new Set();
  const designs = manifest.items.map(item => {
    const id = item?.id;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id) || ids.has(id)) throw new Error('Invalid package design ID.');
    ids.add(id);
    const path = `items/${id}/report.mccv`;
    return parseDesign({ ...item, inputs: read(`items/${id}/inputs.json`),
      report: entries.has(path) ? read(path) : undefined });
  });
  const project = manifest.project ? validateProject(manifest.project) : undefined;
  if (project) checkReferences(project, ids);
  return { designs, project };
}
