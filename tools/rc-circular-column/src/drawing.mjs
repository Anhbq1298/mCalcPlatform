import { cageGeometry } from './reinforcement.mjs';
import { sectionSvg } from './section-svg.mjs';
import { validateInputs } from './inputs.mjs';

function frame(canvas) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  context.scale(scale, scale);
  return { context, width, height };
}

export function drawSection(container, legend, values) {
  try {
    validateInputs(values);
    container.innerHTML = sectionSvg(values);
    legend.textContent = cageGeometry(values).map(c => c.id + ': ' + c.count + 'Ø' + c.bar + ' · R_L=' + c.barRadius.toFixed(1) + ' mm · '
      + (c.link ? 'closed link Ø' + c.link.diameter + ' @ ' + c.link.spacing + ' · R_S=' + c.linkRadius.toFixed(1) + ' mm' : 'NO LINK')).join(' | ');
  } catch (error) { container.replaceChildren(); legend.textContent = error.message; }
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
