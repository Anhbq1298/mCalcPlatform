import { CalculationEngine } from '../../../../src/engine/index.ts';
import { calcKey } from '../../../../src/canvas/calcOrder.ts';
import template from '../../../../templates/RC_Circular_Column_Check.mCCV?raw';
import { fields, validateInputs } from './inputs.mjs';

function calculate(values) {
  validateInputs(values);
  const document = JSON.parse(template);
  const math = Object.values(document.shapes).filter(shape => shape.type === 'math');
  const updated = new Map(fields.map(([id, , key, unit]) => {
    const suffix = unit === 'kN m' ? '\\,\\mathrm{kN}\\cdot\\mathrm{m}' : unit ? '\\,\\mathrm{' + unit + '}' : '';
    return [key, key + '\\coloneq' + values[id] + suffix];
  }));
  const consumed = new Set();
  for (const { props } of math) {
    const key = props.latex.split('\\coloneq')[0];
    if (updated.has(key)) {
      props.latex = updated.get(key);
      consumed.add(key);
    }
  }
  if (consumed.size !== updated.size) throw new Error('The circular column worksheet inputs have changed.');
  const shapes = Object.fromEntries(Object.values(document.shapes).map(shape => [shape.id, shape]));
  const engine = new CalculationEngine({ unitSystem: 'SI' });
  engine.batch(() => {
    for (const shape of math) engine.setRegion(shape.id, {
      latex: shape.props.latex, order: calcKey(shape, shapes),
      displayUnit: shape.props.displayUnit || null,
      precision: shape.props.precision >= 0 ? shape.props.precision : null,
    });
  });

  function read(latex) {
    const shape = math.find(candidate => candidate.props.latex === latex
      || candidate.props.latex.startsWith(latex + '\\coloneq'));
    const result = shape && engine.getResult(shape.id);
    if (result?.status !== 'valid' || !result.value) {
      throw new Error('The worksheet could not evaluate ' + latex + '. ' + (result?.error?.message ?? ''));
    }
    return result.value;
  }

  function detailingCheck(latex, label, comparison) {
    const shape = math.find(candidate => candidate.props.latex === latex);
    const check = shape && engine.getResult(shape.id)?.check;
    return {
      label,
      status: check ? (check.pass ? 'pass' : 'fail') : 'incomplete',
      detail: check ? check.leftValue.text + ' ' + comparison + ' ' + check.rightValue.text : undefined,
    };
  }

  const moment = read('M_{Ed}').number;
  const axial = read('N_{Ed}').number;
  const momentValues = read('M_{v}=').items;
  const axialValues = read('N_{v}=').items;
  if (!momentValues?.length || momentValues.length !== axialValues?.length) throw new Error('The worksheet returned no interaction curve.');
  const result = {
    combined: values.axial === 0 && values.mx === 0 && values.my === 0 ? 0 : read('\\mathrm{UR}_{M}').number,
    shear: values.shear === 0 ? 0 : read('\\mathrm{UR}_{V}').number,
    width: values.shear === 0 ? null : read('b_{w}').number,
    cot: values.shear === 0 ? null : read('\\mathrm{cot}_{\\theta}').number,
    linkStress: values.shear === 0 ? null : read('\\tau_{Rd.sy}').number,
    strutStress: values.shear === 0 ? null : read('\\sigma_{cd}').number,
    detailing: [
      detailingCheck(String.raw`s_{cl.1}\ge100\,\mathrm{mm}`, 'Outer bar clearance', '≥'),
      ...(values.cages === 2 ? [
        detailingCheck(String.raw`r_{2}\le r_{1}-\frac{\phi_{l1}+\phi_{l2}}{2}`, 'Inner cage fit', '≤'),
      ] : []),
    ],
    demand: [moment, axial],
    curve: momentValues.map((value, index) => [value, axialValues[index]]),
  };
  const metrics = [result.combined, result.shear, result.width, result.cot, result.linkStress, result.strutStress,
    ...result.demand, ...result.curve.flat()];
  if (metrics.some(value => value !== null && !Number.isFinite(value)) || result.combined < 0 || result.shear < 0) {
    throw new Error('The worksheet returned a result outside its calculation range.');
  }
  document.title = 'Circular RC Column Check';
  return { result, document };
}

self.onmessage = ({ data: { id, values } }) => {
  try { self.postMessage({ id, ...calculate(values) }); }
  catch (error) { self.postMessage({ id, error: error.message }); }
};
