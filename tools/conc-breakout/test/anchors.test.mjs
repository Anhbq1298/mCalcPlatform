import assert from 'node:assert/strict';
import test from 'node:test';
import { coneResistance, edgeResistance, pulloutResistance, steelShear, concreteInteraction, shankArea } from '../src/anchors.mjs';
import { anchorage } from '../src/rebar.mjs';
import { concreteProps, studFactors } from '../src/materials.mjs';

const close = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const far = { top: null, bottom: null, left: null, right: null };

test('INFASO DM II Example 9.4 and 9.5: basic cone resistance N0_Rk,c (k1 = 12.7)', () => {
  close(coneResistance([{ x: 0, y: 0 }], { hef: 200, fck: 30, cracked: false, dense: false, edges: far }).N0 / 1e3, 196.8, 0.06, '9.4'); // published value rounded
  close(coneResistance([{ x: 0, y: 0 }], { hef: 165, fck: 30, cracked: false, dense: false, edges: far }).N0 / 1e3, 147.4, 0.05, '9.5');
});

test('INFASO DM II Example 9.5: stud steel resistances with the published partial factors', () => {
  close(2 * shankArea(22) * 470 / 1.5 / 1e3, 238.1, 0.5, 'N_Rd,s'); // published A_s = 380 mm²
  close(2 * steelShear({ d: 22, fuk: 470, ductile: true }).VRk / 1.25 / 1e3, 171.5, 0.6, 'V_Rd,s');
});

test('EN 1992-4 Table 4.1 partial factors for headed studs', () => {
  const g = studFactors(450, 350);
  close(g.MsN, 1.2 * 450 / 350, 1e-12, 'γMs,N');
  close(g.MsV, 450 / 350, 1e-12, 'γMs,V');
  assert.equal(studFactors(400, 350).MsN, 1.4);
  assert.equal(studFactors(400, 350).MsV, 1.5); // f_yk/f_uk > 0.8
  assert.equal(studFactors(500, 300).MsV, 500 / 300);
});

test('group cone: exact projected area of a 2 × 2 group without edges', () => {
  const studs = [-100, 100].flatMap(y => [-100, 100].map(x => ({ x, y, F: 1 })));
  close(coneResistance(studs, { hef: 165, fck: 30, cracked: false, dense: false, edges: far }).NRk, 290636.05, 0.5, 'N_Rk,c');
});

test('cone area clips at edges, ψ_s,N and h′_ef for three close edges', () => {
  const one = coneResistance([{ x: 0, y: 0 }], { hef: 200, fck: 30, cracked: true, dense: false, edges: { ...far, bottom: 150 } });
  close(one.Ac, 600 * (150 + 300), 1e-9, 'A_c,N');
  close(one.psiS, 0.7 + 0.3 * 150 / 300, 1e-12, 'ψs,N');
  const narrow = coneResistance([{ x: 0, y: 0 }], { hef: 200, fck: 30, cracked: true, dense: false, edges: { top: null, bottom: 150, left: 120, right: 180 } });
  close(narrow.hef, 180 / 300 * 200, 1e-9, "h'_ef");
});

test('ψ_ec,N from an eccentric force resultant', () => {
  const studs = [{ x: 0, y: -100, F: 0 }, { x: 0, y: 100, F: 10 }];
  const r = coneResistance(studs, { hef: 100, fck: 30, cracked: true, dense: true, edges: far });
  close(r.psiEc, 1 / (1 + 2 * 100 / 300), 1e-12, 'ψec,N');
});

test('concrete edge breakout chain, Eq. 7.40–7.46 (hand calculation)', () => {
  const row = [{ x: -100, y: -100 }, { x: 100, y: -100 }];
  const r = edgeResistance(row, { d: 22, hef: 165, fck: 30, cracked: true, thickness: 400, edges: { ...far, bottom: 300 }, edgeReinforcement: false });
  close(r.c1, 200, 1e-9, 'c1');
  close(r.V0, 48427.55, 0.05, 'V0_Rk,c');
  close(r.Ac / r.A0, 4 / 3, 1e-12, 'A_c,V/A0');
  close(r.VRk, 64570.07, 0.05, 'V_Rk,c');
});

test('narrow thin member uses c1′', () => {
  const row = [{ x: 0, y: 0 }];
  const r = edgeResistance(row, { d: 22, hef: 165, fck: 30, cracked: true, thickness: 200, edges: { top: null, bottom: 600, left: 300, right: 300 }, edgeReinforcement: false });
  close(r.c1, 300 / 1.5, 1e-9, "c1'");
});

test('pull-out uses k2 and the head bearing area', () => {
  const r = pulloutResistance({ d: 22, dh: 35, fck: 30, cracked: true });
  close(r.NRk, 7.5 * Math.PI / 4 * (35 ** 2 - 22 ** 2) * 30, 1e-6, 'N_Rk,p');
});

test('concrete interaction caps each ratio at 1', () => {
  assert.equal(concreteInteraction(2, 0), 1);
  close(concreteInteraction(0.5, 0.5), 2 * 0.5 ** 1.5, 1e-12, 'interaction');
});

test('EN 1992-1-1 anchorage of Ø16 in C30/37 at f_yd (hand calculation)', () => {
  const concrete = concreteProps(30, 1);
  const r = anchorage({ d: 16, sigma: 500 / 1.15, concrete, goodBond: true, shape: 'straight', cd: 0, provided: 600 });
  close(r.fbd, 3.0413, 1e-4, 'f_bd');
  close(r.lbRqd, 571.84, 0.01, 'l_b,rqd');
  assert.equal(r.alpha1, 1);
  close(anchorage({ d: 16, sigma: 434.8, concrete, goodBond: true, shape: 'bent', cd: 60, provided: 600 }).alpha1, 0.7, 0, 'α1');
});
