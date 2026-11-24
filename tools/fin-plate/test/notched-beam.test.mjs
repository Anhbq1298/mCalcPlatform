import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/connection.mjs';
import { columnSupports, defaults, jointForSupport } from '../src/inputs.mjs';

const close = (actual, expected, tolerance) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${expected} ± ${tolerance}; got ${actual}`);
const base = { ...defaults, beamFy: 275, beamFu: 410, plateFy: 275, plateFu: 410, restrained: true,
  diameter: 20, gap: 10, beamEnd: 40, pitch: 70, gauge: 60, plateEdge: 50, notchTop: 50 };

test('P358 §5.6 Example 1 reproduces the one- and two-column notched web checks', () => {
  const examples = [
    { beam: { h: 412.8, b: 179.5, tw: 9.5, tf: 16, r: 10.2 }, columns: 1, rows: 4, vertical: 200,
      length: 110, gross: 561, net: 581, block: 312, moment: 89.1, demand: 24, local: 413 },
    // Check 5 uses 110 mm in its own sketch and evaluation. Check 4 gives 120 mm.
    { beam: { h: 533, b: 209.3, tw: 10.1, tf: 15.6, r: 12.7 }, columns: 2, rows: 5, vertical: 350,
      length: 110, gross: 794, net: 837, block: 481, moment: 164, demand: 42, local: 533 },
  ];
  for (const e of examples) {
    // Locate the beam so that the bolted web has the published 40 mm distance to the notch edge.
    const result = calculate({ ...base, columns: e.columns, rows: e.rows, vertical: e.vertical,
      offset: (base.top + base.bottom + (e.rows - 1) * base.pitch - e.beam.h) / 2 + 50, notchLength: e.length }, e.beam);
    const check = fragment => result.checks.find(row => row.name.includes(fragment));
    close(check('gross shear').resistance, e.gross, 1);
    close(check('net shear').resistance, e.net, 1);
    close(check('block tearing').resistance, e.block, 1);
    close(check('notch shoulder').resistance, e.moment, 1);
    close(check('notch shoulder').demand, e.demand, 0.01);
    close(check('length limit').resistance, e.local, 0.25);
    if (e.columns === 2) {
      close(check('bending at connection').demand, 38.5, 1e-9);
      close(check('bending at connection').resistance, 164, 1);
    }
  }
});

test('support attachments preserve their joint family and only beam-web activates notch checks', () => {
  const input = { ...defaults, notchTop: 45, notchLength: 180 };
  assert.equal(jointForSupport('beam-web'), 'beam-beam');
  assert.equal(jointForSupport('rigid'), 'legacy');
  for (const support of columnSupports) {
    assert.equal(jointForSupport(support), 'beam-column');
    assert.equal(calculate({ ...input, support }, defaults).notch, null);
  }
  assert.ok(calculate(input, defaults).notch);
  assert.throws(() => calculate({ ...input, notchLength: 0 }, defaults), /notch length/);
});

test('double notch uses the reduced web and preserves the open member stability checks', () => {
  const input = { ...defaults, restrained: false, rows: 4, notchTop: 100, notchBottom: 100, notchLength: 180 };
  const result = calculate(input, defaults);
  close(result.notchedBeam.depth, defaults.h - 200, 1e-9);
  close(result.notchedBeam.area, 0.9 * defaults.tw * (defaults.h - 200), 1e-9);
  assert.match(result.openChecks.join(' '), /6–7/);
  assert.equal(result.complete, false);
  const unnotched = calculate({ ...input, notchTop: 0, notchBottom: 0 }, defaults);
  assert.ok(result.group.bolts.at(-1).web.utilization > unnotched.group.bolts.at(-1).web.utilization);
});
