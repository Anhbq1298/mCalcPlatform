import { createMBColumnCore } from '../../../vendor/mbcolumn-solver/mbcolumn-core.mjs';

import { checkColumnShear } from './shear.mjs';

const core = createMBColumnCore();

export function solveColumn(route, input) {
  switch (route) {
    case 'analyse': {
      const { section, concrete, steel, demands, settings, shear } = input;
      if (![section.b, section.h].every(size => Number.isFinite(size) && size >= 100 && size <= 5000)
        || section.bars.length > 300 || demands.length > 50
        || ![settings.fiberCountX, settings.fiberCountY].every(n => Number.isInteger(n) && n >= 8)
        || settings.fiberCountX * settings.fiberCountY > 160000) throw new Error('The section, mesh, or load count is outside solver limits.');
      const result = core.analyse(input);
      if (shear?.links.enabled) {
        try {
          result.shear = checkColumnShear({ ...section, fc: concrete.fc, ...steel, link: shear.diameter }, shear.links, shear.loads);
        } catch (error) { result.shearError = error.message; }
      }
      return result;
    }
    case 'creep': return core.creepCoefficient(input);
    case 'slenderness':
      return input.loads.map(load => core.ec2Slenderness(input.section, input.member, load));
    default: throw new Error('Unknown column solver request.');
  }
}

if (typeof self !== 'undefined') {
  self.onmessage = ({ data: { id, route, input } }) => {
    try {
      const result = solveColumn(route, input);
      const mesh = result.mesh?.xyz?.buffer;
      self.postMessage({ id, result }, mesh ? [mesh] : []);
    } catch (error) {
      self.postMessage({ id, error: error.message });
    }
  };
}
