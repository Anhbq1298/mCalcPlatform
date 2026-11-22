// Drop panels / column heads (§6.4.2(8)–(11)), the example set, and the LaTeX label renderer.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, EXAMPLE_CARDS, EXAMPLES } from '../src/examples.mjs';
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

test('mixed drops are checked both ways; unsupported drop configurations are reported', () => {
  // l_H straddles 2h_H: checked both as Fig. 6.17 and Fig. 6.18, the governing one reported with a note.
  const mixed = calculateDesign(base({ lx: 2400, ly: 1000, depth: 200 }));
  assert.notEqual(mixed.status, STATES.unsupportedGeometry);
  assert.ok(mixed.notes[0].includes('checked as Fig. 6.17 and as Fig. 6.18'));
  const small = calculateDesign(base({ lx: 2400, ly: 1000, depth: 200 }), 'small');
  const large = calculateDesign(base({ lx: 2400, ly: 1000, depth: 200 }), 'large');
  assert.ok(mixed.governing.ur >= Math.min(small.governing?.ur ?? 0, large.governing?.ur ?? 0) - 1e-9);
  const edge = base({ lx: 1000, ly: 1000, depth: 200 }, { slab: { h: 250, depthMode: 'explicit', dx: 215, dy: 205, cover: 25, xMin: -6000, xMax: 200, yMin: -6000, yMax: 6000 } });
  edge.column.position = 'edge';
  const edgeResult = calculateDesign(edge); // links beyond the drop are now designed, not refused
  assert.notEqual(edgeResult.status, STATES.unsupportedGeometry);
  assert.ok(edgeResult.layout.layers.length && edgeResult.layout.layers.every(layer => layer.zone === 'slab'));
  assert.equal(calculateDesign(base({ shape: 'circular', diameter: 1200, depth: 200 })).status, STATES.unsupportedGeometry); // circular head on rectangular column
  assert.equal(calculateDesign(base({ lx: 300, ly: 1000, depth: 200 })).status, STATES.incomplete); // head smaller than column
});

test('six cards with one starting design each; every reference case gives its intended status', () => {
  assert.equal(EXAMPLE_CARDS.length, 6);
  assert.equal(EXAMPLES.length, 6);
  for (const example of CASES) assert.equal(calculateDesign(example.input).status, example.expect, example.id);
});

test('LaTeX labels render to MathML and plain text', () => {
  assert.equal(texToMathML('V_{Ed}'), '<math><msub><mi>V</mi><mi mathvariant="normal">Ed</mi></msub></math>');
  assert.equal(texToMathML('A_{s,x}'), '<math><msub><mi>A</mi><mrow><mi>s</mi><mo>,</mo><mi>x</mi></mrow></msub></math>');
  assert.equal(labelText('$\\sigma_{cx}$ (MPa)'), 'σ_cx (MPa)');
  assert.equal(labelText('$V_{Ed}$'), 'V_Ed');
});

test('the governing check of a drop design is never an informational row', async () => {
  const { exampleById } = await import('../src/examples.mjs');
  const example = exampleById('drop-large');
  const result = calculateDesign(example.input);
  const row = result.loads[0].rows.find(entry => entry.label === result.governing.check);
  assert.ok(row && ![STATES.linksRequired, STATES.notRequired].includes(row.status), result.governing.check);
});

test('drops at edge and corner columns: clipped drop, Fig. 6.15/6.20 perimeters by hand', () => {
  const edge = calculateDesign(CASES.find(item => item.id === 'edge-drop').input);
  assert.equal(edge.head.extents.xMax, 250);
  const [inner, outer] = edge.head.sections;
  close(inner.u1, 500 + 2 * 500 + Math.PI * 720, 1e-3); // c2 + 2c1 + π·2d_H
  close(outer.u1, 2400 + 2 * 1450 + Math.PI * 420, 1e-3); // drop 1450 × 2400 flush with the edge
  const corner = calculateDesign(CASES.find(item => item.id === 'corner-drop').input);
  close(corner.head.sections[0].u1, 1000 + (Math.PI / 2) * 720, 1e-3);
  close(corner.head.sections[1].u1, 2900 + (Math.PI / 2) * 420, 1e-3);
  assert.ok(corner.layout.layers.every(layer => layer.offset <= 950 - 25));
  // A drop reaching an edge the column is set back from is not covered.
  const setBack = structuredClone(CASES.find(item => item.id === 'edge-drop').input);
  setBack.slab.xMax = 600;
  setBack.column.position = 'internal';
  assert.equal(calculateDesign(setBack).status, STATES.unsupportedGeometry);
});

