import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/connection.mjs';
import { calculationSheet } from '../src/calculation-sheet.mjs';
import { defaults } from '../src/inputs.mjs';

const beam = { ...defaults, name: 'UB 533x210x92' };
const input = { ...defaults, rows: 4, restrained: true, notchLength: 180, supportThickness: 10 };
const sheetFor = changes => {
  const layout = { ...input, ...changes };
  return calculationSheet(layout, beam, calculate(layout, beam));
};
const check = (sheet, key) => sheet.sections.find(item => item.key === key);

test('the worksheet follows the active support face for square and skewed column joints', () => {
  for (const [support, face] of [['column-web', 'I/H column web'], ['column-flange', 'I/H column flange']]) {
    const square = sheetFor({ support, notchTop: 45 });
    assert.equal(square.title, 'Beam to column · ' + face + ' · Square connection');
    assert.equal(check(square, 5).status, 'Not applicable');
    assert.equal(check(square, 10).status, support === 'column-web' ? 'Partial check' : 'Not applicable');

    const skew = sheetFor({ support, skew: -20 });
    assert.equal(skew.title, 'Beam to column · ' + face + ' · Skewed -20°');
    assert.equal(check(skew, 8).status, 'Open');
    assert.ok(check(skew, 2).steps.some(step => step.title.includes('Bolt shear')));
  }
});

test('single and double notches show reduced geometry with scope-specific check statuses', () => {
  for (const [top, bottom, title] of [[45, 0, 'Top notch'], [0, 45, 'Bottom notch'], [45, 45, 'Double notch']]) {
    const square = sheetFor({ notchTop: top, notchBottom: bottom });
    assert.match(square.title, new RegExp(title));
    assert.equal(check(square, 5).status, 'Calculated');
    assert.equal(check(square, 6).status, 'Calculated');
    assert.ok(check(square, 5).steps.some(step => step.equations.length > 2));

    const skew = sheetFor({ notchTop: top, notchBottom: bottom, skew: 15, restrained: false });
    assert.match(skew.title, new RegExp(title + ' · Skewed'));
    assert.equal(check(skew, 5).status, 'Open');
    assert.equal(check(skew, 7).status, 'Open');
    assert.ok(skew.geometry.some(step => step.title.includes('supported beam notch')));
    assert.ok(!skew.checks.some(check => check.name.includes('notch shoulder')));
  }
});
