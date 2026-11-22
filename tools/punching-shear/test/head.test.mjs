// Drop panels / column heads (§6.4.2(8)–(11)), the example set, and the LaTeX label renderer.
import assert from 'node:assert/strict';
import test from 'node:test';
import { EXAMPLE_CARDS, EXAMPLES } from '../src/examples.mjs';
import { calculateDesign, rcontSmall } from '../src/head.mjs';
import { STATES } from '../src/inputs.mjs';
import { labelText, texToMathML } from '../src/tex.mjs';

const close = (actual, expected, tol = 1e-6) => assert.ok(Math.abs(actual - expected) <= tol, `${actual} ≠ ${expected}`);
const base = (head, extra = {}) => ({
  beta: { method: 'simplified', confirmed: true }, reinforcement: { anchorage: { engaged: true } },
  column: { shape: 'rectangular', position: 'internal', cx: 400, cy: 400, rotation: 0, x: 0, y: 0 },
  slab: { h: 250, depthMode: 'explicit', dx: 215, dy: 205, cover: 25, xMin: -6000, xMax: 6000, yMin: -6000, yMax: 6000 },
  flexure: { areaMode: 'explicit', asx: 1340, asy: 1340 }, loads: [{ name: 'ULS 1', V: 700, Mx: 0, My: 0 }],
  head: { enabled: true, shape: 'rectangular', ...head }, ...extra,
});

test('r_cont for l_H ≤ 2h_H: lesser of Eq. 6.34 and 6.35 with l1 ≤ l2, Eq. 6.33 for circular', () => {
  const square = rcontSmall({ column: { shape: 'rectangular', cx: 400, cy: 400 }, head: { lx: 1000, ly: 1000 } }, 210);
  close(square.r, 420 + 0.56 * 1000);
  assert.equal(square.eq, 'Eq. 6.34');
  const long = rcontSmall({ column: { shape: 'rectangular', cx: 400, cy: 400 }, head: { lx: 3000, ly: 800 } }, 210);
  assert.equal(long.l1, 800);
  close(long.r, 420 + 0.69 * 800);
  assert.equal(long.eq, 'Eq. 6.35');
  const circle = rcontSmall({ column: { shape: 'circular', diameter: 500 }, head: { diameter: 1000 } }, 200);
  close(circle.r, 400 + 250 + 250);
});

test('l_H ≤ 2h_H: hand check of the slab section at r_cont', () => {
  const result = calculateDesign(base({ lx: 1000, ly: 1000, depth: 200 }));
  assert.equal(result.head.kind, 'small');
  close(result.u1, 2 * Math.PI * 980, 1e-3);
  const rhoL = Math.sqrt((1340 / 215000) * (1340 / 205000));
  const k = 1 + Math.sqrt(200 / 210);
  const vRdc = Math.max((0.18 / 1.5) * k * (100 * rhoL * 30) ** (1 / 3), 0.035 * k ** 1.5 * Math.sqrt(30));
  const vEd = (1.15 * 700e3) / (2 * Math.PI * 980 * 210);
  const concrete = result.loads[0].rows.find(row => row.id === 'concrete');
  close(concrete.demand, vEd, 1e-6);
  close(concrete.resistance, vRdc, 1e-6);
  const face = result.loads[0].rows.find(row => row.id === 'max');
  close(face.demand, (1.15 * 700e3) / (1600 * 210), 1e-6); // column perimeter with the slab d (conservative)
  assert.equal(result.layout.layers.length, 0);
});

test('l_H > 2h_H: perimeters inside the drop (d_H) and in the slab outside the drop', () => {
  const result = calculateDesign(base({ lx: 2400, ly: 2400, depth: 150 }, { column: { shape: 'rectangular', position: 'internal', cx: 500, cy: 500, rotation: 0, x: 0, y: 0 }, loads: [{ name: 'ULS 1', V: 1250, Mx: 0, My: 0 }] }));
  assert.equal(result.head.kind, 'large');
  close(result.head.dH, 210 + 150);
  const [inner, outer] = result.head.sections;
  close(inner.u1, 2000 + 2 * Math.PI * 720, 1e-3);
  close(outer.u1, 9600 + 2 * Math.PI * 420, 1e-3);
  assert.ok(result.loads[0].rows.some(row => row.id === 'ext-concrete'));
  assert.ok(result.layout.layers.length >= 2);
  assert.ok(result.layout.layers.every(layer => layer.offset <= 950 - 25), 'links stay inside the drop');
  assert.equal(result.status, STATES.pass);
});

