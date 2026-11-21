import { createDesign, createProject, createStore, designFileName, duplicateDesign, exportDesignFile, importDesignFile, importPackage, isDesignExtension } from '../../packages/design-sdk/src/index.mjs';
import { findTool, tools } from '../registry.mjs';
import { button, dialog, el, link, qs, saveBlob, saveFile, status } from './dom.mjs';
import { pickModule, renderCatalog, thumbnail } from './module-cards.mjs';
import { folderBreadcrumb, renderTree } from './project-tree.mjs';
import './style.css';

const db = createStore();
const expanded = new Set();
let projects = [], designs = new Map();
let refreshId = 0;
let projectId, folderId;

function projectUrl(project, folder, route = './') {
  const url = new URL(route, document.baseURI);
  if (project) url.searchParams.set('project', project.id);
  if (folder) url.searchParams.set('folder', folder.id);
  return url;
}

function select(project, folder, focus) {
  projectId = project?.id;
  folderId = folder?.id;
  if (project) {
    expanded.add(project.id);
    let branch = folder;
    while (branch) {
      expanded.add(project.id + '/' + branch.id);
      branch = project.folders.find(item => item.id === branch.parentId);
    }
  }
  const url = projectUrl(project, folder);
  url.hash = 'projects';
  history.replaceState(null, '', url);
  render();
  if (focus) qs('project-list').querySelector('[aria-current]')?.focus();
}

async function refresh() {
  const request = ++refreshId;
  const [saved, allProjects] = await Promise.all([db.listDesigns(), db.listProjects()]);
  if (request !== refreshId) return;
  projects = allProjects;
  designs = new Map(saved.map(doc => [doc.id, doc]));
  render();
}

const folderOptions = project => project.folders.map(folder => [folder.id, folderBreadcrumb(project, folder)]);
const named = async (title, label, initial) => (await dialog(title, [[label, null, initial]]))?.get(label).trim();

async function newProject() {
  const name = await named('New project', 'Project name');
  if (!name) return;
  const project = createProject(name);
  await db.saveProject(project);
  select(project);
  await refresh();
  return project;
}

async function addFolder(project, parent) {
  const name = await named(parent ? 'Add subfolder' : 'Add folder', 'Folder name');
  if (!name) return;
  const folder = { id: crypto.randomUUID(), name, designs: [], ...(parent ? { parentId: parent.id } : {}) };
  await db.updateProject(project.id, current => ({ ...current, folders: [...current.folders, folder] }));
  await refresh();
  select(await db.getProject(project.id), folder, true);
}

async function renameFolder(project, folder) {
  const name = await named('Rename folder', 'Folder name', folder.name);
  if (!name) return;
  await db.updateProject(project.id, current => ({
    ...current, folders: current.folders.map(item => item.id === folder.id ? { ...item, name } : item),
  }));
  await refresh();
}

async function addDesign(project, folder) {
  const result = await pickModule(folderBreadcrumb(project, folder));
  if (!result) return;
  const design = { ...createDesign(result.tool, result.name, {}), pending: true };
  await db.addProjectDesign(project.id, folder.id, design);
  await refresh();
  document.getElementById('design-' + design.id)?.focus();
  status('Calculation added.');
}

async function chooseProject(doc, project) {
  if (!project) {
    if (!projects.length) project = await newProject();
    else {
      const data = await dialog('Add design to project', [['Project', projects.map(item => [item.id, item.name])]]);
      project = projects.find(item => item.id === data?.get('Project'));
    }
  }
  if (!project) return;
  const choice = await dialog('Choose project folder', [
    ['Folder', folderOptions(project), project.id === projectId && folderId || findTool(doc.tool)?.folder],
  ]);
  if (!choice) return;
  const folder = project.folders.find(item => item.id === choice.get('Folder'));
  await db.moveDesign(project.id, doc.id, folder.id);
  await refresh();
  select(project, folder);
  status('Project updated.');
}

function designUrl(doc, project, folder, report = false) {
  const url = projectUrl(project, folder, report ? 'calc/' : findTool(doc.tool).entry);
  url.searchParams.set(report ? 'report' : 'design', doc.id);
  return url;
}