test('spacing groups expand to layers from the column face; old saves migrate', async () => {
  const { groupLayers, layersToGroups, restoreInputs } = await import('../src/inputs.mjs');
  const layers = groupLayers({ groups: [{ count: 1, spacing: 100, diameter: 10, shape: 'single', links: 12 }, { count: 3, spacing: 150, diameter: 10, shape: 'single', links: 16 }], omitted: { L3: [2] } });
  assert.deepEqual(layers.map(layer => layer.offset), [100, 250, 400, 550]);
  assert.deepEqual(layers[2].omitted, [2]);
  assert.deepEqual(layersToGroups(layers).map(g => [g.spacing, g.links]), [[100, 12], [150, 16], [150, 16], [150, 16]]); // one row per layer; no summary: link counts kept
  const rows = restoreInputs({ reinforcement: { mode: 'provided', groups: [{ count: 1, spacing: 100, diameter: 10, shape: 'single', st: 200 }, { count: 2, spacing: 150, diameter: 10, shape: 'single', st: 250 }] } }).reinforcement.groups;
  assert.deepEqual(rows.map(g => [g.spacing, g.st, g.count]), [[100, 200, undefined], [150, 250, undefined], [150, 250, undefined]]);
  const old = restoreInputs({ slab: { h: 260 }, head: { enabled: true, depth: 140 }, reinforcement: { mode: 'provided', layers: [{ offset: 80, diameter: 8, shape: 'single', links: 8, omitted: [1] }, { offset: 235, diameter: 8, shape: 'single', links: 8 }] } });
  assert.equal(old.head.thickness, 400);
  assert.deepEqual(old.reinforcement.groups.map(g => g.spacing), [80, 155]);
  assert.deepEqual(old.reinforcement.omitted, { L1: [1] });
});

