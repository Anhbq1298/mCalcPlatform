// P–M presentation follows MBColumn Lite drawCharts/axes (pinned upstream).
export function chartTicks(lo, hi, user) {
  const span = hi - lo, base = 10 ** Math.floor(Math.log10(span / 5));
  const step = user > 0 && span / user <= 40 ? user : [1, 2, 5, 10].map(n => n * base).find(s => span / s <= 6);
  const values = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + 1e-9; t += step) values.push(Math.abs(t) < step * 1e-9 ? 0 : t);
  return { values, step };
}
export function pmRanges(result) {
  const [m, p] = result.demand;
  const moments = [...result.curve.map(q => q[0]), m];
  const axial = [...result.curve.map(q => q[1]), p, 0];
  const maxM = Math.max(...moments), minP = Math.min(...axial), maxP = Math.max(...axial);
  const padding = (maxP - minP || 1) * 0.08;
  return { x: [0, Math.max(1, maxM * 1.08)], y: [minP - padding, maxP + padding] };
}
function arrow(g, x1, y1, x2, y2, color, double) {
  const a = Math.atan2(y2 - y1, x2 - x1), length = 8.5, half = 4.4;
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 1.5; g.setLineDash([]);
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  const head = (x, y) => {
    g.beginPath(); g.moveTo(x, y);
    g.lineTo(x - length * Math.cos(a) + half * Math.sin(a), y - length * Math.sin(a) - half * Math.cos(a));
    g.lineTo(x - length * Math.cos(a) - half * Math.sin(a), y - length * Math.sin(a) + half * Math.cos(a));
    g.closePath(); g.fill();
  };
  head(x2, y2);
  if (double) head(x2 - length * 0.8 * Math.cos(a), y2 - length * 0.8 * Math.sin(a));
}
export function drawPm(canvas, result, grid = {}) {
  const w = canvas.clientWidth, h = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d'); g.scale(dpr, dpr);
  if (!result?.curve?.length) return;
  const { x: xr, y: yr } = pmRanges(result), pad = { l: 58, r: 52, t: 36, b: 30 };
  const X = x => pad.l + (x - xr[0]) / (xr[1] - xr[0]) * (w - pad.l - pad.r);
  const Y = y => h - pad.b - (y - yr[0]) / (yr[1] - yr[0]) * (h - pad.t - pad.b);
  const ink = '#1f2a30', muted = '#56636a', rule = '#c3cbc8', steel = '#2b3a8c', amber = '#d99a0f', purple = '#6a3fb5';
  const format = value => Number(value.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 2 });
  g.font = '400 11.5px "Barlow Semi Condensed", Roboto, sans-serif';
  g.fillStyle = muted; g.strokeStyle = rule; g.lineWidth = 1;
  const drawTicks = (range, user, vertical) => {
    const { values, step } = chartTicks(...range, user), every = Math.max(1, Math.ceil(values.length / 8));
    for (const t of values) {
      g.globalAlpha = t === 0 ? 1 : 0.6; g.beginPath();
      if (vertical) { g.moveTo(X(t), pad.t); g.lineTo(X(t), h - pad.b); }
      else { g.moveTo(pad.l, Y(t)); g.lineTo(w - pad.r, Y(t)); }
      g.stroke(); g.globalAlpha = 1;
      if (Math.round(t / step) % every !== 0) continue;
      g.textAlign = vertical ? 'center' : 'right';
      g.fillText(format(t), vertical ? X(t) : pad.l - 6, vertical ? h - pad.b + 14 : Y(t) + 4);
    }
  };
  drawTicks(xr, grid.pmM, true); drawTicks(yr, grid.pmP, false);
  g.textAlign = 'right'; g.fillText('M (kNm)', w - 4, h - 4);
  g.textAlign = 'left'; g.fillText('P (kN)', 4, 12);
  g.strokeStyle = steel; g.lineWidth = 2; g.beginPath();
  result.curve.forEach(([m, p], i) => i ? g.lineTo(X(m), Y(p)) : g.moveTo(X(m), Y(p))); g.stroke();
  arrow(g, X(0), Y(yr[0]), X(0), pad.t - 18, purple, false);
  arrow(g, X(0), Y(0), w - 8, Y(0), ink, true);
  g.font = '600 11.5px "Barlow Semi Condensed", Roboto, sans-serif';
  g.fillStyle = purple; g.textAlign = 'left'; g.fillText('+P compression', X(0) + 8, pad.t - 16);
  g.fillStyle = ink; g.textAlign = 'right'; g.fillText('+M', w - 4, Y(0) - 8);
  g.fillStyle = muted; g.font = '500 11px "Barlow Semi Condensed", Roboto, sans-serif';
  g.fillText('θ ' + (result.thetaDeg ?? 0).toFixed(0) + '°', w - 4, Y(0) + 16);
  g.fillStyle = amber; g.strokeStyle = ink; g.lineWidth = 1;
  g.beginPath(); g.arc(X(result.demand[0]), Y(result.demand[1]), 5, 0, 2 * Math.PI); g.fill(); g.stroke();
}