function calculationCard(doc, project, folder) {
  const tool = findTool(doc.tool);
  const card = el('article', undefined, 'calculation-card saved');
  const title = el('h3');
  const open = tool ? link(doc.meta.name, designUrl(doc, project, folder)) : el('span', doc.meta.name);
  open.id = 'design-' + doc.id;
  title.append(open);
  const info = el('div', undefined, 'calculation-info');
  info.append(title, el('p', tool?.title ?? tool?.name ?? 'Module unavailable', 'muted'));
  const actions = el('div', undefined, 'actions');
  const rename = button('Rename', async () => {
    const name = await named('Rename calculation', 'Calculation name', doc.meta.name);
    if (!name) return;
    await db.updateDesign(doc.id, current => {
      if (tool && current.schema > tool.schema) throw new Error('This calculation uses a newer schema and is read-only.');
      return { ...current, meta: { ...current.meta, name } };
    });
    await refresh();
    document.getElementById(open.id)?.focus();
  });
  rename.setAttribute('aria-label', 'Rename ' + doc.meta.name);
  rename.disabled = !!tool && doc.schema > tool.schema;
  actions.append(rename);
  if (doc.report) actions.append(link('Worksheet', designUrl(doc, project, folder, true), 'button'));
  if (project) actions.append(button('Move', () => chooseProject(doc, project)));
  else actions.append(button('Add to project', () => chooseProject(doc)), button('Duplicate', async () => {
    await db.saveDesign(duplicateDesign(doc));
    await refresh();
  }));
  actions.append(button('Export', () => saveFile(doc.meta.name, { designs: [doc] })));
  if (tool && isDesignExtension(tool.fileExtension)) {
    actions.append(button('Save .' + tool.fileExtension, async () => {
      try { saveBlob(designFileName(doc, tool), await exportDesignFile(doc, tool)); } catch (error) { status(error.message); }
    }));
  }
  card.append(thumbnail(tool), info, actions);
  return card;
}

async function saveProject(id) {
  const project = await db.getProject(id);
  if (!project) throw new Error('This project is unavailable.');
  const ids = project.folders.flatMap(item => item.designs);
  const docs = await Promise.all(ids.map(id => db.getDesign(id)));
  if (docs.some(doc => !doc)) throw new Error('This project references an unavailable calculation.');
  await saveFile(project.name, { project, designs: docs });
  status('Project file saved.');
}

function render() {
  const inProjects = ['#projects', '#designs'].includes(location.hash);
  qs('tools').hidden = inProjects;
  qs('projects').hidden = !inProjects;
  qs('nav-tools').setAttribute('aria-current', inProjects ? 'false' : 'page');
  qs('nav-projects').setAttribute('aria-current', inProjects ? 'page' : 'false');
  if (!inProjects) return;
  const project = projects.find(item => item.id === projectId);
  const folder = project?.folders.find(item => item.id === folderId);
  const toggle = key => {
    if (!expanded.delete(key)) expanded.add(key);
    render();
    qs('project-list').querySelector('[data-disclosure="' + key + '"]')?.focus();
  };
  qs('project-list').replaceChildren(...renderTree({
    projects, project, folder, expanded, toggle,
    select: (owner, target) => select(owner, target, true),
    showSaved: () => select(undefined, undefined, true),
  }));
  qs('breadcrumb').textContent = folder ? folderBreadcrumb(project, folder) : project?.name ?? 'Saved designs';
  qs('folder-actions').replaceChildren(...(folder ? [
    button('Add subfolder', () => addFolder(project, folder)),
    button('Rename folder', () => renameFolder(project, folder)),
    button('+ Add design module', () => addDesign(project, folder)),
  ] : project ? [button('Add folder', () => addFolder(project))] : []));
  qs('folder-actions').querySelector('button:last-child')?.classList.toggle('primary', true);

  const cards = folder ? folder.designs.map(id => designs.get(id)).filter(Boolean)
    : project ? [] : [...designs.values()];
  qs('design-list').replaceChildren(...(cards.length ? cards.map(doc => calculationCard(doc, project, folder)) :
    [el('p', folder ? 'Add a design module to start a calculation.' : project ? 'Select or add a folder.' : 'Saved calculations appear here.', 'muted')]));
  qs('save-project').disabled = !project;
  qs('save-project').onclick = () => saveProject(project.id).catch(error => status(error.message));
  const print = qs('print-project');
  print.hidden = !project?.folders.some(item => item.designs.some(id => designs.get(id)?.report));
  if (!print.hidden) print.href = projectUrl(project, undefined, 'package/');
}

renderCatalog();
qs('nav-projects').onclick = event => {
  event.preventDefault();
  const project = projects.find(item => item.id === projectId);
  select(project, project?.folders.find(item => item.id === folderId));
};
qs('new-project').onclick = () => newProject().catch(error => status(error.message));
qs('open-project').onclick = () => qs('import').click();
qs('import').onchange = async event => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    if (isDesignExtension(file.name.split('.').pop().toLowerCase())) {
      const design = await importDesignFile(file, tools);
      if (await db.getDesign(design.id)) design.id = crypto.randomUUID();
      await db.saveDesign(design);
      await refresh();
      status('Opened ' + file.name + '.');
      return;
    }
    const contents = await importPackage(file);
    const id = await db.importPackage(contents);
    await refresh();
    const project = projects.find(item => item.id === id);
    select(project);
    status('Opened ' + file.name + '.');
  } catch (error) { status(error.message); }
  finally { event.target.value = ''; }
};
window.addEventListener('hashchange', render);

async function start() {
  const params = new URL(location.href).searchParams;
  await refresh();
  const project = projects.find(item => item.id === params.get('project'));
  if (project && location.hash !== '#tools') select(project, project.folders.find(item => item.id === params.get('folder')));
  if (params.has('add')) {
    const design = designs.get(params.get('add'));
    select(project, project?.folders.find(item => item.id === folderId));
    if (design) await chooseProject(design, project);
  }
}
void start().catch(error => status(error.message));
