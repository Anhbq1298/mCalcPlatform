export const toolCategories = [
  ['all', 'All'],
  ['concrete', 'Concrete'],
  ['steel', 'Steel'],
  ['composite', 'Composite'],
  ['general', 'General'],
];

const categoryLabels = new Map(toolCategories);

export function filterTools(tools, { category = 'all', query = '' } = {}) {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return tools.filter(tool => {
    if (category !== 'all' && tool.category !== category) return false;
    const codes = tool.designCodes?.flatMap(({ id, label }) => [id, label]) ?? [];
    const fields = [
      tool.title, tool.name, tool.id, categoryLabels.get(tool.category),
      ...codes, ...(tool.keywords ?? []),
    ].join(' ').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
    return terms.every(term => fields.includes(term));
  });
}

export function emptyToolMessage(categoryHasTools) {
  return categoryHasTools ? 'No modules found' : 'No design modules available in this category yet.';
}