test('rectangular head with l_H > 2h_H needs no confirmation; the inner section is checked only when it fits', () => {
  const result = calculateDesign(base({ lx: 2400, ly: 2400, depth: 150 }, { loads: [{ name: 'ULS 1', V: 600, Mx: 0, My: 0 }] }));
  assert.equal(result.status, STATES.pass);
  assert.equal(result.head.inner, true);
  // 2h_H = 300 < l_H = 350 < 2d_H = 720: only the slab section outside the drop, face check with d_H.
  const narrow = calculateDesign(base({ lx: 1100, ly: 1100, depth: 150 }, { loads: [{ name: 'ULS 1', V: 500, Mx: 0, My: 0 }] }));
  assert.equal(narrow.head.inner, false);
  assert.deepEqual(narrow.head.sections.map(item => item.id), ['ext']);
  close(narrow.u1, 4 * 1100 + 2 * Math.PI * 420, 1e-3);
  const face = narrow.loads[0].rows.find(row => row.id === 'max');
  close(face.demand, (1.15 * 500e3) / (1600 * 360), 1e-6);
});

test('unsupported drop configurations are reported, not computed', () => {
  assert.equal(calculateDesign(base({ lx: 2400, ly: 1000, depth: 200 })).status, STATES.unsupportedGeometry); // straddles 2h_H
  const edge = base({ lx: 1000, ly: 1000, depth: 200 }, { slab: { h: 250, depthMode: 'explicit', dx: 215, dy: 205, cover: 25, xMin: -6000, xMax: 200, yMin: -6000, yMax: 6000 } });
  edge.column.position = 'edge';
  assert.equal(calculateDesign(edge).status, STATES.unsupportedGeometry);
  assert.equal(calculateDesign(base({ shape: 'circular', diameter: 1200, depth: 200 })).status, STATES.unsupportedGeometry); // circular head on rectangular column
  assert.equal(calculateDesign(base({ lx: 300, ly: 1000, depth: 200 })).status, STATES.incomplete); // head smaller than column
});

test('the six example cards and all their variants give their intended status', () => {
  assert.equal(EXAMPLE_CARDS.length, 6);
  assert.equal(EXAMPLES.length, 14);
  for (const example of EXAMPLES) assert.equal(calculateDesign(example.input).status, example.expect, example.id);
});

test('LaTeX labels render to MathML and plain text', () => {
  assert.equal(texToMathML('V_{Ed}'), '<math><msub><mi>V</mi><mi mathvariant="normal">Ed</mi></msub></math>');
  assert.equal(texToMathML('A_{s,x}'), '<math><msub><mi>A</mi><mrow><mi>s</mi><mo>,</mo><mi>x</mi></mrow></msub></math>');
  assert.equal(labelText('$\\sigma_{cx}$ (MPa)'), 'σ_cx (MPa)');
  assert.equal(labelText('$V_{Ed}$'), 'V_Ed');
});

test('the governing check of a drop design is never an informational row', () => {
  const example = EXAMPLES.find(item => item.id === 'drop-large');
  const result = calculateDesign(example.input);
  const row = result.loads[0].rows.find(entry => entry.label === result.governing.check);
  assert.ok(row && ![STATES.linksRequired, STATES.notRequired].includes(row.status), result.governing.check);
});

test('drops at edge and corner columns: clipped drop, Fig. 6.15/6.20 perimeters by hand', () => {
  const edge = calculateDesign(EXAMPLES.find(item => item.id === 'edge-drop').input);
  assert.equal(edge.head.extents.xMax, 250);
  const [inner, outer] = edge.head.sections;
  close(inner.u1, 500 + 2 * 500 + Math.PI * 720, 1e-3); // c2 + 2c1 + π·2d_H
  close(outer.u1, 2400 + 2 * 1450 + Math.PI * 420, 1e-3); // drop 1450 × 2400 flush with the edge
  const corner = calculateDesign(EXAMPLES.find(item => item.id === 'corner-drop').input);
  close(corner.head.sections[0].u1, 1000 + (Math.PI / 2) * 720, 1e-3);
  close(corner.head.sections[1].u1, 2900 + (Math.PI / 2) * 420, 1e-3);
  assert.ok(corner.layout.layers.every(layer => layer.offset <= 950 - 25));
  // A drop reaching an edge the column is set back from is not covered.
  const setBack = structuredClone(EXAMPLES.find(item => item.id === 'edge-drop').input);
  setBack.slab.xMax = 600;
  setBack.column.position = 'internal';
  assert.equal(calculateDesign(setBack).status, STATES.unsupportedGeometry);
});
