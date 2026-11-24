import { convertLatexToMarkup } from 'mathlive';
import 'mathlive/static.css';
import { calculationSheet } from './calculation-sheet.mjs';
import { draw } from './drawing.mjs';
import { percent } from './report.mjs';
import { sciSource } from './sci-p358.mjs';

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function appendStep(parent, { title, intro, note, outcome, captions = [], equations }) {
  const section = node('section', '', 'fin-sheet-step');
  section.append(node('h4', title));
  if (intro) section.append(node('p', intro));
  if (outcome) section.append(node('p', outcome, 'fin-calculation-result'));
  if (note) section.append(node('p', note));
  if (equations.length) {
    const list = node('ol', '', 'fin-calculation-list');
    for (const [index, equation] of equations.entries()) {
      const item = node('li');
      if (captions[index]) item.append(node('p', captions[index]));
      const row = node('div', '', 'fin-equation');
      row.dataset.latex = equation;
      row.innerHTML = convertLatexToMarkup(equation, { defaultMode: 'math' });
      item.append(row);
      list.append(item);
    }
    section.append(list);
  }
  parent.append(section);
}

function drawSheetViews(beam, input, result, governing) {
  const drawings = node('div', '', 'fin-drawings fin-sheet-drawings');
  for (const [view, caption] of [['plan', 'Plan · support face and angle'], ['elevation', 'Elevation · bolts, plate and beam end']]) {
    const figure = node('figure');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('fin-drawing');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Calculation ' + view);
    const bounds = draw(svg, beam, input, result, { view, governing, forces: false, dimensions: true, idPrefix: 'fin-sheet' });
    svg.setAttribute('viewBox', bounds.join(' '));
    figure.append(node('figcaption', caption), svg);
    drawings.append(figure);
  }
  return drawings;
}

function resultsTable(checks, governing) {
  const wrapper = node('div', '', 'fin-table');
  const table = node('table', '', 'fin-sheet-summary');
  const head = table.createTHead().insertRow();
  for (const label of ['Component check', 'Demand', 'Resistance / limit', 'UR', 'Result']) {
    const cell = node('th', label);
    cell.scope = 'col';
    head.append(cell);
  }
  const body = table.createTBody();
  for (const check of checks) {
    const row = body.insertRow();
    const name = node('th', check.name + (check.bolt ? ' · Bolt ' + check.bolt : ''));
    name.scope = 'row';
    const failed = !Number.isFinite(check.ratio) || check.ratio > 1;
    row.dataset.governing = String(check === governing);
    row.dataset.failure = String(failed);
    const measurement = value => Number.isFinite(value) ? value.toFixed(2) + ' ' + (check.unit ?? 'kN') : '—';
    row.append(name, node('td', measurement(check.demand)), node('td', measurement(check.resistance)),
      node('td', percent(check.ratio)), node('td', failed ? 'Exceeds limit' : 'Within limit'));
  }
  wrapper.append(table);
  return wrapper;
}

export function renderCalculationSheet(output, input, beam, result) {
  const data = calculationSheet(input, beam, result);
  const sheet = node('article', '', 'fin-sheet');
  const title = node('header', '', 'fin-sheet-header');
  const actions = node('div', '', 'fin-sheet-actions');
  const print = node('button', 'Print calculation');
  print.type = 'button';
  print.onclick = () => window.print();
  actions.append(print);
  title.append(node('h2', data.title), node('p', 'Fin plate design calculation · ' + result.status), actions);
  sheet.append(title);

  const setup = node('section');
  setup.append(node('h3', 'Design data'));
  const groups = node('div', '', 'fin-sheet-data');
  for (const [label, values] of data.groups) {
    const group = node('section');
    const list = node('dl');
    for (const [key, value] of values) list.append(node('dt', key), node('dd', value));
    group.append(node('h4', label), list);
    groups.append(group);
  }
  const governing = data.checks.reduce((worst, check) => check.ratio > worst.ratio ? check : worst);
  const governingBolt = data.checks.filter(check => check.bolt)
    .reduce((worst, check) => check.ratio > worst.ratio ? check : worst).bolt;
  setup.append(groups, drawSheetViews(beam, input, result, governingBolt));
  sheet.append(setup);

  const summary = node('section');
  summary.append(node('h3', 'Design summary'),
    node('p', 'UR means utilization ratio. Compare the demand with the resistance or limit for each component. A UR above 100% exceeds that component’s limit. Open items below require separate assessment.', 'fin-calculation-guide'),
    resultsTable(data.checks, governing));
  sheet.append(summary);

  const geometry = node('section');
  geometry.append(node('h3', 'Load path and geometry'));
  for (const step of data.geometry) appendStep(geometry, step);
  sheet.append(geometry);
  for (const check of data.sections) {
    const section = node('section', '', 'fin-sheet-check');
    section.dataset.check = check.key;
    const heading = check.key === 11 ? check.title : 'Check ' + check.key + ' · ' + check.title;
    section.append(node('h3', heading), node('p', check.status + ' · ' + check.explanation, 'fin-sheet-status'));
    for (const step of check.steps) appendStep(section, step);
    sheet.append(section);
  }

  const references = node('footer');
  references.append(node('h3', 'References'));
  const link = node('a', 'SCI P358, §§5.5–5.6 · Design procedure and worked examples');
  link.href = sciSource;
  link.target = '_blank';
  link.rel = 'noopener';
  references.append(link, node('p', 'BS EN 1993-1-8:2005 · Bolted and welded joint component checks.'));
  sheet.append(references);
  output.replaceChildren(sheet);
}
