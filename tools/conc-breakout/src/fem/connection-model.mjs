// Flexible-plate model of the embedded plate (out-of-plane: N_Ed and M_Ed only; shear stays with the
// studs as in the rigid model). Units: N, mm, MPa.
// Components (engineering model, see help §2b):
// - Plate: MITC4 plate elements, E = 210 GPa, ν = 0.3, thickness t.
// - Steel member: rigid footprint over both flanges and the web line (I-section assumed), tied to a
//   master node that carries N and M.
// - Welded bars: tension-only springs E_s·A_s / l_e, l_e = ½·min(l_b,prov, l_b,rqd(f_yd)).
// - Headed studs (when they share tension): tension-only springs E_s·A_s / h_ef (steel shank only;
//   stiffer than the real stud, so stud tension is not underestimated).
// - Concrete: compression-only Winkler springs k_c = E_cm / (1.275·√(B·H)) per unit area, from the
//   concrete-in-compression stiffness coefficient of EN 1993-1-8 Table 6.11 (k13) over the plate.
import { solveShell } from './shell-system.mjs';
import { anchorage } from '../rebar.mjs';
import { createMesh, gridLines, solvePlate } from './plate-system.mjs';

export const E_CM = fck => 22000 * ((fck + 8) / 10) ** 0.3; // EN 1992-1-1 Table 3.1
const EPS = 1e-6;

export function meshSize(plate) {
  return Math.min(25, Math.max(6, Math.min(plate.B, plate.H) / 24));
}

function nodesNear(mesh, x, y, r) {
  const near = mesh.nodes.filter(node => Math.hypot(node.x - x, node.y - y) <= r + EPS);
  return near.length ? near : [mesh.nodes.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a))];
}

export function solveFlexible(input, elements, concrete, N, M, spatial = null) {
  const { plate, member, rebars, studs } = input;
  const h = spatial?.size ?? meshSize(plate);
  const webHalf = spatial ? (member.tw ?? (member.profile === 'hss' ? member.tf : 0)) / 2 : 0;
  const webInner = member.b / 2 - 2 * webHalf;
  const webKeys = spatial && member.profile === 'hss' ? [-webInner, webInner] : [-webHalf, webHalf];
  const xs = gridLines(-plate.B / 2, plate.B / 2, [0, -member.b / 2, member.b / 2, ...webKeys, ...elements.map(e => e.x)], h);
  const ys = gridLines(-plate.H / 2, plate.H / 2, [0, ...[1, -1].flatMap(s => [s * member.h / 2, s * (member.h / 2 - member.tf)]), ...elements.map(e => e.y)], h);
  if (xs.length * ys.length > 6000) throw new Error('Plate mesh exceeds the solver limit. Increase the mesh size.');
  const mesh = createMesh(xs, ys);
  const slaves = new Set(mesh.nodes.filter(node => Math.abs(node.x) <= member.b / 2 + EPS && (
    (Math.abs(node.y) >= member.h / 2 - member.tf - EPS && Math.abs(node.y) <= member.h / 2 + EPS)
    || ((spatial && member.profile === 'hss' ? Math.abs(node.x) >= webInner - EPS : Math.abs(node.x) <= webHalf + EPS)
      && Math.abs(node.y) <= member.h / 2 + EPS))).map(node => node.id));
  const Ecm = E_CM(concrete.fck);
  const kc = Ecm / (1.275 * Math.sqrt(plate.B * plate.H));
  const springs = mesh.nodes.map(node => ({ node: node.id, k: kc * mesh.area[node.id], mode: 'compression', owner: 'concrete' }));
  const stiffness = new Map();
  for (const e of elements) {
    let k;
    if (e.kind === 'rebar') {
      const lb = anchorage({ d: e.d, sigma: rebars.fyk / 1.15, concrete, goodBond: rebars.goodBond, shape: 'straight', cd: 0, provided: rebars.length });
      k = 200000 * e.area / (0.5 * Math.min(rebars.length, lb.lbRqd));
    } else {
      k = 200000 * e.area / studs.hef;
    }
    k = e.axialK ?? k;
    stiffness.set(e.id, k);
    const r = Math.max(e.kind === 'rebar' ? e.d / 2 + Math.SQRT2 * rebars.throat : studs.d / 2, 1.01 * h);
    const near = nodesNear(mesh, e.x, e.y, spatial ? EPS : r);
    for (const node of near) springs.push({ node: node.id, k: k / near.length, mode: 'tension', owner: e.id });
  }
  const system = { mesh, t: plate.t, E: 210000, nu: 0.3, slaves, springs };
  for (const element of spatial?.supports ?? []) {
    if (!(element.shearK > 0 && Number.isFinite(element.shearK))) throw new Error('Invalid stud shear stiffness.');
  }
  const supports = spatial?.supports?.map(e => ({
    id: e.id, x: e.x, y: e.y, k: e.shearK, node: nodesNear(mesh, e.x, e.y, EPS)[0].id,
  }));
  const result = supports?.length ? solveShell({
    ...system, shearSupports: supports, load: { ...spatial, N, Mx: M },
  }) : solvePlate({ ...system, masterLoad: [N, M, -(spatial?.My ?? 0)], allActive: Boolean(spatial) });
  const byOwner = new Map();
  for (const s of result.forces) byOwner.set(s.owner, (byOwner.get(s.owner) ?? 0) + s.F);
  const tensions = elements.map(e => ({ ...e, F: Math.max(byOwner.get(e.id) ?? 0, 0), k: stiffness.get(e.id) }));
  const bearing = result.forces.filter(s => s.owner === 'concrete' && s.active);
  const C = bearing.reduce((sum, s) => sum + s.F, 0);
  const yC = C > 0 ? bearing.reduce((sum, s) => sum + s.F * mesh.nodes[s.node].y, 0) / C : null;
  const pressures = bearing.map(s => s.F / mesh.area[s.node]);
  const T = tensions.reduce((sum, e) => sum + e.F, 0);
  const contact = bearing.map(s => ({ ...mesh.nodes[s.node], F: s.F, pressure: s.F / mesh.area[s.node] }));
  const Tx = tensions.reduce((sum, e) => sum + e.F * e.x, 0);
  const Cx = contact.reduce((sum, e) => sum + e.F * e.x, 0);
  const Ty = tensions.reduce((sum, e) => sum + e.F * e.y, 0);
  const yT = T > 0 ? Ty / T : null;
  const vm = result.elements.reduce((best, e) => (e.vm > best.vm ? e : best), result.elements[0]);
  return {
    method: 'fem', C, yC, T, yT, lever: yT !== null && yC !== null ? yT - yC : null,
    membrane: result.membrane,
    allCompression: T <= 1e-6 && C > 0, tensionOnly: C <= 1e-6 && T > 0, tensions,
    residual: { Fz: T - C - N, Mx: Ty - C * (yC ?? 0) - M, My: Cx - Tx - (spatial?.My ?? 0) },
    fem: {
      mesh, h, kc, Ecm, contact, w: result.w, master: result.master, iterations: result.iterations, converged: result.converged,
      dofs: result.dofs, slaves, pMax: pressures.length ? Math.max(...pressures) : 0,
      vmMax: vm.vm, vmAt: { x: vm.x, y: vm.y }, elements: result.elements, wMax: Math.max(...result.w), wMin: Math.min(...result.w),
      contactArea: bearing.reduce((sum, s) => sum + mesh.area[s.node], 0),
    },
  };
}
