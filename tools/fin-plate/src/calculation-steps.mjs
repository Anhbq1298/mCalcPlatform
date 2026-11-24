import { gammaBolt } from './bolt-group.mjs';
import { sciSteps } from './calculation-sci.mjs';

const tex = String.raw;
const n = (value, digits = 4) => {
  if (!Number.isFinite(value)) return tex`\infty`;
  return String(Number(value.toFixed(digits === 4 && value !== 0 && Math.abs(value) < 0.001 ? 9 : digits)));
};
const kn = tex`\,\mathrm{kN}`;
const mm = tex`\,\mathrm{mm}`;
const times = tex`\times`;
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
    title: check.name + ' · Bolt ' + bolt.id,
    note: 'Directional linear interaction screening. ∞ indicates no applicable edge or adjacent bolt in that direction. Brackets with + clamp the coefficient at zero.',
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
  const steps = [
    { title: 'Geometry and load eccentricity', equations: [
      tex`(\bar{x},\bar{y})=\left(\frac{\sum x_i}{n},\frac{\sum y_i}{n}\right)=\left(\frac{${n(xSum)}}{${total}},\frac{${n(ySum)}}{${total}}\right)=(${n(group.centroid.x)},${n(group.centroid.y)})${mm}`,
      eccentricity,
      tex`M_{Ed}=V_{Ed}z/10^3+M_{\mathrm{add}}=\frac{${n(input.vertical)}\times ${n(result.z)}}{10^3}+(${n(input.appliedMoment)})=${(result.moment / 1000).toFixed(2)}\,\mathrm{kN\,m}`,
      tex`c_n=g\cos\theta-\frac{b}{2}|\sin\theta|=${n(input.gap)}\cos(${angle})-\frac{${n(beam.b)}}{2}|\sin(${angle})|=${n(result.supportClearance, 1)}${mm}`,
    ] },
    { title: 'Bolt shear · Bolt ' + critical.id, note: 'For force distribution, moment is expressed in kN·mm and bolt offsets are measured from the group centroid.', equations: [
      tex`J=\sum_i\left(\Delta x_i^2+\Delta y_i^2\right)=${n(x2)}+${n(y2)}=${n(group.polar)}\,\mathrm{mm^4}`,
      ...forces,
      tex`F_{Ed,i}=\sqrt{F_{x,i}^2+F_{y,i}^2}=\sqrt{(${n(critical.fx)})^2+(${n(critical.fy)})^2}=${n(critical.force, 3)}${kn}`,
      tex`\beta_{Lf}=\max\left(0.75,\min\left(1,1-\frac{L_j-15d}{200d}\right)\right)=\max\left(0.75,\min\left(1,1-\frac{${n(result.jointLength)}-15\times ${bolt.diameter}}{200\times ${bolt.diameter}}\right)\right)=${n(result.longJoint)}`,
      tex`F_{v,Rd}=\frac{\beta_{Lf}\alpha_v f_{ub} A}{10^3\gamma_{M2}}=\frac{${[result.longJoint, bolt.coefficient, bolt.fub, bolt.area].map(x => n(x)).join(times)}}{10^3\times ${gammaBolt}}=${n(result.shearResistance, 3)}${kn}`,
      ur('bolt shear', critical.force, result.shearResistance, shear.ratio),
    ] },
  ];
  const web = checks.find(check => check.name === 'Beam-web bearing · screening');
  const plate = checks.find(check => check.name === 'Fin-plate bearing · screening');
  if (web) steps.push(bearingStep(web, group.bolts.find(b => b.id === web.bolt), 'web', result, beam.tw, input.beamFu));
  if (plate) steps.push(bearingStep(plate, group.bolts.find(b => b.id === plate.bolt), 'plate', result, input.thickness, input.plateFu));
  if (!web && !plate) steps.push({ title: 'Bearing applicability', note: 'Bearing screening requires a regular bolt grid.', equations: [] });
  steps.push(...sciSteps(input, result, { n, kn, times, ur }));
  return steps;
}
