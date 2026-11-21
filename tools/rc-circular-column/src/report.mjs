import { sectionSvg, escape } from './section-svg.mjs';

export function buildReport(input, result) {
  const shapes = [], width = 642, stride = 1171;
  let page = 0, y = 64;
  function add(type, props) {
    if (y + props.h > 1050) { page++; y = 64; }
    shapes.push({ id: 'circular-' + shapes.length, type, x: 76, y: page * stride + y, props });
    y += props.h + 10;
  }
  function text(value, heading) {
    add('text', { w: width, h: 22 * Math.ceil(value.length / 85) + 8, html: escape(value),
      fontFamily: 'Inter', fontSize: heading ? 18 : 13, color: '#1f2a30', align: 'left', ...(heading ? { heading } : {}) });
  }
  text('Circular RC Column — closed links', 1);
  text('DETAILING ' + result.status.toUpperCase() + ' / ENGINEERING REVIEW REQUIRED. No overall compliance verdict.');
  text('PMM/shear: numerical form of pinned Canvas worksheet 161910b4, EN 1992-1-1:2023 material/shear model. Detailing: EN 1992-1-1:2004 §§4.4.1, 8.2, 9.5.3; project NA applicability unverified.');
  text(`D${input.diameter}; fck ${input.concrete} MPa; longitudinal/link fyk ${input.steel}/${input.linkSteel} MPa; cover ${input.cover} mm; aggregate ${input.aggregate} mm.`);
  text(`NEd ${input.axial} kN; Mx/My ${input.mx}/${input.my} kN m; VEd ${input.shear} kN.`);
  text(`Detailing parameters: k1=${input.k1}; k2=${input.k2} mm; link spacing cap=${input.maxLinkSpacing} mm; end/lap zone=${Boolean(input.reducedZone)}.`);
  const svgBytes = new TextEncoder().encode(sectionSvg(input));
  const svgBase64 = btoa(Array.from(svgBytes, byte => String.fromCharCode(byte)).join(''));
  add('image', { w: 440, h: 440, src: 'data:image/svg+xml;base64,' + svgBase64 });
  text('Reinforcement geometry', 2);
  for (const c of result.geometry) text(`${c.id}: ${c.count}Ø${c.bar}; angle ${c.angle}°; R_L=${c.barRadius.toFixed(2)} mm; radial clear=${c.radialClear ?? 'outer'} mm; `
    + (c.link ? `closed link Ø${c.link.diameter} @ ${c.link.spacing} mm; R_S=${c.linkRadius.toFixed(2)} mm.` : 'NO LINK.'));
  text('Resistance estimates', 2);
  for (const [label, value] of [['P–M utilization', result.combined], ['Conditional link shear utilization', result.shear],
    ['Effective web width (mm)', result.width], ['cot θ', result.cot], ['Link shear resistance stress (MPa)', result.linkStress], ['Strut stress (MPa)', result.strutStress]]) {
    text(label + ': ' + (value === null ? 'UNAVAILABLE' : value.toFixed(4)));
  }
  text('Detailing and applicability checks', 2);
  for (const check of result.detailing) text(check.status.toUpperCase() + ': ' + check.message
    + (check.value === null ? '' : ' Value=' + check.value.toFixed(3) + ' mm' + (check.limit === null ? '' : '; threshold=' + check.limit.toFixed(3) + ' mm') + '.'));
  text('P–M sampled resistance curve (kN m, kN)', 2);
  for (let i = 0; i < result.curve.length; i += 4) text(result.curve.slice(i, i + 4).map(([m, n]) => `(${m.toFixed(2)}, ${n.toFixed(2)})`).join('  '));
  const date = new Date().toISOString();
  return { id: crypto.randomUUID(), title: 'Circular RC Column — closed links', version: 3, shapes,
    createdAt: date, updatedAt: date, metadata: {}, inputResult: { title: 'Column', inputs: [], outputs: [], rows: [] },
    settings: { unitSystem: 'SI', precision: 3, canvasMode: 'page', paper: 'A4', pageOrientation: 'portrait',
      showHeaderFooter: true, textFont: 'Inter', pages: page + 1, snapToGrid: false, optimizePrintLayout: false } };
}
