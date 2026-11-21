import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function stageSharedSources(root, upstream) {
  const data = join(root, 'platform/assets/sections/steel');
  for (const file of ['catalogue.json', 'UK-LICENSE.txt', 'EUROPE-LICENSE.txt', 'W-LICENSE.txt']) {
    await cp(join(upstream, 'src/engineering/steel/data', file), join(data, file));
  }
  const sections = JSON.parse(await readFile(join(data, 'catalogue.json'), 'utf8'));
  const ids = new Set(sections.map(section => section.id));
  if (ids.size !== sections.length || !ids.has(1211)
    || !sections.every(section => Number.isSafeInteger(section.id) && Object.values(section.values).every(Number.isFinite))) {
    throw new Error('The upstream steel catalogue has invalid or duplicate sections.');
  }

  const steel = join(root, 'src/engineering/steel');
  await writeFile(join(steel, 'sections.ts'),
    "export * from '../../../platform/packages/assets/src/index';\n"
      + "export const SECTION_DEF = '\\\\mathrm{Section}\\\\coloneq';\n");

  const tools = join(root, 'src/tools');
  const composite = join(tools, 'composite');
  const formatPath = join(composite, 'format.ts');
  const format = await readFile(formatPath, 'utf8');
  const palette = format.split('\n').find(line => line.startsWith('export const C ='));
  if (!palette) throw new Error('The composite palette moved upstream.');
  const ui = '../../../platform/packages/ui-kit';
  await writeFile(formatPath, palette + "\nexport { fmt, subParts } from '" + ui + "/src/index';\n");
  await writeFile(join(composite, 'rich.tsx'), "export { Rich, SvgRich } from '" + ui + "/src/index';\n");
  await cp(join(composite, 'composite.css'), join(root, 'platform/packages/ui-kit/drawing.css'));
  await writeFile(join(composite, 'composite.css'), "@import '" + ui + "/drawing.css';\n");
  await updateSteelImports(join(tools, 'steel'), ui);
}

async function updateSteelImports(root, ui) {
  for (const item of await readdir(root, { withFileTypes: true })) {
    const file = join(root, item.name);
    if (item.isDirectory()) { await updateSteelImports(file, '../' + ui); continue; }
    if (!/\.tsx?$/.test(item.name)) continue;
    const source = await readFile(file, 'utf8');
    const next = source
      .replace(/(['"])\.\.\/composite\/format\1/g, "'" + ui + "/src/index'")
      .replace(/(['"])\.\.\/composite\/rich\1/g, "'" + ui + "/src/index'")
      .replace(/(['"])\.\.\/composite\/composite\.css\1/g, "'" + ui + "/drawing.css'");
    if (source !== next) await writeFile(file, next);
  }
}
