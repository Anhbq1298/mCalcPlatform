import template from '../../../../templates/RC_Circular_Column_Check.mCCV?raw';
import { detailing, unverified } from './detailing.mjs';
import { validateInputs } from './inputs.mjs';
import { createReport } from './report.mjs';
import { sectionResistance, slendernessCheck } from './section.mjs';
import { shearCheck } from './shear.mjs';
import { resistanceRow } from '../../../apps/column-summary.mjs';

function calculate(values) {
  const section = validateInputs(values);
  const result = section.collision ? { curve: [] } : sectionResistance(values, section);
  const verify = (label, ratio, detail) => ratio === undefined
    ? unverified(label, 'Resolve reinforcement collisions before checking section resistance.')
    : resistanceRow(label, ratio, detail);
  const rows = [
    verify('Axial resistance', result.axialRatio, result.compression === undefined ? undefined
      : 'NRd ' + (values.axial >= 0 ? result.compression : result.tension).toFixed(0) + ' kN'),
    verify('Biaxial bending / PMM', result.combined, result.capacity === undefined ? undefined
      : 'MRd at NEd · ' + result.capacity.toFixed(1) + ' kNm'),
    slendernessCheck(values, section),
    shearCheck(values, section),
    ...detailing(values, section),
  ];
  result.rows = rows;
  return { result, document: createReport(template, values, section, result) };
}

self.onmessage = ({ data: { id, values } }) => {
  try { self.postMessage({ id, ...calculate(values) }); }
  catch (error) { self.postMessage({ id, error: error.message }); }
};
