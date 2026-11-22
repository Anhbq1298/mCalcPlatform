import assert from 'node:assert/strict';
import test from 'node:test';
import { basicPerimeter, loadedPerimeter, offsetOfPerimeter, perimeterAtOffset, sectionModulusCircular, sectionModulusRect } from '../src/geometry.mjs';

const rect = (cx, cy) => ({ shape: 'rectangular', position: 'internal', cx, cy });
const circ = diameter => ({ shape: 'circular', position: 'internal', diameter });

// Numerical ∫|x| dl over the rounded rectangle at offset r (eccentricity along x, c1 = cx).
// Straight sides are subdivided so that the |x| integrand is resolved where it changes sign.
function numericW1(c1, c2, r, segments = 4000) {
  const a = c1 / 2;
  const b = c2 / 2;
  const points = [];
  const line = (from, to) => {
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      points.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    }
  };
  const arc = (cx, cy, from, to) => {
    for (let i = 0; i <= segments; i += 1) {
      const t = from + ((to - from) * i) / segments;
      points.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
  };
  line([a + r, -b], [a + r, b]);
  arc(a, b, 0, Math.PI / 2);
  line([a, b + r], [-a, b + r]);
  arc(-a, b, Math.PI / 2, Math.PI);
  line([-a - r, b], [-a - r, -b]);
  arc(-a, -b, Math.PI, (3 * Math.PI) / 2);
  line([-a, -b - r], [a, -b - r]);
  arc(a, -b, (3 * Math.PI) / 2, 2 * Math.PI);
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    sum += ((Math.abs(x0) + Math.abs(x1)) / 2) * Math.hypot(x1 - x0, y1 - y0);
  }
  return sum;
}

test('basic perimeter matches the published CSI 300 × 900 internal column', () => {
  // CSI SAFE reports approximately 5,139.468 mm; closed form 2(300 + 900) + 4π·218.
  assert.ok(Math.abs(basicPerimeter(rect(300, 900), 218) - 5139.468) < 0.01);
});

test('basic perimeter matches Dlubal VE 1023 (450 × 450, d = 190) to rounding', () => {
  // Dlubal reports u1 = 4.188 m.
  assert.ok(Math.abs(basicPerimeter(rect(450, 450), 190) - 4188) < 1);
});

test('circular perimeters use π(D + 4d) and π(D + 2r) with consistent inverses', () => {
  const column = circ(500);
  assert.ok(Math.abs(basicPerimeter(column, 200) - Math.PI * 1300) < 1e-9);
  assert.ok(Math.abs(loadedPerimeter(column) - Math.PI * 500) < 1e-9);
  const u = perimeterAtOffset(column, 350);
  assert.ok(Math.abs(offsetOfPerimeter(column, u) - 350) < 1e-9);
});

test('rectangular inverse offset recovers the radial distance from the column face', () => {
  const column = rect(300, 900);
  const u = perimeterAtOffset(column, 1218);
  assert.ok(Math.abs(offsetOfPerimeter(column, u) - 1218) < 1e-9);
});

test('closed-form W1 agrees with numerical integration of |e| dl (convergence)', () => {
  for (const [c1, c2, d] of [[300, 900, 218], [450, 450, 190], [900, 300, 218]]) {
    const closed = sectionModulusRect(c1, c2, d);
    const coarse = numericW1(c1, c2, 2 * d, 500);
    const fine = numericW1(c1, c2, 2 * d, 4000);
    assert.ok(Math.abs(fine - closed) / closed < 1e-6, `W1 mismatch for ${c1}×${c2}`);
    assert.ok(Math.abs(coarse - closed) / closed < 1e-4, 'coarse discretisation should converge');
  }
});

test('circular W1 equals 4R² for R = D/2 + 2d', () => {
  const R = 250 + 2 * 200;
  assert.ok(Math.abs(sectionModulusCircular(500, 200) - 4 * R * R) < 1e-6);
});

test('W1 depends on the eccentricity direction: a 300 × 900 column differs from 900 × 300 about the same axis', () => {
  const along300 = sectionModulusRect(300, 900, 218);
  const along900 = sectionModulusRect(900, 300, 218);
  assert.ok(Math.abs(along300 - along900) > 1e5);
  // A square column is symmetric about both axes.
  assert.equal(sectionModulusRect(400, 400, 200), sectionModulusRect(400, 400, 200));
});

import { pathExtent, pathPolyline, pointAt, openingDistance, distanceToColumn } from '../src/geometry.mjs';

test('pointAt walks the exact path: every point lies at offset r from the loaded area', () => {
  for (const column of [rect(300, 900), circ(500)]) {
    const r = 150;
    const u = perimeterAtOffset(column, r);
    for (let i = 0; i < 97; i += 1) {
      const p = pointAt({ ...column, rotation: 0, x: 0, y: 0 }, r, (i * u) / 97);
      assert.ok(Math.abs(distanceToColumn({ ...column, rotation: 0, x: 0, y: 0 }, p) - r) < 1e-6);
    }
  }
});

test('drawn polyline converges to the exact perimeter length', () => {
  const column = { ...rect(300, 900), rotation: 30, x: 100, y: -50 };
  const points = pathPolyline(column, 436);
  let length = 0;
  for (let i = 1; i < points.length; i += 1) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  const exact = perimeterAtOffset(column, 436) - 0; // polyline is open at the start point
  assert.ok(Math.abs(length - exact) / exact < 1e-3);
});

test('path extent and opening distance are exact for simple cases and rotation-aware', () => {
  const column = { ...rect(400, 400), rotation: 0, x: 0, y: 0 };
  assert.deepEqual(pathExtent(column, 100), { xMin: -300, xMax: 300, yMin: -300, yMax: 300 });
  assert.ok(Math.abs(openingDistance(column, { x: 700, y: 0, w: 200, h: 200 }) - 400) < 1e-6);
  const rotated = { ...column, rotation: 45 };
  assert.ok(Math.abs(pathExtent(rotated, 0).xMax - 200 * Math.SQRT2) < 1e-9);
});
