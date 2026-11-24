const tex = String.raw;

export function detailingStep(input, result, n) {
  const d0 = result.bolt.hole;
  const edge = Math.min(...result.group.bolts.map(({ x, y }) =>
    Math.min(y, result.height - y, x - input.gap, result.width - x)));
  const pitch = input.columns > 1 ? Math.min(input.gauge, input.columns === 3 ? input.secondGauge : Infinity) : null;
  const entries = [
    ['Smallest distance from a bolt centre to the plate top, bottom, free edge or beam end. The minimum is 1.2 times the hole diameter.',
      tex`e_{\mathrm{actual}}=${n(edge)}\,\mathrm{mm},\quad e_{\min}=1.2d_0=1.2\times${n(d0)}=${n(1.2 * d0)}\,\mathrm{mm}`],
  ];
  if (!result.customLayout) {
    entries.push(['Vertical spacing between adjacent bolts. The minimum is 2.2 times the hole diameter.',
      tex`p_1=${n(input.pitch)}\,\mathrm{mm},\quad p_{1,\min}=2.2\times${n(d0)}=${n(2.2 * d0)}\,\mathrm{mm}`]);
    if (pitch !== null) entries.push(['Smallest horizontal spacing between adjacent bolt columns. The minimum is 2.4 times the hole diameter.',
      tex`p_2=${n(pitch)}\,\mathrm{mm},\quad p_{2,\min}=2.4\times${n(d0)}=${n(2.4 * d0)}\,\mathrm{mm}`]);
  }
  if (result.notch) {
    const { top, bottom, lower, upper } = result.notch;
    const clear = Math.min(...result.group.bolts.map(({ y }) => Math.min(top ? upper - y : Infinity, bottom ? y - lower : Infinity)));
    entries.push(['Smallest vertical distance from a bolt centre to a cut edge of the supported beam.',
      tex`e_{\mathrm{cut}}=${n(clear)}\,\mathrm{mm},\quad e_{\min}=${n(1.2 * d0)}\,\mathrm{mm}`]);
  }
  return {
    check: 1,
    title: 'Bolt spacing and edge distances',
    intro: 'Check that bolt holes fit inside the available steel and satisfy the implemented minimum distances.',
    captions: entries.map(([caption]) => caption),
    equations: entries.map(([, equation]) => equation),
  };
}
