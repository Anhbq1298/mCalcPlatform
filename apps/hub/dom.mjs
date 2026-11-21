import { exportPackage } from '../../packages/design-sdk/src/index.mjs';

export const qs = id => document.getElementById(id);
export const status = value => { qs('status').textContent = value; };

export function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

export const link = (name, href, css) => Object.assign(el('a', name, css), { href });

export function button(name, run) {
  const item = el('button', name);
  item.type = 'button';
  item.onclick = async () => {
    item.disabled = true;
    try { await run(); }
    catch (error) { status(error.message); }
    finally { item.disabled = false; }
  };
  return item;
}

export function dialog(title, fields) {
  const panel = qs('editor');
  const form = panel.querySelector('form');
  qs('dialog-title').textContent = title;
  panel.returnValue = 'cancel';
  form.querySelector('[data-fields]').replaceChildren(...fields.map(([name, options, value]) => {
    const label = el('label');
    label.append(el('span', name));
    const input = el(options ? 'select' : 'input');
    input.name = name;
    input.required = true;
    if (options) {
      for (const [id, caption] of options) input.append(new Option(caption, id));
      if (value && options.some(([id]) => id === value)) input.value = value;
    } else {
      input.maxLength = 200;
      input.value = value ?? '';
      input.addEventListener('input', () => input.setCustomValidity(''));
    }
    label.append(input);
    return label;
  }));
  form.onsubmit = event => {
    if (event.submitter?.value !== 'confirm') return;
    for (const input of form.querySelectorAll('input')) {
      if (input.value.trim()) continue;
      event.preventDefault();
      input.setCustomValidity('Enter a name.');
      input.reportValidity();
      break;
    }
  };
  return new Promise(resolve => {
    panel.addEventListener('close', () => resolve(panel.returnValue === 'confirm' ? new FormData(form) : null), { once: true });
    panel.showModal();
  });
}

export async function saveFile(name, contents) {
  const url = URL.createObjectURL(await exportPackage(contents));
  const action = link('Download', url);
  action.download = name + '.mcalc';
  action.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
