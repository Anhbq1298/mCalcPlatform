import { createStore } from '../../packages/design-sdk/src/index.mjs';
import '../../../src/styles/global.css';
import './style.css';
import './print-package.css';

const db = createStore();
const container = document.getElementById('reports');
const feedback = document.getElementById('feedback');
const print = document.getElementById('print');
const printable = document.getElementById('print-root');
print.disabled = true;
print.onclick = () => window.print();

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function copyPages(doc) {
  const frame = document.createElement('iframe');
  frame.className = 'report-frame';
  frame.title = doc.meta.name;
  frame.src = '../calc/?report=' + encodeURIComponent(doc.id) + '&print=1';
  document.body.append(frame);
  try {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const child = frame.contentDocument;
      const result = child?.documentElement.dataset.packagePrint;
      if (result === 'ready') {
        const pages = [...child.querySelectorAll('#print-root .print-page')];
        if (!pages.length) throw new Error('The worksheet has no printable pages.');
        return pages.map(page => document.importNode(page, true));
      }
      if (result) throw new Error(result);
      await delay(100);
    }
    throw new Error('The worksheet took too long to render.');
  } finally {
    frame.remove();
  }
}

async function render() {
  const project = await db.getProject(new URLSearchParams(location.search).get('project') ?? '');
  if (!project) throw new Error('Project is unavailable.');
  document.title = project.name;
  document.getElementById('name').textContent = project.name;
  const designs = await Promise.all(project.folders.flatMap(folder => folder.designs).map(id => db.getDesign(id)));
  const names = document.createElement('ol');
  const missing = [];
  for (const doc of designs.filter(Boolean)) {
    const item = document.createElement('li');
    item.textContent = doc.meta.name + (doc.report ? '' : ' — report not saved');
    names.append(item);
    if (!doc.report) missing.push(doc.meta.name);
  }
  container.append(names);
  if (missing.length) throw new Error('Save worksheet reports for ' + missing.join(', ') + ' before printing the package.');
  for (const doc of designs.filter(Boolean)) {
    feedback.textContent = 'Preparing ' + doc.meta.name + '…';
    try { printable.append(...await copyPages(doc)); }
    catch (error) { throw new Error(doc.meta.name + ': ' + error.message); }
  }
  if (!printable.childElementCount) throw new Error('Add a worksheet report to the project first.');
  await document.fonts.ready;
  feedback.textContent = printable.childElementCount + ' pages ready to print.';
  print.disabled = false;
}
void render().catch(error => { feedback.textContent = error.message; printable.replaceChildren(); });
