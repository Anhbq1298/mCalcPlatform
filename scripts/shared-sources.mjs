import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function stageSharedSources(root, upstream) {
  const data = join(root, 'platform/assets/sections/steel');
  const sourceData = join(upstream, 'src/engineering/steel/data');
  await cp(join(sourceData, 'catalogue.json'), join(data, 'catalogue.json'));
  const notices = join(root, 'public/notices/steel');
  await mkdir(notices, { recursive: true });
  for (const file of ['UK-LICENSE.txt', 'EUROPE-LICENSE.txt', 'W-LICENSE.txt']) {
    await cp(join(sourceData, file), join(notices, file));
  }
  await cp(join(data, 'SOURCES.md'), join(notices, 'SOURCES.md'));
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
  const ui = '../../../platform/packages/ui-kit';
  await writeFile(join(composite, 'format.ts'), "export { C, fmt, subParts } from '" + ui + "/src/index';\n");
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
