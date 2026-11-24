import { supportingFields } from './fields.mjs';

const notchFields = ['notchTop', 'notchBottom', 'notchLength'];

export function supportingControls(catalogue, controls, getState) {
  let group;
  function profile() {
    const state = getState();
    if (state.support !== 'beam-web') return null;
    if (state.supportSection === 0) {
      return { ...Object.fromEntries(supportingFields.map(([key, dimension]) => [dimension, state[key]])), name: 'Custom I-section' };
    }
    const section = catalogue.get(state.supportSection);
    return section ? { ...section.values, name: section.name } : null;
  }
  return {
    attach(element) { group = element; },
    profile,
    renderNotch(result) {
      const state = getState();
      const auto = !controls.get('autoNotch').disabled && state.autoNotch;
      for (const key of notchFields) controls.get(key).value = auto ? Number((result.generatedNotch?.[key] ?? 0).toFixed(3)) : state[key];
    },
    update() {
      const state = getState();
      const section = profile();
      group.hidden = state.support !== 'beam-web';
      controls.get('supportSection').value = section?.name ?? '';
      controls.get('supportSection').placeholder = 'Select an I/H section';
      for (const [key, dimension] of supportingFields) {
        const input = controls.get(key);
        input.closest('label').hidden = !section;
        input.readOnly = state.supportSection !== 0;
        if (input.readOnly) input.value = section?.[dimension] ?? '';
      }
      const auto = controls.get('autoNotch');
      auto.disabled = !section || state.beamLayout !== 'fit';
      for (const key of notchFields) controls.get(key).disabled = (!auto.disabled && state.autoNotch)
        || (key === 'notchLength' && !state.notchTop && !state.notchBottom);
      controls.get('supportLevel').closest('label').hidden = state.supportAlignment !== 'custom';
      controls.get('supportThickness').closest('label').hidden = Boolean(section);
      controls.get('type').closest('label').hidden = Boolean(section) && state.beamLayout === 'outside';
      const gapLabel = controls.get('gap').previousElementSibling;
      gapLabel.textContent = section && state.beamLayout === 'outside' ? 'Clearance along beam beyond flange (mm)' : 'Beam end gap from support face (mm)';
    },
  };
}
