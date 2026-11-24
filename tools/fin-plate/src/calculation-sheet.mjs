import { calculationSteps } from './calculation-steps.mjs';
import { jointForSupport, jointNames, supportNames } from './inputs.mjs';

const titles = {
  1: 'Connection detailing',
  2: 'Bolt group and bearing',
  3: 'Fin plate resistance',
  4: 'Supported beam web',
  5: 'Bending at the notch shoulder',
  6: 'Local notch stability',
  7: 'Overall stability of the notched beam',
  8: 'Welds',
  10: 'Supporting member',
  11: 'Structural integrity and tying (Checks 11–16)',
};
const mm = x => x + ' mm';
const strength = (fy, fu) => fy + ' / ' + fu + ' MPa';

export function calculationSheet(input, beam, result) {
  const joint = jointForSupport(input.support);
  const { notch, notchedBeam, sci, weld, support, customLayout, details, openChecks } = result;
  const notchType = notch?.top && notch.bottom ? 'Double notch'
    : notch?.top ? 'Top notch' : notch?.bottom ? 'Bottom notch' : 'Unnotched beam';
  const angle = input.skew === 0 ? 'Square connection' : 'Skewed ' + input.skew + '°';
  const subject = joint === 'beam-beam' ? notchType : supportNames[input.support];
  const steps = calculationSteps(input, beam, result);
  const applicability = {
    1: details.length ? ['Review required', details.join(' ')]
      : customLayout ? ['Partial check', 'Hole clearance and overlap are screened. Spacing of a custom bolt grid requires separate review.']
        : ['Checked', 'The model found no detail violations within its geometry checks.'],
    2: sci ? ['Calculated', 'SCI P358 bolt-group resistances are shown alongside per-bolt elastic results.']
      : ['Partial check', customLayout ? 'Elastic bolt shear is calculated. Bearing requires a regular bolt layout.'
        : 'Elastic bolt shear and directional bearing screening are available. This case is outside the implemented SCI P358 bolt-group procedure.'],
    3: sci ? (sci.stability.resistance === null
      ? ['Partial check', 'Fin plate section resistances are calculated. Long-plate stability requires separate verification.']
      : ['Calculated', sci.plate.bending === null ? 'The P358 first-stage plate bending check is satisfied by the depth-to-lever-arm criterion.' : 'Compare the plate section and stability resistances with the applied shear.'])
      : ['Open', 'Verify fin plate shear, block tearing, bending and stability for this layout.'],
    4: notchedBeam ? (openChecks.some(message => message.startsWith('P358 Check 4 ·'))
      ? ['Partial check', 'Notched-web resistances are shown. The additional long-fin-plate web check remains open.']
      : ['Calculated', 'The reduced beam web governs the available section at the bolt lines.'])
      : ['Open', notch ? 'The reduced geometry is shown. Verify supported-web resistance for this arrangement and loading.' : 'Verify the shear resistance of the full-depth supported beam web.'],
    5: notchedBeam ? ['Calculated', 'The notch shoulder is checked using the local bending demand and shear interaction.']
      : notch ? ['Open', 'Verify bending and shear interaction at the notch shoulder for this configuration.'] : ['Not applicable', 'The supported beam has no notch in the model.'],
    6: steps.some(step => step.check === 6) ? ['Calculated', 'The notch depth and length are compared with the SCI limits for this restrained beam.']
      : notch ? ['Open', 'Check local notch stability using the member grade, restraint and actual cut geometry.'] : ['Not applicable', 'The supported beam has no notch in the model.'],
    7: notch && !input.restrained ? ['Open', 'The unrestrained notched beam requires a member-level lateral-torsional buckling verification.']
      : ['Not applicable', notch ? 'The supported beam is specified as laterally restrained.' : 'The supported beam has no notch in the model.'],
    8: weld ? ['Partial check', 'The double fillet throat is checked against the SCI sizing rule. Verify the actual weld group and execution details.']
      : ['Open', 'Verify the weld group for the actual geometry and loads.'],
    10: support ? ['Partial check', 'The one-sided local shear and conservative punching criteria are checked for the entered support web or wall.']
      : input.support === 'column-flange' ? ['Not applicable', 'The P358 web or hollow-wall local shear and punching equations do not apply to the I/H column flange. Assess the actual supporting flange where required.']
        : ['Open', 'Verify the support with its geometry and material, including any opposite-side beam where applicable.'],
    11: ['Open', 'Assess tying when required by the project. Use the applicable plate, bolts, beam web, weld and support limit states for this attachment.'],
  };
  const sections = Object.entries(titles).map(([key, title]) => ({
    key: Number(key), title, status: applicability[key][0], explanation: applicability[key][1],
    steps: steps.filter(step => step.check === Number(key)),
  }));
  const groups = [
    ['Members and geometry', [
      ['Supported beam', beam.name ?? 'Custom I-section'],
      ['Supporting face', supportNames[input.support]],
      ['Supported beam depth / web thickness', mm(beam.h) + ' / ' + mm(beam.tw)],
      ['Fin plate height × width × thickness', [result.height, result.width, input.thickness].join(' × ') + ' mm'],
      ['Beam end gap / skew angle', mm(input.gap) + ' / ' + input.skew + '°'],
      ...(notch ? [['Notch top / bottom / length', [notch.top, notch.bottom, notch.length].map(mm).join(' / ')]] : []),
      ['Lateral restraint', input.restrained ? 'Specified' : 'Unrestrained'],
    ]],
    ['Design actions and materials', [
      ['Vertical shear at ULS', input.vertical + ' kN'],
      ['In-plane horizontal force', input.horizontal + ' kN'],
      ['Additional moment', input.appliedMoment + ' kN·m'],
      ['Fin plate yield / ultimate strength', strength(input.plateFy, input.plateFu)],
      ['Supported beam ' + (notch ? 'yield / ultimate strength' : 'ultimate strength'), notch ? strength(input.beamFy ?? 355, input.beamFu) : input.beamFu + ' MPa'],
      ['Support thickness / yield / ultimate strength', input.supportThickness ? mm(input.supportThickness) + ' / ' + strength(input.supportFy, input.supportFu) : 'Thickness not entered'],
      ['Bolts / normal hole', result.group.bolts.length + ' × M' + result.bolt.diameter + ', grade ' + input.grade + ' / Ø' + result.bolt.hole + ' mm'],
      ['Weld leg length', mm(input.weldLeg)],
    ]],
  ];
  return {
    title: (jointNames[joint] ?? 'Fin plate connection') + ' · ' + subject + ' · ' + angle,
    groups, geometry: steps.filter(step => step.check === undefined), sections, checks: result.checks,
  };
}
