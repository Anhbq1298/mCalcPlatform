import { cageGeometry } from './reinforcement.mjs';
import { sectionSvg } from './section-svg.mjs';
import { validateInputs } from './inputs.mjs';

export function drawSection(container, legend, values) {
  try {
    validateInputs(values);
    container.innerHTML = sectionSvg(values);
    legend.textContent = cageGeometry(values).map(c => c.id + ': ' + c.count + 'Ø' + c.bar + ' · R_L=' + c.barRadius.toFixed(1) + ' mm · '
      + (c.link ? 'closed link Ø' + c.link.diameter + ' @ ' + c.link.spacing + ' · R_S=' + c.linkRadius.toFixed(1) + ' mm' : 'NO LINK')).join(' | ');
  } catch (error) { container.replaceChildren(); legend.textContent = error.message; }
}

export { drawPm as drawInteraction } from './pm-chart.mjs';
