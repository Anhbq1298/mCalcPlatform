import { createDesign, importDesignFile } from '../../packages/design-sdk/src/index.mjs';

export async function saveImportedDesign(file, tools, db, { copy = false } = {}) {
  const design = await importDesignFile(file, tools);
  if (copy || await db.getDesign(design.id)) design.id = crypto.randomUUID();
  await db.saveDesign(design);
  return design;
}

async function saveWorksheet(file, tool, db) {
  const { parseDocument } = await import('../../../src/documents/DocumentSerializer.ts');
  const raw = JSON.parse(await file.text());
  const worksheet = parseDocument(raw);
  const name = worksheet.title.trim() || file.name.replace(/\.mccv$/i, '').slice(0, 200).trim() || tool.name;
  const design = createDesign(tool, name, { ...raw, ...worksheet, id: crypto.randomUUID() });
  await db.saveDesign(design);
  return design;
}

export async function openToolFile(file, tool, db) {
  if (!file.name.toLowerCase().endsWith('.' + tool.fileExtension)) {
    throw new Error('Choose a .' + tool.fileExtension + ' file for ' + (tool.title ?? tool.name) + '.');
  }
  const design = tool.id === 'calccanvas'
    ? await saveWorksheet(file, tool, db)
    : await saveImportedDesign(file, [tool], db, { copy: true });
  const url = new URL(tool.entry, document.baseURI);
  url.searchParams.set('design', design.id);
  window.location.assign(url);
}
