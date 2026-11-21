import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/calculate.mjs';
import { newDefaults } from '../src/inputs.mjs';
import { planSvg } from '../src/plan-view.mjs';
import { sectionSvg } from '../src/section-view.mjs';
import { buildScene } from '../src/view3d.mjs';
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
  assert.ok(svg.includes('u1 (2d)') && svg.includes('u_out,ef') && svg.includes('data-governing'));
  assert.ok(balanced(svg));
  // A leg outside the effective path (slab edge, opening, shadow) is drawn in the failure colour.
  const links = result.layout.links.map((link, index) => (index ? link : { ...link, legs: link.legs.map(leg => ({ ...leg, effective: false, reason: 'Outside slab' })) }));
  const marked = planSvg({ ...result, layout: { ...result.layout, links } });
  assert.ok(marked.includes('stroke="#b3261e"') && marked.includes('Ineffective leg'));
  assert.ok(!planSvg(result).includes('Ineffective leg'));
});

test('section shows every layer on both sides with dashed (unverified) bends', () => {
  const result = design();
  const svg = sectionSvg(result);
  assert.equal((svg.match(/data-layer="/g) || []).length, 2 * result.layout.layers.length);
  assert.ok(svg.includes('anchorage requires detailing confirmation'));
  assert.ok(balanced(svg));
});

test('3D scene contains slab, column, links per leg and load arrows', () => {
  const result = design(input => { input.beta = { method: 'moment' }; input.loads = [{ name: 'A', V: 700, Mx: 30, My: 60 }]; });
  const scene = buildScene(result);
  const legs = result.layout.links.reduce((sum, link) => sum + link.legs.length, 0);
  assert.equal(scene.lines.filter(line => line.kind === 'link' && line.points.length === 2 && line.points[0].z !== line.points[1].z).length, legs);
  assert.ok(scene.lines.some(line => line.label?.startsWith('M_x')) && scene.lines.some(line => line.label?.startsWith('M_y')));
  assert.ok(scene.faces.length >= 18);
});

test('worksheet report is a valid Canvas document with drawings, schedule and limitations', () => {
  const result = design();
  const doc = buildWorksheet(result, { pageHeight: 1123, pageGap: 48, designName: 'PS-01' });
  assert.equal(doc.format, 'calccanvas');
  assert.equal(new Set(doc.shapes.map(shape => shape.id)).size, doc.shapes.length);
  assert.equal(doc.shapes.filter(shape => shape.type === 'image').length, 2);
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
