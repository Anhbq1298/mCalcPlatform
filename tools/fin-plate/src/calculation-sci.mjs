import { gammaBolt } from './bolt-group.mjs';
const tex = String.raw;

export function sciSteps(input, result, { n, kn, times, ur }) {
  const steps = [];
  const { sci, weld, support, height } = result;
  const { vertical, thickness: t, plateFy: fy, plateFu: fu, rows } = input;
  const ts = support?.thickness ?? input.supportThickness;
  const factor = (value, divisor) => tex`\frac{${n(value)}}{${divisor}}`;
  const check = (check, name, capacity, explanation, equation) => ({
    check,
    title: name,
    intro: explanation,
    captions: ['Calculate the design shear resistance for this failure mode.', 'Compare the applied vertical design shear with this resistance.'],
    equations: [equation, ur('shear', vertical, capacity, vertical / capacity)],
  });
  if (sci) {
    const { resistance, plate, stability, z } = sci;
    const { horizontal: ax, vertical: ay } = resistance;
    const group = result.group;
    const maxX = Math.max(...group.bolts.map(b => Math.abs(b.dx)));
    const maxY = Math.max(...group.bolts.map(b => Math.abs(b.dy)));
    steps.push({
      check: 2,
      title: 'SCI P358 · Bolt group',
      intro: 'Find the maximum vertical shear the entire connection can transfer for each bolt-group failure mode under the SCI P358 method.',
      captions: [
        'Find the horizontal force per unit of applied shear at the corner bolt (qₓ). Use the shear lever arm z, largest vertical bolt offset and bolt-group geometry term J.',
        'Find the vertical force per unit of applied shear at the corner bolt (qᵧ). Combine the direct share 1/n with the contribution from the largest horizontal bolt offset.',
        'Use the two force components to convert one bolt’s design shear resistance Fᵥ,Rd into a vertical shear capacity for the group.',
        'Compare the applied design shear with the bolt-group shear capacity.',
        'Use the horizontal and vertical hole bearing resistances Fᵦ,ₓ,Rd and Fᵦ,ᵧ,Rd to find the group capacity limited by the beam web.',
        'Compare the applied design shear with the beam-web bearing capacity.',
        'Repeat the bearing calculation using the fin plate’s directional resistances.',
        'Compare the applied design shear with the fin-plate bearing capacity.',
      ],
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
      check(3, 'P358 gross plate shear', plate.gross, "Check shear yielding over the full fin plate section. h and t are the plate height and thickness, and fᵧ is its yield strength.", tex`V_{Rd,g}=\frac{htf_y}{10^3\times1.27\sqrt3}=\frac{${[height, t, fy].map(x => n(x)).join(times)}}{10^3\times1.27\sqrt3}=${n(plate.gross, 3)}${kn}`),
      check(3, 'P358 net plate shear', plate.net, "Check shear rupture across a bolt line. Subtract the nᵣ holes of diameter d₀ from the plate height h. t is plate thickness and fᵤ is the plate’s ultimate strength.", tex`V_{Rd,n}=\frac{(h-n_rd_0)tf_u}{10^3\times1.1\sqrt3}=\frac{(${height}-${rows}\times${d0})\times${t}\times${fu}}{10^3\times1.1\sqrt3}=${n(plate.net, 3)}${kn}`),
      check(3, 'P358 plate block tearing', plate.block, "Check whether a block of plate can tear out around the bolts. Aₙₜ and Aₙᵥ are the remaining tension and shear areas along the tear path. fᵤ and fᵧ are the plate’s ultimate and yield strengths.", tex`V_{Rd,b}=\frac1{10^3}\left(\frac{0.5f_u A_{nt}}{1.1}+\frac{f_y A_{nv}}{\sqrt3}\right)=\frac1{10^3}\left(\frac{0.5\times${fu}\times${n(plate.netTension)}}{1.1}+\frac{${fy}\times${n(plate.netShear)}}{\sqrt3}\right)=${n(plate.block, 3)}${kn}`),
    );
    const elastic = tex`V_{\mathrm{el}}=\frac{th^2 f_y}{6z\times 10^3}=\frac{${t}\times${height}^2\times${fy}}{6\times${n(z)}\times 10^3}=${n(t * height ** 2 * fy / (6e3 * z), 3)}${kn}`;
    if (plate.bending !== null) steps.push(check(3, 'P358 plate bending', plate.bending, "Check whether the eccentric vertical shear can cause bending yield. The elastic resistance uses plate thickness t, height h, yield strength fᵧ and lever arm z.", elastic));
    if (plate.bending === null) steps.push({
      check: 3,
      title: 'First-stage plate bending criterion',
      intro: 'SCI P358 permits the separate first-stage plate bending comparison to be omitted when the plate is deep enough relative to the shear lever arm. The stability check still applies.',
      captions: ['Multiply the shear lever arm z by 2.73 and compare it with the actual plate height h.'],
      equations: [tex`h=${n(height)}\,\mathrm{mm}\geq2.73z=2.73\times${n(z)}=${n(2.73 * z)}\,\mathrm{mm}`],
    });
    if (stability.resistance !== null) {
      const cap = stability.resistance;
      const equations = [elastic];
      if (stability.type === 'long') equations.push(
        tex`\bar\lambda_{LT}=\frac{2.8}{86.8}\sqrt{\frac{x_1 h}{1.5t^2}}=\frac{2.8}{86.8}\sqrt{\frac{${n(group.bolts[0].x)}\times${height}}{1.5\times${t}^2}}=${n(stability.slenderness)}`,
        tex`\chi_{LT}=${n(stability.reduction)},\quad V_{Rd}=\min(V_{\mathrm{el}},\chi_{LT}V_{\mathrm{el}}/0.6)=${n(cap, 3)}${kn}`,
      );
      steps.push({
        check: 3,
        title: 'P358 ' + stability.type + ' plate stability',
        intro: 'Check the fin plate for lateral-torsional instability using its plate length category.',
        captions: [
          'Find the elastic limit using plate thickness t, height h, yield strength fᵧ and shear lever arm z.',
          ...(stability.type === 'long' ? [
            'Calculate the slenderness λ̄LT. x₁ is the distance from the support face to the first bolt line.',
            'Apply the buckling reduction factor χLT and take the smaller shear resistance.',
          ] : []),
          'Compare the applied vertical shear with the resulting stability limit.',
        ],
        equations: [...equations, ur('stability', vertical, cap, vertical / cap)],
      });
    }
  }
  if (weld) steps.push({
    check: 8,
    title: 'P358 double fillet weld sizing',
    intro: 'Check the effective throat of the specified fillet welds against the sizing rule for the selected fin plate.',
    captions: [
      'Convert the equal weld leg length ℓ to the effective throat a.',
      'Calculate the minimum throat aₘᵢₙ from the fin plate thickness t and steel grade.',
      'Divide the required throat by the available throat.',
    ],
    equations: [
      tex`a=\ell/\sqrt2=${factor(input.weldLeg, '\\sqrt2')}=${n(weld.throat)}\,\mathrm{mm}`,
      tex`a_{\min}=${fy === 275 ? 0.5 : 0.6}t=${fy === 275 ? 0.5 : 0.6}\times ${t}=${n(weld.minimum)}\,\mathrm{mm}`,
      ur('weld', weld.minimum, weld.throat, weld.ratio),
    ],
  });
  if (support) {
    const limit = support.punchLimit;
    steps.push(
      check(10, 'P358 support local shear', support.localShear, "Check local shear in the supporting element using plate height h, support thickness tₛ and support yield strength fᵧ,ₛ.", tex`V_{Rd}=\frac{2ht_sf_{y,s}}{10^3\sqrt3}=\frac{2\times${height}\times${ts}\times${input.supportFy}}{10^3\sqrt3}=${n(support.localShear, 3)}${kn}`),
      {
        check: 10,
        title: 'P358 support punching shear',
        intro: 'Check the fin plate thickness against the supporting element’s calculated punching shear limit.',
        captions: [
          'Find the maximum plate thickness tₘₐₓ using the support thickness tₛ, support ultimate strength fᵤ,ₛ, plate yield strength fᵧ and partial factor γM2.',
          'Divide the actual fin plate thickness by the calculated maximum.',
        ],
        equations: [
        tex`t_{\max}=\frac{t_s f_{u,s}}{f_y\gamma_{M2}}=\frac{${ts}\times${input.supportFu}}{${fy}\times${gammaBolt}}=${n(limit)}\,\mathrm{mm}`,
        ur('support punching', t, limit, support.punching),
      ] },
    );
  }
  return steps;
}
