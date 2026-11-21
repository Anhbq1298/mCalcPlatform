const manifests = import.meta.glob('../tools/*/tool.json', { eager: true, import: 'default' });
export const tools = Object.values(manifests);
export const findTool = id => tools.find(tool => tool.id === id);
