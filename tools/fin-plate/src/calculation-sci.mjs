import { gammaBolt } from './bolt-group.mjs';
const tex = String.raw;

export function sciSteps(input, result, { n, kn, times, ur }) {
  const steps = [];
  const { sci, weld, support, height } = result;
  const { vertical, thickness: t, plateFy: fy, plateFu: fu, rows, supportThickness: ts } = input;
  const factor = (value, divisor) => tex`\frac{${n(value)}}{${divisor}}`;
  const check = (name, capacity, equation) => ({
    title: name,
    equations: [equation, ur('shear', vertical, capacity, vertical / capacity)],
  });
  if (sci) {
    const { resistance, plate, stability, z } = sci;
    const { horizontal: ax, vertical: ay } = resistance;
    const group = result.group;
    const maxX = Math.max(...group.bolts.map(b => Math.abs(b.dx)));
    const maxY = Math.max(...group.bolts.map(b => Math.abs(b.dy)));
    steps.push({
      title: 'SCI P358 · Bolt group',
      note: 'The ratios qₓ and qᵧ express the corner-bolt force components per unit connection shear.',
      equations: [
        tex`q_x=\frac{z|\Delta y|_{\max}}{J}=\frac{${n(z)}\times${n(maxY)}}{${n(group.polar)}}=${n(ax, 6)}`,
        tex`q_y=\frac1n+\frac{z|\Delta x|_{\max}}{J}=\frac1{${group.bolts.length}}+\frac{${n(z)}\times${n(maxX)}}{${n(group.polar)}}=${n(ay, 6)}`,
        tex`V_{Rd,\mathrm{bolt}}=\frac{F_{v,Rd}}{\sqrt{q_x^2+q_y^2}}=\frac{${n(result.shearResistance)}}{\sqrt{${n(ax, 6)}^2+${n(ay, 6)}^2}}=${n(resistance.bolt, 3)}${kn}`,
        ur('bolt group', vertical, resistance.bolt, vertical / resistance.bolt),
        ...[['web', resistance.web], ['plate', resistance.plate]].flatMap(([side, b]) => [
          tex`V_{Rd,\mathrm{${side}}}=\frac1{\sqrt{(q_x/F_{b,x,Rd})^2+(q_y/F_{b,y,Rd})^2}}=\frac1{\sqrt{(${n(ax, 6)}/${n(b.fx)})^2+(${n(ay, 6)}/${n(b.fy)})^2}}=${n(b.resistance, 3)}${kn}`,
          ur(side + ' bearing', vertical, b.resistance, vertical / b.resistance),
        ]),
      ],
    });
    const d0 = result.bolt.hole;
    steps.push(
      check('P358 gross plate shear', plate.gross, tex`V_{Rd,g}=\frac{htf_y}{10^3\times1.27\sqrt3}=\frac{${[height, t, fy].map(x => n(x)).join(times)}}{10^3\times1.27\sqrt3}=${n(plate.gross, 3)}${kn}`),
      check('P358 net plate shear', plate.net, tex`V_{Rd,n}=\frac{(h-n_rd_0)tf_u}{10^3\times1.1\sqrt3}=\frac{(${height}-${rows}\times${d0})\times${t}\times${fu}}{10^3\times1.1\sqrt3}=${n(plate.net, 3)}${kn}`),
      check('P358 plate block tearing', plate.block, tex`V_{Rd,b}=\frac1{10^3}\left(\frac{0.5f_u A_{nt}}{1.1}+\frac{f_y A_{nv}}{\sqrt3}\right)=\frac1{10^3}\left(\frac{0.5\times${fu}\times${n(plate.netTension)}}{1.1}+\frac{${fy}\times${n(plate.netShear)}}{\sqrt3}\right)=${n(plate.block, 3)}${kn}`),
    );
    const elastic = tex`V_{\mathrm{el}}=\frac{th^2 f_y}{6z\times 10^3}=\frac{${t}\times${height}^2\times${fy}}{6\times${n(z)}\times 10^3}=${n(t * height ** 2 * fy / (6e3 * z), 3)}${kn}`;
    if (plate.bending !== null) steps.push(check('P358 plate bending', plate.bending, elastic));
    if (stability.resistance !== null) {
      const cap = stability.resistance;
      const equations = [elastic];
      if (stability.type === 'long') equations.push(
        tex`\bar\lambda_{LT}=\frac{2.8}{86.8}\sqrt{\frac{x_1 h}{1.5t^2}}=\frac{2.8}{86.8}\sqrt{\frac{${n(group.bolts[0].x)}\times${height}}{1.5\times${t}^2}}=${n(stability.slenderness)}`,
        tex`\chi_{LT}=${n(stability.reduction)},\quad V_{Rd}=\min(V_{\mathrm{el}},\chi_{LT}V_{\mathrm{el}}/0.6)=${n(cap, 3)}${kn}`,
      );
      steps.push({ title: 'P358 ' + stability.type + ' plate stability', equations: [...equations, ur('stability', vertical, cap, vertical / cap)] });
    }
  }
  if (weld) steps.push({
    title: 'P358 double fillet weld sizing',
    equations: [
      tex`a=\ell/\sqrt2=${factor(input.weldLeg, '\\sqrt2')}=${n(weld.throat)}\,\mathrm{mm}`,
      tex`a_{\min}=${fy === 275 ? 0.5 : 0.6}t=${fy === 275 ? 0.5 : 0.6}\times ${t}=${n(weld.minimum)}\,\mathrm{mm}`,
      ur('weld', weld.minimum, weld.throat, weld.ratio),
    ],
  });
  if (support) {
    const limit = ts * input.supportFu / (fy * gammaBolt);
    steps.push(
      check('P358 support local shear', support.localShear, tex`V_{Rd}=\frac{2ht_sf_{y,s}}{10^3\sqrt3}=\frac{2\times${height}\times${ts}\times${input.supportFy}}{10^3\sqrt3}=${n(support.localShear, 3)}${kn}`),
      { title: 'P358 support punching shear', equations: [
        tex`t_{\max}=\frac{t_s f_{u,s}}{f_y\gamma_{M2}}=\frac{${ts}\times${input.supportFu}}{${fy}\times${gammaBolt}}=${n(limit)}\,\mathrm{mm}`,
        ur('support punching', t, limit, support.punching),
      ] },
    );
  }
  return steps;
}
