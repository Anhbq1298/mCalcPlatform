const tex = String.raw;

export function notchSteps(input, beam, result, n, ur) {
  const { notch, notchedBeam: section } = result;
  if (!notch) return [];
  const fy = input.beamFy ?? 355;
  const fu = input.beamFu;
  const tw = beam.tw;
  const boltRows = input.rows;
  const hole = result.bolt.hole;
  const unit = value => tex`\,\mathrm{${value === 'kNm' ? 'kN\\,m' : value}}`;
  return [{
    title: 'Geometry of the supported beam notch',
    intro: 'The removed flange and web reduce the section available to carry shear and bending. The model leaves a ' + (notch.top && notch.bottom ? 'rectangular web.' : 'tee section.'),
    captions: ['Subtract the top and bottom cut depths from the original beam depth.',
      'The effective shear area resists shear. The elastic modulus relates the bending moment to stress.'],
    equations: [
      tex`h_N=h-d_{nt}-d_{nb}=${n(beam.h)}-${n(notch.top)}-${n(notch.bottom)}=${n(beam.h - notch.top - notch.bottom)}${unit('mm')}`,
      ...(section ? [tex`A_v=${n(section.area)}\,\mathrm{mm^2},\qquad W_{el,N}=${n(section.modulus)}\,\mathrm{mm^3}`] : []),
    ],
  }, ...(section ? [{
    check: 4,
    title: 'P358 Check 4 · Shear through the notched web',
    intro: 'Compare the applied shear with three possible failure modes. Gross shear yields the web. Net shear fractures it through the holes. Block tearing frees the steel around the bolt group.',
    captions: ['Calculate yielding using the effective shear area and beam yield strength.',
      'Subtract the bolt holes and use the beam ultimate strength and the UK net-section factor of 1.1.',
      'Add the tensile and shear contributions along the two legs of the tear path.'],
    equations: [
      tex`V_{Rd,g}=\frac{A_v f_y}{10^3\sqrt3}=\frac{${n(section.area)}\times${n(fy)}}{10^3\sqrt3}=${n(section.checks[0].resistance)}${unit('kN')}`,
      tex`V_{Rd,n}=\frac{(A_v-n_1 d_0 t_w)f_u}{10^3\sqrt3\times1.1}=\frac{(${n(section.area)}-${boltRows}\times${hole}\times${n(tw)})\times${n(fu)}}{10^3\sqrt3\times1.1}=${n(section.checks[1].resistance)}${unit('kN')}`,
      tex`V_{Rd,b}=\frac1{10^3}\left(\frac{0.5 f_u A_{nt}}{1.1}+\frac{f_y A_{nv}}{\sqrt3}\right)=\frac1{10^3}\left(\frac{0.5\times${n(fu)}\times${n(section.netTension)}}{1.1}+\frac{${n(fy)}\times${n(section.netShear)}}{\sqrt3}\right)=${n(section.checks[2].resistance)}${unit('kN')}`,
    ],
  }, ...section.checks.map(({ name, demand, resistance, ratio, unit: measure, lever, shearResistance, reduction, check }) => ({
    check,
    title: name,
    intro: measure === 'kNm'
      ? 'The eccentric shear produces bending in the reduced section. High shear reduces the available moment resistance.'
      : measure === 'mm' ? 'Compare the specified notch dimension with the stability limit for this restrained beam.'
        : 'Compare the design shear with the calculated resistance of the reduced web.',
    captions: [
      ...(measure === 'kNm' ? [
        'Multiply the applied shear by its lever arm measured from the support face.',
        'Use the ratio of applied shear to section shear resistance to reduce the bending capacity above half the shear limit.',
        'Multiply the reduced elastic modulus contribution by the beam yield strength.',
      ] : ['Read the applied value and the corresponding design limit.']),
      'Divide the applied value by its limit. A utilization above 100% exceeds the limit.',
    ],
    equations: [
      ...(measure === 'kNm' ? [
        tex`M_{Ed}=V_{Ed}z/10^3=${n(input.vertical)}\times${n(lever)}/10^3=${n(demand)}${unit('kNm')}`,
        tex`\eta=\max\left(0,1-\max\left(0,2\frac{V_{Ed}}{V_{Rd}}-1\right)^2\right)=\max\left(0,1-\max\left(0,2\frac{${n(input.vertical)}}{${n(shearResistance)}}-1\right)^2\right)=${n(reduction)}`,
        tex`M_{Rd}=\frac{f_y W_{el,N}\eta}{10^6}=\frac{${n(fy)}\times${n(section.modulus)}\times${n(reduction)}}{10^6}=${n(resistance)}${unit('kNm')}`,
      ] : [tex`\text{Applied}=${n(demand)}${unit(measure)},\qquad\text{Limit}=${n(resistance)}${unit(measure)}`]),
      ur('notch', demand, resistance, ratio),
    ],
  }))] : [])];
}