test('large drop: provided links inside and beyond the drop are split by zone', () => {
  const groups = [{ count: 1, spacing: 100, diameter: 10, shape: 'single', links: 16 }, { count: 4, spacing: 150, diameter: 10, shape: 'single', links: 16 },
    { count: 1, spacing: 300, diameter: 10, shape: 'single', links: 40 }, { count: 2, spacing: 150, diameter: 10, shape: 'single', links: 40 }];
  const input = base({ lx: 2400, ly: 2400, thickness: 400 }, { column: { shape: 'rectangular', position: 'internal', cx: 500, cy: 500, rotation: 0, x: 0, y: 0 }, loads: [{ name: 'ULS 1', V: 1250, Mx: 0, My: 0 }] });
  input.reinforcement = { anchorage: { engaged: true }, mode: 'provided', groups };
  const result = calculateDesign(input);
  // l_H = 950, cover 25: s = 100…700 inside the drop, s = 1000, 1150, 1300 beyond it (t = 50, 200, 350).
  assert.deepEqual(result.layout.layers.map(layer => layer.zone), ['drop', 'drop', 'drop', 'drop', 'drop', 'slab', 'slab', 'slab']);
  assert.deepEqual(result.layout.layers.filter(l => l.zone === 'slab').map(l => l.pathOffset), [50, 200, 350]);
  assert.deepEqual(result.layout.layers.map(l => l.id), ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8']);
  const step = structuredClone(input);
  step.reinforcement.groups = [{ count: 1, spacing: 940, diameter: 10, shape: 'single', links: 16 }, { count: 1, spacing: 150, diameter: 10, shape: 'single', links: 16 }];
  assert.ok(calculateDesign(step).issues.some(issue => /drop edge step/.test(issue.message)));
});

test('rectangular head l_H ≤ 2h_H with links: equivalent-circle check, links on the head outline, results by the tool method', async () => {
  const { sectorCoverage } = await import('../src/head-mapped.mjs');
  const { exampleById } = await import('../src/examples.mjs');
  const result = calculateDesign(exampleById('drop-small-links').input);
  assert.equal(result.status, STATES.pass);
  const rows = result.loads[0].rows;
  for (const id of ['reinforced', 'outer', 'sector']) assert.ok(rows.find(entry => entry.id === id).detail.includes('see Help'), id); // method stated
  assert.equal(rows.find(entry => entry.id === 'radial').status, STATES.pass); // detailing on the real geometry stays a normal check
  assert.ok(result.layout.layers.every(layer => layer.zone === 'slab' && layer.pathOffset < layer.offset));
  // r_cont = min(2d + 0.56·√(l1·l2), 2d + 0.69·l1) = 2·210 + 560 = 980 mm (Eq. 6.34)
  assert.equal(result.head.rcont.r, 980);
  // Sector mapping: 16 legs evenly round a circle give one leg per sector; one missing leg → empty sector.
  const legs = Array.from({ length: 16 }, (_, i) => ({ layerId: 'L1', diameter: 10, legs: [{ effective: true, x: Math.cos((i + 0.5) * Math.PI / 8), y: Math.sin((i + 0.5) * Math.PI / 8) }] }));
  const ok = sectorCoverage(legs, [{ id: 'L1' }], { x: 0, y: 0 }, 16 * 78.54)[0];
  assert.ok(Math.abs(ok.ur - 1) < 1e-3);
  assert.equal(sectorCoverage(legs.slice(1), [{ id: 'L1' }], { x: 0, y: 0 }, 100)[0].ur, Infinity);
});

test('tangential spacing s_t sets the link count per layer; Auto arrangement round-trips to s_t rows', async () => {
  const { cenDefaults, layersToGroups } = await import('../src/inputs.mjs');
  const { calculate } = await import('../src/calculate.mjs');
  const { linkCentres } = await import('../src/layout.mjs');
  // Closed path u = 3000, s_t = 280 → ceil(10.71) = 11 links; open interval 1000 → ceil(3.57) = 4 links.
  assert.equal(linkCentres({ intervals: [{ s0: 0, s1: 3000, closed: true }], u: 3000, total: 3000 }, 0, 0, 280).length, 11);
  assert.deepEqual(linkCentres({ intervals: [{ s0: 0, s1: 1000 }], u: 4000, total: 1000 }, 0, 0, 280), [125, 375, 625, 875]);
  const input = cenDefaults();
  input.beta.confirmed = true;
  input.loads = [{ name: 'ULS 1', V: 800, Mx: 0, My: 0 }];
  const auto = calculate(input);
  const groups = layersToGroups(auto.layout.layers, auto.layout.summary);
  assert.ok(groups.every(group => group.st > 0 && group.links === undefined));
  const provided = calculate({ ...input, reinforcement: { ...input.reinforcement, mode: 'provided', groups, omitted: {} } });
  // Every rebuilt layer has at least the designed links, every gap within s_t.
  provided.layout.summary.forEach((layer, i) => assert.ok(layer.physicalLinks >= auto.layout.summary[i].physicalLinks, layer.id));
  assert.equal(provided.status, auto.status);
});

test('drop at edge and corner columns: β outside the drop is capped at the column β, so the drop never needs more links than no drop', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const { newDefaults } = await import('../src/inputs.mjs');
  const steel = r => r.layout.links.reduce((s, l) => s + l.legs.length * Math.PI * l.diameter ** 2 / 4, 0);
  for (const [position, V, Mx, My] of [['edge', 500, 60, -20], ['corner', 260, -30, -30]]) for (const arrangement of ['grid', 'radial']) {
    const input = newDefaults();
    input.column = { ...input.column, cx: 400, cy: 400, position, x: 3800, y: position === 'corner' ? 3800 : 0 };
    input.reinforcement = { ...input.reinforcement, enabled: true, arrangement };
    input.loads = [{ name: 'U', V, Mx, My }];
    const flat = calculateDesign(input);
    const drop = calculateDesign({ ...input, head: { ...input.head, enabled: true, lx: 2000, ly: 2000, thickness: 400 } });
    assert.equal(drop.status, 'Pass');
    assert.ok(steel(drop) < steel(flat), `${position} ${arrangement}: drop ${steel(drop)} ≥ flat ${steel(flat)}`);
  }
});

