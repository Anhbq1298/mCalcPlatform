import test from 'node:test';
import assert from 'node:assert/strict';
import { buildColumnReport } from '../src/report.mjs';

test('builds an editable paginated report from column results', () => {
  const data = {
    gov: { name: '<ULS>', pass: false, ratio: 1.24 }, basis: [['Code', 'EC2']],
    materials: [['Concrete', 'C30/37']], geometry: [['Section', '600 × 600 mm']],
    bars: Array.from({ length: 75 }, (_, i) => [i + 1, 0, 0, 'T25', 491]),
    cases: [['ULS', 100, 20, 0, 1.24, 'Fails', 0, 90, 18]], range: '90 kN',
  };
  const report = buildColumnReport({ data, headers: {
    bars: ['#', 'X', 'Y', 'Bar', 'Area'], cases: ['Case', 'P', 'Mx', 'My', 'D/C', 'Check', 'Angle', 'NRd', 'MRd'],
  }, images: { section: { jpg: 'data:image/jpeg;base64,AA==', w: 200, h: 100 } } });
  assert.equal(report.version, 3);
  assert.ok(report.settings.pages > 1);
  assert.ok(report.shapes.some(s => s.type === 'text' && s.props.html.includes('&lt;ULS&gt;') && s.props.html.includes('1.240')));
  assert.ok(report.shapes.some(s => s.type === 'image'));
  const bars = report.shapes.filter(s => s.type === 'table' && s.props.columns === 5);
  assert.equal(bars.flatMap(s => s.props.cells.slice(1)).length, 75);
  assert.ok(report.shapes.every(s => s.y % 1171 + s.props.h <= 1057));
});
