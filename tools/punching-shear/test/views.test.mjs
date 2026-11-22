import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/calculate.mjs';
import { cenDefaults } from '../src/inputs.mjs';
import { planSvg } from '../src/plan-view.mjs';
import { sectionSvg } from '../src/section-view.mjs';
import { buildWorksheet } from '../src/worksheet.mjs';

const design = edit => {
  const input = cenDefaults();
  input.beta.confirmed = true;
  input.loads = [{ name: 'ULS', V: 800, Mx: 0, My: 0 }];
  edit?.(input);
  return calculate(input);
};
const balanced = svg => (svg.match(/<g[\s>]/g) || []).length === (svg.match(/<\/g>/g) || []).length;

test('plan draws one selectable group per physical link and marks ineffective legs', () => {
  const result = design();
  const svg = planSvg(result, { selected: result.layout.links[0].id });
  assert.equal((svg.match(/data-link="/g) || []).length, result.layout.links.length);
  assert.ok(svg.includes('font-size="78%">1</tspan> (2d)') && svg.includes('font-size="78%">out,ef</tspan>') && svg.includes('data-governing'));
  assert.ok(balanced(svg));
  // A leg outside the effective path (slab edge, opening, shadow) is drawn in the failure colour.
  const links = result.layout.links.map((link, index) => (index ? link : { ...link, legs: link.legs.map(leg => ({ ...leg, effective: false, reason: 'Outside slab' })) }));
  const marked = planSvg({ ...result, layout: { ...result.layout, links } });
  assert.ok(marked.includes('data-ineffective') && marked.includes('Ineffective leg'));
  assert.ok(planSvg(result).includes('fill="#d32f2f"'), 'shear link legs are highlighted');
  assert.ok(!planSvg(result).includes('Ineffective leg'));
});

test('full section shows every layer on both sides', () => {
  const result = design();
  const svg = sectionSvg(result);
  assert.equal((svg.match(/data-layer="/g) || []).length, 2 * result.layout.layers.length);
  assert.ok(svg.includes('hook anchorage per §8.5') && !svg.includes('stroke-dasharray="2.5 1.5"'));
  assert.ok(balanced(svg));
});


test('worksheet report is a valid Canvas document with drawings, schedule and limitations', () => {
  const result = design();
  const doc = buildWorksheet(result, { pageHeight: 1123, pageGap: 48, designName: 'PS-01' });
  assert.equal(doc.format, 'calccanvas');
  assert.equal(new Set(doc.shapes.map(shape => shape.id)).size, doc.shapes.length);
  assert.equal(doc.shapes.filter(shape => shape.type === 'image').length, 5); // plan, loading, sections A–A and B–B, stress
  assert.ok(doc.shapes.some(shape => shape.type === 'table'));
  for (const shape of doc.shapes) {
    const page = Math.floor(shape.y / (1123 + 48));
    assert.ok(page < doc.settings.pages, 'shape outside the page count');
    assert.ok(shape.y - page * (1123 + 48) + (shape.props.h ?? 0) <= 1123, 'shape crosses a page boundary: ' + shape.id);
  }
  const text = doc.shapes.map(shape => shape.props.html ?? '').join(' ');
  assert.ok(text.includes('Not supported') && text.includes('Links are assumed to enclose the top and bottom flexural bars'));
});

test('report for blocked input lists the issues and stops', () => {
  const result = calculate({ ...cenDefaults(), loads: [] });
  const doc = buildWorksheet(result, { pageHeight: 1123, pageGap: 48 });
  assert.ok(doc.shapes.some(shape => (shape.props.html ?? '').includes('Add at least one load combination')));
  assert.equal(doc.shapes.filter(shape => shape.type === 'math').length, 0);
});

test('drop with links beyond the drop: worksheet and drawings build, slab layers drawn on the drop outline', async () => {
  const { exampleById } = await import('../src/examples.mjs');
  const { calculateDesign } = await import('../src/head.mjs');
  const { planSvg } = await import('../src/plan-view.mjs');
  const { sectionSvg } = await import('../src/section-view.mjs');
  const result = calculateDesign(exampleById('drop-through').input);
  assert.equal(result.status, 'Pass');
  assert.ok(result.layout.layers.some(layer => layer.zone === 'slab') && result.layout.layers.some(layer => layer.zone === 'drop'));
  const doc = buildWorksheet(result, { pageHeight: 1123, pageGap: 48, designName: 'drop' });
  assert.ok(doc.shapes.length > 10);
  assert.match(planSvg(result), /u_out,ef,ext|uout,ef,ext|DROP PANEL/);
  const section = sectionSvg(result);
  assert.match(section, /DROP PANEL 2000 × 2000/);
  assert.match(section, /data-layer="L6"/);
});

test('stress figure: plastic distribution, one moment → peak v_V + v_M at u1 equals β·v_V (Eq. 6.39)', async () => {
  const { exampleById } = await import('../src/examples.mjs');
  const { calculateDesign } = await import('../src/head.mjs');
  const { stressSvg } = await import('../src/stress-view.mjs');
  const input = structuredClone(exampleById('internal-moment').input);
  input.loads = [{ name: 'ULS 1', V: 600, Mx: 0, My: 90 }];
  const result = calculateDesign(input);
  const svg = stressSvg(result, { width: 720 });
  const vmax = [...svg.matchAll(/v<tspan[^>]*>max<\/tspan> = v<tspan[^>]*>V<\/tspan> \+ Σv<tspan[^>]*>M<\/tspan> = ([0-9.]+)/g)].map(m => Number(m[1]));
  const check = [...svg.matchAll(/Check: β·v<tspan[^>]*>V<\/tspan> = ([0-9.]+)/g)].map(m => Number(m[1]));
  // Panel 2 is u1: the plastic peak and the Eq. 6.39 value agree to the printed 3 decimals.
  assert.ok(vmax.length >= 2 && check.length >= 2, svg.slice(0, 200));
  assert.ok(Math.abs(vmax[1] - check[1]) <= 0.0011, `${vmax[1]} vs ${check[1]}`);
});

test('Help explains calculation methods and retains benchmark references', async () => {
  const { readFileSync } = await import('node:fs');
  const help = readFileSync(new URL('../help.html', import.meta.url), 'utf8');
  assert.ok(help.includes('9 How mPunchingShear calculates results'));
  assert.ok(help.includes('Ancon') && help.includes('JRC') && help.includes('Σ min(L<sub>i</sub>, 2d)'));
});

test('slab thickness and drop size change the result, the link arrangement and the drawings', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const { newDefaults } = await import('../src/inputs.mjs');
  const run = edit => { const input = newDefaults(); input.reinforcement.enabled = true; input.loads = [{ name: 'U', V: 800, Mx: 20, My: 40 }]; edit(input); return calculateDesign(input); };
  const views = r => [planSvg(r), sectionSvg(r, { axis: 'x' }), sectionSvg(r, { axis: 'y' })];
  const [thin, thick] = [run(i => { i.slab.h = 220; }), run(i => { i.slab.h = 300; })];
  assert.ok(thick.section.d > thin.section.d && thick.layout.links.length !== thin.layout.links.length);
  views(thin).forEach((svg, k) => assert.notEqual(svg, views(thick)[k]));
  const drop = size => run(i => { i.head = { ...i.head, enabled: true, sizeMode: 'absolute', shape: 'rectangular', lx: size, ly: size, thickness: 400 }; i.loads = [{ name: 'U', V: 1600, Mx: 20, My: 40 }]; });
  const [small, large] = [drop(2400), drop(3000)];
  assert.notEqual(small.layout.links.length, large.layout.links.length);
  views(small).forEach((svg, k) => assert.notEqual(svg, views(large)[k]));
});