test('radial arrangement in a drop: with the option ticked, radial lines continue to the drop edge (detailing links)', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const { newDefaults } = await import('../src/inputs.mjs');
  const input = newDefaults();
  input.column = { ...input.column, cx: 400, cy: 400 };
  input.head = { ...input.head, enabled: true, lx: 2000, ly: 2000, thickness: 400 };
  input.reinforcement = { ...input.reinforcement, enabled: true, arrangement: 'radial', dropFill: true };
  input.loads = [{ name: 'U', V: 1500, Mx: 20, My: 40 }];
  const result = calculateDesign(input);
  assert.equal(result.status, 'Pass');
  const fill = result.layout.links.filter(link => link.edge);
  assert.ok(fill.length > 0);
  const edge = 1000 - input.slab.cover; // drop half-width less cover, local to the column centre
  assert.ok(fill.every(link => Math.abs(link.position.x) <= edge + 1e-6 && Math.abs(link.position.y) <= edge + 1e-6));
  assert.ok(Math.max(...fill.map(link => Math.max(Math.abs(link.position.x), Math.abs(link.position.y)))) >= edge - 1e-6);
});

test('links out to the drop edge are an option, off by default', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const { newDefaults } = await import('../src/inputs.mjs');
  const input = newDefaults();
  assert.equal(input.reinforcement.dropFill, false);
  input.code = { ...input.code, profile: 'cen' }; // outside the SG compact link zone
  input.column = { ...input.column, cx: 400, cy: 400 };
  input.head = { ...input.head, enabled: true, lx: 2000, ly: 2000, thickness: 400 };
  input.loads = [{ name: 'U', V: 1200, Mx: 20, My: 40 }];
  for (const arrangement of ['grid', 'radial']) {
    const off = calculateDesign({ ...input, reinforcement: { ...input.reinforcement, enabled: true, arrangement } });
    const on = calculateDesign({ ...input, reinforcement: { ...input.reinforcement, enabled: true, arrangement, dropFill: true } });
    assert.equal(off.status, 'Pass');
    assert.equal(off.layout.links.filter(link => link.edge).length, 0);
    assert.ok(on.layout.links.length > off.layout.links.length, arrangement);
  }
});

test('hint: the smallest drop that needs no links in the slab around it', async () => {
  const { calculateDesign } = await import('../src/head.mjs');
  const { newDefaults } = await import('../src/inputs.mjs');
  const input = newDefaults();
  input.column = { ...input.column, cx: 400, cy: 400 };
  input.head = { ...input.head, enabled: true, lx: 2000, ly: 2000, thickness: 400 };
  input.reinforcement = { ...input.reinforcement, enabled: true };
  input.loads = [{ name: 'U', V: 1500, Mx: 20, My: 40 }];
  const note = calculateDesign(input).notes.find(n => n.startsWith('Links are needed in the slab around the drop'));
  const [, lx, ly] = note.match(/(\d+) × (\d+)/).map(Number);
  const ext = l => calculateDesign({ ...input, head: { ...input.head, lx: l, ly: l } }).loads[0].rows.find(r => r.id === 'ext-concrete').ur;
  assert.equal(lx, ly);
  assert.ok(ext(lx) <= 1 && ext(lx - 50) > 1, `${lx}: ${ext(lx)}, ${ext(lx - 50)}`);
});
