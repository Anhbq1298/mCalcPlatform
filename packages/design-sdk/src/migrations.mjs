// One adapter migration advances exactly one manifest schema version.
export async function migrateToolInputs(design, tool, adapter) {
  if (design.schema > tool.schema) throw new Error('This design was created in a newer version. Export it from this read-only view.');
  let inputs = structuredClone(design.inputs);
  for (let schema = design.schema; schema < tool.schema; schema++) {
    if (!adapter.migrate) throw new Error('This tool cannot migrate the saved design schema.');
    const next = await adapter.migrate(structuredClone(inputs), schema);
    if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('Invalid tool migration result.');
    inputs = { ...inputs, ...next };
  }
  return inputs;
}
