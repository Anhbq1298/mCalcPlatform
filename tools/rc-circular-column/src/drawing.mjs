function frame(canvas) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  context.scale(scale, scale);
  return { context, width, height };
}

function gridTicks(min, max, requested, divisions) {
  const span = max - min;
  const magnitude = 10 ** Math.floor(Math.log10(span / divisions));
  const step = requested > 0 && span / requested <= 40
    ? requested
    : [1, 2, 5, 10].map(value => value * magnitude).find(value => span / value <= divisions);
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step);
  const labelEvery = Math.max(1, Math.ceil((last - first) / divisions));
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const tick = index + first;
    return { value: tick * step, label: tick % labelEvery === 0 };
  });
}

function plotLine(g, x0, y0, x1, y1) {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

function plotAxis(g, x0, y0, x1, y1, color) {
  const vertical = x0 === x1;
  g.strokeStyle = g.fillStyle = color;
  plotLine(g, x0, y0, x1, y1);
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x1 + (vertical ? -4 : -7), y1 + (vertical ? 7 : -4));
  g.lineTo(x1 + (vertical ? 4 : -7), y1 + (vertical ? 7 : 4));
  g.closePath();
  g.fill();
}

const tickFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 3 });

export function drawInteraction(canvas, result, { gridP, gridM, angle }) {
  const { context: g, width, height } = frame(canvas);
  if (!result?.curve.length) return;
  const [moment, axial] = result.demand;
  const maxM = Math.max(1, moment, ...result.curve.map(([m]) => m)) * 1.08;
  const minP = Math.min(0, axial, ...result.curve.map(([, p]) => p));
  const maxP = Math.max(1, axial, ...result.curve.map(([, p]) => p));
  const margin = (maxP - minP) * 0.08;
  const lo = minP - margin, hi = maxP + margin;
  const pTicks = gridTicks(lo, hi, gridP, 5);
  g.font = '12px Roboto, sans-serif';
  const left = Math.ceil(Math.max(30, ...pTicks.filter(tick => tick.label)
    .map(tick => g.measureText(tickFormat.format(tick.value)).width))) + 9;
  const right = width - 43, top = 29, bottom = height - 24;
  if (right <= left || bottom <= top) return;

  const x = m => left + m / maxM * (right - left);
  const y = p => bottom - (p - lo) / (hi - lo) * (bottom - top);
  const ink = '#26333e', purple = '#6a3fa1';
  g.strokeStyle = '#c3cbc8';
  g.fillStyle = '#435159';
  g.lineWidth = 1;
  g.textAlign = 'right';
  for (const tick of pTicks) {
    const yy = y(tick.value);
    plotLine(g, left, yy, right, yy);
    if (tick.label) g.fillText(tickFormat.format(tick.value), left - 6, yy + 4);
  }
  g.textAlign = 'center';
  const divisions = Math.max(2, Math.min(5, Math.floor((right - left) / 53)));
  for (const tick of gridTicks(0, maxM, gridM, divisions)) {
    const xx = x(tick.value);
    plotLine(g, xx, top, xx, bottom);
    if (tick.label) g.fillText(tickFormat.format(tick.value), xx, bottom + 16);
  }

  g.lineWidth = 1.25;
  plotAxis(g, left, bottom, left, 10, purple);
  plotAxis(g, left, y(0), width - 6, y(0), ink);
  g.fillStyle = purple;
  g.textAlign = 'left';
  g.fillText('+P compression', left + 7, 14);
  g.fillStyle = ink;
  g.textAlign = 'right';
  g.fillText('+M', width - 5, y(0) - 8);
  if (angle != null && y(0) + 16 < height - 10) g.fillText('θ ' + angle.toFixed(0) + '°', width - 5, y(0) + 16);

  g.save();
  g.beginPath();
  g.rect(left, top, right - left, bottom - top);
  g.clip();
  g.strokeStyle = '#2b3a8c';
  g.lineWidth = 2;
  g.beginPath();
  result.curve.forEach(([m, p], index) => {
    if (index === 0) g.moveTo(x(m), y(p));
    else g.lineTo(x(m), y(p));
  });
  g.stroke();
  g.restore();

  g.fillStyle = '#d89b15';
  g.strokeStyle = ink;
  g.lineWidth = 1;
  g.beginPath();
  g.arc(x(moment), y(axial), 4.5, 0, 2 * Math.PI);
  g.fill();
  g.stroke();
}
