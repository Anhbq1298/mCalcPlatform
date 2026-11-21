import { cageGeometry } from './inputs.mjs';

function frame(canvas) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  context.scale(scale, scale);
  return { context, width, height };
}

export function drawSection(canvas, legend, values) {
  const { context: g, width, height } = frame(canvas);
  const radius = values.diameter / 2;
  if (!(radius > 0)) {
    legend.textContent = 'Enter the section diameter to view the reinforcement.';
    return;
  }
  const scale = Math.max(0, Math.min(width, height) - 50) / values.diameter;
  const cages = cageGeometry(values);
  const colors = ['#2b3a8c', '#237555'];
  const circle = (x, y, r) => {
    g.beginPath();
    g.arc(x, y, r * scale, 0, 2 * Math.PI);
  };
  const x = width / 2, y = height / 2 - 4;
  circle(x, y, radius);
  g.fillStyle = '#e3e6df';
  g.fill();
  g.strokeStyle = '#1f2a30';
  g.stroke();
  cages.forEach((cage, index) => {
    if (cage.barRadius <= 0 || !Number.isInteger(cage.count) || cage.count < 3 || cage.count > 300) return;
    g.strokeStyle = colors[index];
    g.fillStyle = colors[index];
    circle(x, y, cage.spiralRadius);
    g.lineWidth = Math.max(2, cage.spiral * scale);
    if (index) g.setLineDash([7, 4]);
    g.stroke();
    g.setLineDash([]);
    for (let bar = 0; bar < cage.count; bar++) {
      const angle = 2 * Math.PI * bar / cage.count;
      circle(x + cage.barRadius * scale * Math.cos(angle), y - cage.barRadius * scale * Math.sin(angle), cage.bar / 2);
      g.fill();
    }
  });
  g.textAlign = 'center';
  g.fillStyle = '#1f2a30';
  g.font = '500 13px Roboto, sans-serif';
  g.fillText('Ø' + values.diameter + ' mm', x, height - 5);
  legend.textContent = cages.map((cage, index) =>
    (index ? 'Inner (green)' : 'Outer (blue)') + ': ' + cage.count + 'Ø' + cage.bar
    + ' · spiral Ø' + cage.spiral + ' @ ' + cage.pitch + ' mm').join(' | ');
}

export function drawInteraction(canvas, result) {
  const { context: g, width, height } = frame(canvas);
  if (!result?.curve.length) return;
  const [moment, axial] = result.demand;
  const maxM = Math.max(1, Math.abs(moment), ...result.curve.map(([m]) => Math.abs(m))) * 1.08;
  const minN = Math.min(0, axial, ...result.curve.map(([, n]) => n));
  const maxN = Math.max(1, axial, ...result.curve.map(([, n]) => n));
  const span = maxN - minN;
  const right = width - 22, left = 56, top = 22, bottom = height - 36;
  const x = m => left + (m + maxM) / (2 * maxM) * (right - left);
  const y = n => bottom - (n - minN) / span * (bottom - top);
  g.font = '12px Roboto, sans-serif';
  g.fillStyle = '#56636a';
  g.strokeStyle = '#c3cbc8';
  for (let i = 0; i <= 4; i++) {
    const n = minN + span * i / 4;
    g.fillText(n.toFixed(0), 6, y(n) + 4);
    g.beginPath(); g.moveTo(left, y(n)); g.lineTo(right, y(n)); g.stroke();
    const m = -maxM + 2 * maxM * i / 4;
    g.fillText(m.toFixed(0), x(m) - 14, bottom + 15);
  }
  g.fillText('N (kN)', 6, 12);
  g.fillText('M (kN·m)', (left + right) / 2 - 25, height - 3);
  g.strokeStyle = '#2b3a8c';
  g.lineWidth = 2;
  for (const sign of [1, -1]) {
    g.beginPath();
    result.curve.forEach(([m, n], index) => {
      if (index === 0) g.moveTo(x(sign * m), y(n));
      else g.lineTo(x(sign * m), y(n));
    });
    g.stroke();
  }
  g.fillStyle = '#b8322a';
  g.beginPath();
  g.arc(x(moment), y(axial), 5, 0, 2 * Math.PI);
  g.fill();
}
