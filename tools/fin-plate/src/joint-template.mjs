import { columnSupports, supportNames } from './inputs.mjs';

export function jointTemplatePicker(openTemplate) {
  const picker = document.getElementById('joint-template');
  const form = document.getElementById('joint-template-form');
  const attachment = form.elements.attachment;
  const submit = form.querySelector('button[type="submit"]');
  const editors = document.querySelectorAll('[data-joint-editor]');
  let editing = false;

  attachment.replaceChildren(...columnSupports.map(value => new Option(supportNames[value], value)));
  function update() {
    const joint = form.elements.joint.value;
    attachment.disabled = joint !== 'beam-column';
    attachment.closest('label').hidden = attachment.disabled;
    submit.disabled = !joint;
  }

  form.addEventListener('change', update);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const joint = form.elements.joint.value;
    if (joint) openTemplate(joint === 'beam-beam' ? 'beam-web' : attachment.value);
  });

  return {
    get editing() { return editing; },
    open() {
      editing = false;
      form.reset();
      update();
      for (const editor of editors) editor.hidden = true;
      picker.hidden = false;
      document.getElementById('joint-template-title').focus();
    },
    close() {
      editing = true;
      picker.hidden = true;
      for (const editor of editors) editor.hidden = false;
    },
  };
}
