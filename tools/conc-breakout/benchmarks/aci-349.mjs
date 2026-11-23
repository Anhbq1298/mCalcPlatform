import { calculate } from '../src/calculate.mjs';
import { newConnectionDefaults } from '../src/inputs.mjs';

const inch = 25.4;
const kip = 4.4482216152605;
const ksi = 6.894757293168;

export const reference = {
  title: 'Embedment Design Examples',
  author: 'ACI Committee 349',
  year: 1997,
  url: 'https://studylib.net/doc/25334083/anchor-embdement',
};

export const examples = [
  {
    name: 'B2(b)', pages: '17–19', diameter: 0.5, tension: 0, publishedTopDemand: 0.9 * 0.307 * 50,
    publishedQuantity: 'Factored top row force reconstructed from published required area',
    statics: () => 0.9 * ((70 / 45 - 0.328) / 4) * 50,
  },
  {
    name: 'B3(b)', pages: '24–25', diameter: 0.625, tension: 11.1, publishedTopDemand: 21.7,
    publishedQuantity: 'Factored top row force reported directly',
    statics: () => (70 + 11.1 * 1.5) / 4,
  },
];

export function evaluateExample(item, h = 10) {
  const input = newConnectionDefaults();
  input.plate = { grade: 'S235', B: 7 * inch, H: 7 * inch, t: 0.625 * inch };
  input.member = { profile: 'hss', b: 3 * inch, h: 3 * inch, tf: 0.25 * inch, tw: 0.25 * inch, weld: 6 };
  input.rebars.rows = [];
  input.concrete.fck = 4 * ksi;
  input.concrete.thickness = 300;
  input.studs = { ...input.studs, d: item.diameter * inch, dh: 25.4, hef: 5.69 * inch, fyk: 50 * ksi,
    fuk: 60 * ksi, shearStiffness: 45000, sx: 5 * inch, sy: 5 * inch };
  input.loading.point = { x: 0, y: 0, z: 0 };
  input.loading.applied = { N: item.tension * kip, Vx: 0, Vy: -12.4 * kip, Mx: 70 * kip * inch / 1000, My: 0, Mz: 0 };
  input.options.meshSize = h;
  const result = calculate(input);
  const shellTopDemand = result.studs.filter(e => e.y > 0).reduce((sum, e) => sum + e.F / (1000 * kip), 0);
  return {
    reference, example: item.name, pages: item.pages, geometry: input.plate, member: input.member, stud: input.studs,
    concrete: input.concrete, actions: input.loading.applied, boundary: 'Rigid HSS perimeter, flexible plate and unilateral Winkler springs',
    quantity: item.publishedQuantity,
    publishedTopDemandKip: item.publishedTopDemand,
    independentStaticsKip: item.statics(), shellTopDemandKip: shellTopDemand,
    shellDifferencePercent: 100 * (shellTopDemand / item.publishedTopDemand - 1),
    analyticalConvergence: result.eq.analysisValid,
    meshComparison: result.eq.meshComparison,
    verification: 'Comparison only. ACI uses ultimate bearing assumptions and provides no elastic anchor stiffness.',
  };
}

if (process.argv[1]?.endsWith('/aci-349.mjs')) {
  console.log(JSON.stringify(examples.map(item => evaluateExample(item)), null, 2));
}
