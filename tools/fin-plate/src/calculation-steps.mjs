import { gammaBolt } from './bolt-group.mjs';
import { detailingStep } from './calculation-detailing.mjs';
import { notchSteps } from './calculation-notch.mjs';
import { sciSteps } from './calculation-sci.mjs';

const tex = String.raw;
const n = (value, digits = 4) => {
  if (!Number.isFinite(value)) return tex`\infty`;
  return String(Number(value.toFixed(digits === 4 && value !== 0 && Math.abs(value) < 0.001 ? 9 : digits)));
};
const kn = tex`\,\mathrm{kN}`;
const mm = tex`\,\mathrm{mm}`;
const times = tex`\times`;
function utilization(ratio) {
  if (!Number.isFinite(ratio)) return 'The check has a nonzero demand with zero calculated resistance.';
  const value = n(ratio * 100, 1) + '%';
  return value + (ratio > 1 ? ' utilization. This check exceeds 100%.' : ' utilization. This check is within its calculated limit.');
}

const ur = (symbol, demand, capacity, ratio) =>
  tex`UR_{\text{${symbol}}}=\frac{${n(demand)}}{${n(capacity)}}=${n(100 * ratio, 1)}\%`;

function bearingStep(check, bolt, side, result, thickness, fu) {
  const b = bolt[side];
  const d = result.bolt.diameter;
  const d0 = result.bolt.hole;
  const directions = [['x', b.x], ['y', b.y]].flatMap(([axis, terms]) => {
    const { alpha, k, parallelEdge, parallelPitch, crossEdge, crossPitch } = terms;
    return [
      tex`\alpha_{b,${axis}}=\min\left(1,\frac{f_{ub}}{f_u},\frac{e_\parallel}{3d_0},\frac{p_\parallel}{3d_0}-0.25\right)=\min\left(1,\frac{${n(result.bolt.fub)}}{${n(fu)}},\frac{${n(parallelEdge)}}{3\times ${d0}},\frac{${n(parallelPitch)}}{3\times ${d0}}-0.25\right)=${n(alpha)}`,
      tex`k_{1,${axis}}=\min\left(2.5,\frac{2.8e_\perp}{d_0}-1.7,\frac{1.4p_\perp}{d_0}-1.7\right)=\min\left(2.5,\frac{2.8\times ${n(crossEdge)}}{${d0}}-1.7,\frac{1.4\times ${n(crossPitch)}}{${d0}}-1.7\right)=${n(k)}`,
      tex`F_{b,${axis},Rd}=\frac{[k_1]_+[\alpha_b]_+f_udt}{10^3\gamma_{M2}}=\frac{${[Math.max(0, k), Math.max(0, alpha), fu, d, thickness].map(x => n(x)).join(times)}}{10^3\times ${gammaBolt}}=${n(terms.resistance, 3)}${kn}`,
    ];
  });
  const term = (force, capacity) => force === 0 ? '0' : tex`\frac{|${n(force)}|}{${n(capacity)}}`;
  return {
    check: 2,
    title: check.name + ' · Bolt ' + bolt.id,
    intro: side === 'web'
      ? 'Check whether the bolt can press against its hole in the supported beam web without exceeding the calculated bearing resistance.'
      : 'Check the bolt-to-hole contact in the fin plate using the thickness, strength and edge distances of the plate.',
    note: 'This screening adds the two directional utilization ratios. It covers bearing for this component only.',
    outcome: 'Bolt ' + bolt.id + ' governs this bearing check at ' + utilization(check.ratio),
    captions: [...['Along the beam axis (x)', 'Vertically in the connection plane (y)'].flatMap(direction => [
      direction + '. Find the bearing factor αᵦ from the bolt and steel strengths (fᵤᵦ and fᵤ), edge distance e∥ and bolt pitch p∥ measured parallel to this force. d₀ is the hole diameter.',
      'Find the transverse spacing factor k₁ from the edge distance e⊥ and pitch p⊥ measured across the force. ∞ means that particular edge or adjacent bolt does not limit the factor.',
      'Calculate the bearing resistance Fᵦ,Rd. Use bolt diameter d, component thickness t, steel ultimate strength fᵤ and partial factor γM2. A negative geometry factor contributes zero resistance.',
    ]), 'Add the absolute force-to-resistance ratios for x and y. A direction with zero force contributes zero.'],
    equations: [...directions, tex`UR=\frac{|F_x|}{F_{b,x,Rd}}+\frac{|F_y|}{F_{b,y,Rd}}=${term(bolt.fx, b.fx)}+${term(bolt.fy, b.fy)}=${n(100 * check.ratio, 1)}\%`],
  };
}

