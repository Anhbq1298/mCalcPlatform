import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/calculate.mjs';
import { newDefaults } from '../src/inputs.mjs';
import { planSvg } from '../src/plan-view.mjs';
import { sectionSvg } from '../src/section-view.mjs';
import { buildWorksheet } from '../src/worksheet.mjs';

const design = edit => {
  const input = newDefaults();
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
  assert.ok(svg.includes('anchorage requires detailing confirmation') && !svg.includes('stroke-dasharray="2.5 1.5"'));
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
  assert.ok(text.includes('Not supported') && text.includes('Requires confirmation'));
});

test('report for blocked input lists the issues and stops', () => {
  const result = calculate({ ...newDefaults(), loads: [] });
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
  const check = [...svg.matchAll(/check: β·v<tspan[^>]*>V<\/tspan> = ([0-9.]+)/g)].map(m => Number(m[1]));
  // Panel 2 is u1: the plastic peak and the Eq. 6.39 value agree to the printed 3 decimals.
  assert.ok(vmax.length >= 2 && check.length >= 2, svg.slice(0, 200));
  assert.ok(Math.abs(vmax[1] - check[1]) <= 0.0011, `${vmax[1]} vs ${check[1]}`);
});
