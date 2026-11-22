import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolCategories } from '../apps/tool-filters.mjs';
import { projectFolders } from '../packages/design-sdk/src/index.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const folders = new Set(projectFolders.map(([id]) => id));
const routes = new Set();
const categories = new Set(toolCategories.slice(1).map(([id]) => id));
let failed = false;
function check(condition, reason) {
  if (!condition) { console.error(reason); failed = true; }
}
for (const dir of await readdir(join(root, 'tools'), { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const manifest = JSON.parse(await readFile(join(root, 'tools', dir.name, 'tool.json'), 'utf8'));
  check(manifest.id === dir.name && /^[a-z][a-z0-9-]*$/.test(manifest.id), 'Invalid tool ID: ' + dir.name);
  check(manifest.apiVersion === 1 && Number.isInteger(manifest.schema) && manifest.schema > 0, 'Invalid tool API or schema: ' + dir.name);
  check(Array.isArray(manifest.labels) && manifest.labels.length && folders.has(manifest.folder), 'Invalid purpose or folder: ' + dir.name);
  check(/^(?:[a-z0-9-]+\/)+$/.test(manifest.entry) && !routes.has(manifest.entry), 'Invalid or duplicate route: ' + manifest.entry);
  routes.add(manifest.entry);
  check(categories.has(manifest.category), 'Invalid tool category: ' + dir.name);
  if (manifest.designCodes !== undefined) {
    const codes = manifest.designCodes;
    check(Array.isArray(codes) && codes.every(code =>
      typeof code?.id === 'string' && code.id.trim() && typeof code.label === 'string' && code.label.trim()) &&
      new Set(codes.map(code => code.id)).size === codes.length, 'Invalid or duplicate design code: ' + dir.name);
  }
}
async function scan(folder) {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, item.name);
    if (item.isDirectory()) { await scan(path); continue; }
    if (!/\.(?:mjs|mts|tsx?|md)$/.test(item.name)) continue;
    const source = await readFile(path, 'utf8');
    const local = relative(root, path);
    check(source.split('\n').length <= 301, 'File exceeds 300 lines: ' + local);
    for (const [, specifier] of source.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)) {
      if (!specifier.startsWith('.')) continue;
      const target = relative(root, resolve(dirname(path), specifier));
      if (local.startsWith('tools' + sep) && target.startsWith('tools' + sep)) {
        check(local.split(sep)[1] === target.split(sep)[1], 'Cross-tool import: ' + local + ' -> ' + specifier);
      }
      if (local.startsWith('packages' + sep)) {
        check(!target.startsWith('apps' + sep) && !target.startsWith('tools' + sep), 'Package imports an app or tool: ' + local);
      }
    }
  }
}
for (const name of ['apps', 'packages', 'tools', 'scripts', 'docs']) await scan(join(root, name));
if (failed) process.exitCode = 1;
else console.log('Platform source boundaries passed.');
