const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit) => typeof value === 'string' && value.length <= limit;

export const projectFolders = [
  ['design-basis', '00 Design basis'], ['loadings', '01 Loadings'], ['geotechnical', '02 Geotechnical'],
  ['foundations', '03 Foundations'], ['columns', '04 Columns'], ['beams', '05 Beams'],
  ['floors', '06 Floors'], ['connections', '07 Connections'], ['attachments', '99 Attachments'],
];

export function parseDesign(value) {
  if (!record(value) || !text(value.id, 80) || !identifier.test(value.id)
    || !text(value.tool, 80) || !identifier.test(value.tool) || !text(value.toolVersion, 80)
    || !Number.isSafeInteger(value.schema) || value.schema < 1 || !record(value.inputs)
    || !record(value.meta) || !text(value.meta.name, 200) || !value.meta.name.trim()
    || !text(value.meta.mark, 100) || !text(value.meta.label, 100) || !text(value.meta.notes, 4000)
    || (value.report !== undefined && !record(value.report))
    || (value.reportHash !== undefined && !/^[a-f0-9]{64}$/.test(value.reportHash))) {
    throw new Error('Invalid design document.');
  }
  return value;
}

export function createDesign(tool, name, inputs) {
  return parseDesign({
    id: crypto.randomUUID(), tool: tool.id, toolVersion: tool.version, schema: tool.schema,
    inputs, meta: { name, mark: '', notes: '', label: tool.labels[0] },
  });
}

export function duplicateDesign(design) {
  return { ...structuredClone(design), id: crypto.randomUUID(),
    meta: { ...design.meta, name: design.meta.name.slice(0, 193) + ' (copy)' } };
}

export function createProject(name) {
  return validateProject({
    id: crypto.randomUUID(), name, settings: {}, folders: projectFolders.map(([id, name]) => ({ id, name, designs: [] })),
  });
}

export function validateProject(project) {
  if (!record(project) || !text(project.id, 80) || !identifier.test(project.id)
    || !text(project.name, 200) || !project.name.trim() || !record(project.settings)
    || !Array.isArray(project.folders) || project.folders.length > 100) throw new Error('Invalid project.');
  const folders = new Set();
  const designs = new Set();
  for (const folder of project.folders) {
    if (!record(folder) || !text(folder.id, 80) || !identifier.test(folder.id)
      || folders.has(folder.id) || !text(folder.name, 200) || !folder.name.trim()
      || !Array.isArray(folder.designs)) throw new Error('Invalid project folder.');
    folders.add(folder.id);
    for (const id of folder.designs) {
      if (!text(id, 80) || !identifier.test(id) || designs.has(id)) throw new Error('Invalid project design reference.');
      designs.add(id);
    }
  }
  return project;
}
