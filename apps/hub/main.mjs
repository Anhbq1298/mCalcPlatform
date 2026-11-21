import { createProject, createStore, duplicateDesign, exportPackage, importPackage } from '../../packages/design-sdk/src/index.mjs';
import { tools, findTool } from '../registry.mjs';
import './style.css';

const db = createStore();
const qs = id => document.getElementById(id);
const namedUrl = new URL(location.href);
const pending = namedUrl.searchParams.get('add');
const status = value => { qs('status').textContent = value; };
const el = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const link = (name, href, css) => Object.assign(el('a', name, css), { href });
const button = (name, run) => {
  const item = el('button', name);
  item.type = 'button';
  item.onclick = async () => {
    item.disabled = true;
    try { await run(); }
    catch (error) { status(error.message); }
    finally { item.disabled = false; }
  };
  return item;
};

function dialog(title, fields) {
  const panel = qs('editor'), form = panel.querySelector('form');
  qs('dialog-title').textContent = title;
  form.reset();
  panel.returnValue = 'cancel';
  form.querySelector('[data-fields]').replaceChildren(...fields.map(([name, options, value]) => {
    const label = el('label', name);
    const input = el(options ? 'select' : 'input');
    input.name = name;
    input.required = true;
    if (options) for (const [id, label] of options) input.append(Object.assign(el('option', label), { value: id }));
    else { input.maxLength = 200; input.value = value ?? ''; }
    if (options && value) input.value = value;
    label.append(input);
    return label;
  }));
  return new Promise(resolve => {
    panel.addEventListener('close', () => resolve(panel.returnValue === 'confirm' ? new FormData(form) : null), { once: true });
    panel.showModal();
  });
}

async function saveFile(name, contents) {
  const url = URL.createObjectURL(await exportPackage(contents));
  const action = link('Download', url);
  action.download = name + '.mcalc';
  action.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function designUrl(design, parameter = 'design') {
  const tool = findTool(design.tool);
  if (!tool && parameter === 'design') return;
  const url = new URL(parameter === 'report' ? 'calc/' : tool.entry, document.baseURI);
  url.searchParams.set(parameter, design.id);
  return url;
}

function renderDesign(doc, project, folder) {
  const item = el('div', undefined, 'saved');
  const info = el('div');
  const url = designUrl(doc);
  info.append(url ? link(doc.meta.name, url) : el('strong', doc.meta.name),
    el('span', ' · ' + (findTool(doc.tool)?.name ?? doc.tool), 'muted'));
  const actions = el('div', undefined, 'actions');
  if (doc.report) actions.append(link('Worksheet', designUrl(doc, 'report'), 'button'));
  if (project) actions.append(button('Move', async () => {
    const data = await dialog('Move design', [['Folder', project.folders.map(f => [f.id, f.name]), folder.id]]);
    if (!data || data.get('Folder') === folder.id) return;
    await placeDesign(project.id, doc.id, data.get('Folder'));
  }));
  else actions.append(button('Add to project', () => chooseProject(doc)), button('Duplicate', async () => {
    await db.saveDesign(duplicateDesign(doc));
    await refresh();
  }), button('Export', () => saveFile(doc.meta.name, { designs: [doc] })));
  item.append(info, actions);
  return item;
}

async function placeDesign(projectId, designId, folderId) {
  const project = await db.getProject(projectId);
  const target = project?.folders.find(f => f.id === folderId);
  if (!target) throw new Error('Project folder is unavailable.');
  for (const folder of project.folders) folder.designs = folder.designs.filter(id => id !== designId);
  target.designs.push(designId);
  await db.saveProject(project);
  status('Design added to ' + project.name + '.');
  await refresh();
}

async function chooseProject(doc) {
  let projects = await db.listProjects();
  if (!projects.length) {
    const project = await newProject();
    if (!project) return;
    projects = [project];
  }
  const data = await dialog('Add design to project', [['Project', projects.map(p => [p.id, p.name])]]);
  if (!data) return;
  const project = projects.find(p => p.id === data.get('Project'));
  const preferred = findTool(doc.tool)?.folder;
  const result = await dialog('Choose project folder', [['Folder', project.folders.map(f => [f.id, f.name]), preferred]]);
  if (result) await placeDesign(project.id, doc.id, result.get('Folder'));
}

async function newProject() {
  const data = await dialog('New project', [['Project name']]);
  if (!data) return;
  const project = createProject(String(data.get('Project name')).trim());
  await db.saveProject(project);
  await refresh();
  return project;
}

function renderProject(project, docs) {
  const details = el('details', undefined, 'project');
  details.dataset.project = project.id;
  const actions = el('div', undefined, 'actions');
  const ordered = () => project.folders.flatMap(folder => folder.designs.map(id => docs.get(id))).filter(Boolean);
  actions.append(button('Export project', () => saveFile(project.name, { designs: ordered(), project })));
  const hadReports = ordered().some(doc => doc.report);
  if (hadReports) {
    const url = new URL('package/', document.baseURI);
    url.searchParams.set('project', project.id);
    actions.append(link('Print calc package', url, 'button'));
  }
  details.append(el('summary', project.name), actions);
  for (const folder of project.folders) {
    const target = el('div', undefined, 'folder');
    target.append(el('strong', folder.name));
    for (const id of folder.designs) if (docs.has(id)) target.append(renderDesign(docs.get(id), project, folder));
    details.append(target);
  }
  return details;
}

async function refresh() {
  const [designs, projects] = await Promise.all([db.listDesigns(), db.listProjects()]);
  const byId = new Map(designs.map(doc => [doc.id, doc]));
  const expanded = new Set([...qs('project-list').querySelectorAll('details[open]')].map(node => node.dataset.project));
  qs('project-list').replaceChildren(...(projects.length ? projects.map(project => {
    const details = renderProject(project, byId);
    details.open = expanded.has(project.id) || projects.length === 1;
    return details;
  }) : [el('p', 'Create a project to group and order designs.', 'muted')]));
  qs('design-list').replaceChildren(...(designs.length ? designs.map(doc => renderDesign(doc)) : [el('p', 'Saved designs appear here.', 'muted')]));
}

for (const tool of tools) {
  const card = el('article', undefined, 'card');
  const url = new URL(tool.entry, document.baseURI);
  url.searchParams.set('new', '1');
  card.append(el('span', tool.discipline, 'discipline'), el('h3', tool.name), el('p', tool.description),
    link('New design', url, 'button'));
  qs('catalog').append(card);
}
qs('submit').href = 'mailto:buiquanganh1298@gmail.com?subject=' + encodeURIComponent('[mCalc Tool Submission] <Tool name>')
  + '&body=' + encodeURIComponent("Hi Anh,\n\nI'd like to share a design tool for mCalc Platform.\n\n"
    + "- Tool name:\n- What it checks:\n- Design code:\n- Source code:\n- Checked against:\n\n"
    + "I agree that the admin may review this tool and, if approved, adapt it and publish it on the platform for all users.\n\nThanks,\n<Name>\n<Email>");
qs('new-project').onclick = () => newProject().catch(error => status(error.message));
qs('import').onchange = async event => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    await db.importPackage(await importPackage(file));
    await refresh();
    status('Imported ' + file.name + '.');
  } catch (error) { status(error.message); }
  finally { event.target.value = ''; }
};

async function start() {
  await refresh();
  if (pending) {
    namedUrl.searchParams.delete('add');
    history.replaceState(null, '', namedUrl);
    const design = await db.getDesign(pending);
    if (design) await chooseProject(design);
  }
}
void start().catch(error => status(error.message));