export function calculationSteps(input, beam, result) {
  const { group, bolt, checks } = result;
  const total = group.bolts.length;
  const xSum = group.bolts.reduce((sum, b) => sum + b.x, 0);
  const ySum = group.bolts.reduce((sum, b) => sum + b.y, 0);
  const x2 = group.bolts.reduce((sum, b) => sum + b.dx ** 2, 0);
  const y2 = group.bolts.reduce((sum, b) => sum + b.dy ** 2, 0);
  const shear = checks.find(check => check.name === 'Bolt shear');
  const critical = group.bolts.find(b => b.id === shear.bolt);
  const angle = tex`${n(input.skew)}^\circ`;
  const eccentricity = {
    geometry: tex`z=\bar{x}=${n(group.centroid.x)}${mm}`,
    normal: tex`z=\frac{e_n}{\cos\theta}=\frac{${n(input.eccentricity)}}{\cos(${angle})}=${n(result.z, 3)}${mm}`,
    axis: tex`z=e_{\mathrm{axis}}=${n(result.z)}${mm}`,
  }[input.eccentricityMode];
  const forces = group.polar === 0 ? [
    tex`F_{x,i}=\frac{H_{Ed}}{n}=\frac{${n(input.horizontal)}}{${total}}=${n(critical.fx, 3)}${kn}`,
    tex`F_{y,i}=\frac{V_{Ed}}{n}=\frac{${n(input.vertical)}}{${total}}=${n(critical.fy, 3)}${kn}`,
  ] : [
    tex`F_{x,i}=\frac{H_{Ed}}{n}-\frac{M_{Ed}\Delta y_i}{J}=\frac{${n(input.horizontal)}}{${total}}-\frac{${n(result.moment, 2)}\times(${n(critical.dy)})}{${n(group.polar)}}=${n(critical.fx, 3)}${kn}`,
    tex`F_{y,i}=\frac{V_{Ed}}{n}+\frac{M_{Ed}\Delta x_i}{J}=\frac{${n(input.vertical)}}{${total}}+\frac{${n(result.moment, 2)}\times(${n(critical.dx)})}{${n(group.polar)}}=${n(critical.fy, 3)}${kn}`,
  ];
  const layout = result.beamLayout;
  const gapEquation = layout ? (layout.layout === 'outside'
    ? tex`g_{\mathrm{axis}}=g+\frac{p+(b/2)|\sin\theta|}{\cos\theta}=${n(input.gap)}+\frac{${n(layout.projection)}+(${n(beam.b)}/2)|\sin(${angle})|}{\cos(${angle})}=${n(result.beamGap, 1)}${mm}`
    : tex`g_{\mathrm{axis}}=g=${n(result.beamGap, 1)}${mm},\quad p=(b_s-t_{w,s})/2=(${n(layout.profile.b)}-${n(layout.profile.tw)})/2=${n(layout.projection, 1)}${mm}`)
    : tex`c_n=g\cos\theta-\frac{b}{2}|\sin\theta|=${n(input.gap)}\cos(${angle})-\frac{${n(beam.b)}}{2}|\sin(${angle})|=${n(result.supportClearance, 1)}${mm}`;
  const steps = [
    {
      title: 'Geometry and load eccentricity',
      intro: 'Find the center of the bolt group, the lever arm of the vertical shear, and the clearance between the beam end and the support.',
      captions: [
        'Average the bolt coordinates xᵢ and yᵢ over all n bolts. The result is the group center (x̄, ȳ).',
        {
          geometry: 'The geometry setting uses x̄, measured along the beam from the support face, as the shear lever arm z.',
          normal: 'Convert the entered distance eₙ, measured perpendicular to the support, into the lever arm z along the beam. θ is the angle between the beam axis and the support normal.',
          axis: 'Use the entered distance along the beam axis directly as the shear lever arm z.',
        }[input.eccentricityMode],
        'Multiply vertical design shear VEd by the lever arm z, then add the entered moment Madd. Divide by 1,000 to convert the shear contribution from kN·mm to kN·m.',
        layout ? (layout.layout === 'outside'
          ? 'Set the beam beyond the outer flange. The setback adds the supporting flange projection p, plus the supported flange corner allowance for skew, to the entered axial clearance g.'
          : 'Measure the beam end from the supporting web face. The supporting flange projection p is half the difference between flange width and web thickness.')
          : 'Check the closest corner of the square-cut beam end. g is the beam-end gap along the beam axis and b is the flange width.',
      ],
      outcome: 'The bolt-group moment is ' + n(result.moment / 1000, 2) + ' kN·m. '
        + (layout ? 'The web face to supported beam end distance along the axis is ' + n(result.beamGap, 1) + ' mm.'
          : result.supportClearance < 0
          ? 'The negative clearance means the beam end crosses the support face in plan by ' + n(-result.supportClearance, 1) + ' mm.'
          : 'The minimum normal clearance to the support face is ' + n(result.supportClearance, 1) + ' mm.'),
      equations: [
      tex`(\bar{x},\bar{y})=\left(\frac{\sum x_i}{n},\frac{\sum y_i}{n}\right)=\left(\frac{${n(xSum)}}{${total}},\frac{${n(ySum)}}{${total}}\right)=(${n(group.centroid.x)},${n(group.centroid.y)})${mm}`,
      eccentricity,
      tex`M_{Ed}=V_{Ed}z/10^3+M_{\mathrm{add}}=\frac{${n(input.vertical)}\times ${n(result.z)}}{10^3}+(${n(input.appliedMoment)})=${(result.moment / 1000).toFixed(2)}\,\mathrm{kN\,m}`,
      gapEquation,
    ] },
    {
      check: 2,
      title: 'Bolt shear · Bolt ' + critical.id,
      intro: 'Direct load is shared equally. The moment adds a force to each bolt based on its position relative to the group center. Compare the largest resultant with one bolt’s design shear resistance.',
      captions: [
        'Find the bolt-group geometry term J by summing squared offsets Δxᵢ and Δyᵢ from the group center. Bolts farther from the center contribute more to J.',
        group.polar === 0 ? 'Share the horizontal design force HEd equally over n bolts.' : 'Start with the direct force HEd/n along the beam and subtract the moment contribution associated with the bolt’s vertical offset Δyᵢ. Use the moment in kN·mm here.',
        group.polar === 0 ? 'Share the vertical design force VEd equally over n bolts.' : 'Start with the direct vertical force VEd/n and add the moment contribution associated with the bolt’s horizontal offset Δxᵢ.',
        'Combine the horizontal force Fₓ,ᵢ and vertical force Fᵧ,ᵢ to get the resultant shear demand on the bolt.',
        'Find the long-joint factor βLf using the joint length Lj and nominal bolt diameter d. A factor of 1 leaves bolt resistance at its unreduced value.',
        'Calculate bolt shear resistance using bolt strength fᵤᵦ, effective shear area A, bolt shear coefficient αᵥ, long-joint factor βLf and partial factor γM2.',
        'Divide the bolt shear demand by the bolt shear resistance.',
      ],
      outcome: 'Bolt ' + critical.id + ' governs with ' + n(critical.force, 2) + ' kN demand and '
        + n(result.shearResistance, 2) + ' kN resistance. ' + utilization(shear.ratio),
      equations: [
      tex`J=\sum_i\left(\Delta x_i^2+\Delta y_i^2\right)=${n(x2)}+${n(y2)}=${n(group.polar)}\,\mathrm{mm^2}`,
      ...forces,
      tex`F_{Ed,i}=\sqrt{F_{x,i}^2+F_{y,i}^2}=\sqrt{(${n(critical.fx)})^2+(${n(critical.fy)})^2}=${n(critical.force, 3)}${kn}`,
      tex`\beta_{Lf}=\max\left(0.75,\min\left(1,1-\frac{L_j-15d}{200d}\right)\right)=\max\left(0.75,\min\left(1,1-\frac{${n(result.jointLength)}-15\times ${bolt.diameter}}{200\times ${bolt.diameter}}\right)\right)=${n(result.longJoint)}`,
      tex`F_{v,Rd}=\frac{\beta_{Lf}\alpha_v f_{ub} A}{10^3\gamma_{M2}}=\frac{${[result.longJoint, bolt.coefficient, bolt.fub, bolt.area].map(x => n(x)).join(times)}}{10^3\times ${gammaBolt}}=${n(result.shearResistance, 3)}${kn}`,
      ur('bolt shear', critical.force, result.shearResistance, shear.ratio),
    ] },
  ];
  steps.splice(1, 0, detailingStep(input, result, n));
  const web = checks.find(check => check.name === 'Beam-web bearing · screening');
  const plate = checks.find(check => check.name === 'Fin-plate bearing · screening');
  if (web) steps.push(bearingStep(web, group.bolts.find(b => b.id === web.bolt), 'web', result, beam.tw, input.beamFu));
  if (plate) steps.push(bearingStep(plate, group.bolts.find(b => b.id === plate.bolt), 'plate', result, input.thickness, input.plateFu));
  if (!web && !plate) steps.push({ check: 2, title: 'Bearing applicability', note: 'Bearing screening requires a regular bolt grid.', equations: [] });
  steps.push(...sciSteps(input, result, { n, kn, times, ur }));
  steps.push(...notchSteps(input, beam, result, n, ur));
  return steps;
}
