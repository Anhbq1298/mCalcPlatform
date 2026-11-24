import { convertLatexToMarkup } from 'mathlive';
import 'mathlive/static.css';
import { calculationSteps } from './calculation-steps.mjs';

export function calculationTabs() {
  const tabs = [...document.querySelectorAll('#calculation-tabs [role="tab"]')];
  const detail = tabs[1];
  const output = document.getElementById('calculation-steps');
  let latest;

  function render() {
    output.replaceChildren();
    if (detail.getAttribute('aria-selected') !== 'true') return;
    if (!latest) {
      output.textContent = 'Enter valid connection inputs to view the calculation.';
      return;
    }
    const guide = document.createElement('p');
    guide.className = 'fin-calculation-guide';
    guide.textContent = 'Read each step from explanation to formula, substituted values and result. UR means utilization ratio. Above 100% means that individual check exceeds its calculated limit.';
    output.append(guide);
    for (const { title, intro, note, outcome, captions = [], equations } of calculationSteps(...latest)) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = title;
      section.append(heading);
      for (const text of [intro, outcome, note].filter(Boolean)) {
        const paragraph = document.createElement('p');
        if (text === outcome) paragraph.className = 'fin-calculation-result';
        paragraph.textContent = text;
        section.append(paragraph);
      }
      if (!equations.length) {
        output.append(section);
        continue;
      }
      const list = document.createElement('ol');
      list.className = 'fin-calculation-list';
      for (const [index, equation] of equations.entries()) {
        const step = document.createElement('li');
        if (captions[index]) {
          const caption = document.createElement('p');
          caption.textContent = captions[index];
          step.append(caption);
        }
        const row = document.createElement('div');
        row.className = 'fin-equation';
        row.dataset.latex = equation;
        row.innerHTML = convertLatexToMarkup(equation, { defaultMode: 'math' });
        step.append(row);
        list.append(step);
      }
      section.append(list);
      output.append(section);
    }
  }

  function activate(active, focus) {
    for (const tab of tabs) {
      const selected = tab === active;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    }
    if (focus) active.focus();
    render();
  }

  tabs.forEach((tab, index) => {
    tab.onclick = () => activate(tab, false);
    tab.onkeydown = event => {
      const next = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length,
        Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      activate(tabs[next], true);
    };
  });
  return {
    render(...args) { latest = args; render(); },
    clear() { latest = undefined; render(); },
  };
}
