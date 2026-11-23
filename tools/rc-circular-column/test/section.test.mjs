import assert from 'node:assert/strict';
import test from 'node:test';
import { newDefaults, validateInputs } from '../src/inputs.mjs';
import { sectionResistance } from '../src/section.mjs';

test('matches independent D1000 axial strengths and uniaxial strain compatibility at 8000 kN', () => {
  const input = {
    ...newDefaults(), diameter: 1000, cover: 40, concrete: 32, axial: 8000, mx: 1000, my: 0,
    layers: [{ count: 20, bar: 32, radius: 432, offset: 0 }, { count: 12, bar: 25, radius: 371.5, offset: 0 }],
    reinforcement: {
      links: [{ diameter: 12, spacing: 150 }, { diameter: 12, spacing: 125 }],
      spirals: [{ diameter: 12, spacing: 150 }, { diameter: 12, spacing: 125 }],
    },
  };
  const result = sectionResistance(input, validateInputs(input));
  const steelArea = Math.PI * (20 * 32 ** 2 + 12 * 25 ** 2) / 4;
  const concreteArea = Math.PI * 500 ** 2 - steelArea;
  const fcd = 32 * 0.85 / 1.5;
  const fyd = 500 / 1.15;
  assert.ok(Math.abs(result.compression - (concreteArea * fcd + steelArea * 400) / 1000) < 1e-8);
  assert.ok(Math.abs(result.tension + steelArea * fyd / 1000) < 1e-8);

  // Independent integration in angular coordinates: y=R cos(t), dA=2R² sin²(t) dt.
  function resultant(neutralDepth) {
    const strain = y => 0.0035 * (1 - (500 - y) / neutralDepth);
    const stress = y => fcd * (1 - (1 - Math.max(0, Math.min(1, strain(y) / 0.002))) ** 2);
    let force = 0;
    let moment = 0;
    const dt = Math.PI / 16000;
    for (let i = 0; i < 16000; i++) {
      const t = (i + 0.5) * dt;
      const y = 500 * Math.cos(t);
      const stripForce = stress(y) * 2 * 500 ** 2 * Math.sin(t) ** 2 * dt;
      force += stripForce;
      moment += stripForce * y;
    }
    for (const [count, diameter, radius] of [[20, 32, 432], [12, 25, 371.5]]) {
      for (let i = 0; i < count; i++) {
        const y = radius * Math.cos(2 * Math.PI * i / count);
        const steel = Math.max(-fyd, Math.min(fyd, 200000 * strain(y)));
        const barForce = (steel - stress(y)) * Math.PI * diameter ** 2 / 4;
        force += barForce;
        moment += y * barForce;
      }
    }
    return { force: force / 1000, moment: moment / 1e6 };
  }
  let lo = 400, hi = 900;
  while (hi - lo > 1e-6) {
    const c = (lo + hi) / 2;
    if (resultant(c).force < 8000) lo = c;
    else hi = c;
  }
  const independent = resultant((lo + hi) / 2);
  assert.ok(Math.abs(independent.force - 8000) < 1e-4);
  assert.ok(Math.abs(result.capacity / independent.moment - 1) < 0.001,
    'Independent moment ' + independent.moment + ' vs section engine ' + result.capacity);
});

test('jointly rotating the bars and biaxial demand preserves capacity and curve', () => {
  const first = newDefaults();
  first.layers[0].count = 5;
  const original = sectionResistance(first, validateInputs(first));
  const angle = Math.PI / 180 * 33;
  const next = { ...first, layers: [{ ...first.layers[0], offset: 33 }],
    mx: first.mx * Math.cos(angle) - first.my * Math.sin(angle),
    my: first.mx * Math.sin(angle) + first.my * Math.cos(angle) };
  const rotated = sectionResistance(next, validateInputs(next));
  assert.ok(Math.abs(rotated.capacity - original.capacity) < 1e-8);
  assert.ok(Math.abs(rotated.combined - original.combined) < 1e-10);
});
