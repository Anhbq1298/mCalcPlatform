const degrees = angle => angle * Math.PI / 180;
const point = (x, y, radius, angle) => [
  x + radius * Math.cos(degrees(angle)), y + radius * Math.sin(degrees(angle)),
];

function drawHooks(g, start, end, radius, extension) {
  const [x, y] = start;
  const [dx, dy] = [end[0] - x, end[1] - y];
  const span = Math.hypot(dx, dy);
  g.save();
  g.translate(x, y);
  g.rotate(Math.atan2(dy, dx));
  const offset = extension / Math.sqrt(2);
  const first = point(0, 0, radius, 135);
  const last = point(span, 0, radius, 405);
  g.beginPath();
  g.moveTo(first[0] + offset, first[1] + offset);
  g.arc(0, 0, radius, degrees(135), degrees(270));
  g.arc(span, 0, radius, degrees(270), degrees(405));
  g.lineTo(last[0] - offset, last[1] + offset);
  g.stroke();
  g.restore();
}

function drawHoop(g, shape, toScreen, radius, extension) {
  const [left, top] = toScreen(shape.left, shape.top);
  const [right, bottom] = toScreen(shape.right, shape.bottom);
  const offset = extension / Math.sqrt(2);
  const first = point(left, top, radius, 135);
  const last = point(left, top, radius, 315);
  g.beginPath();
  g.moveTo(first[0] + offset, first[1] + offset);
  g.arc(left, top, radius, degrees(135), degrees(270));
  g.arc(right, top, radius, degrees(270), degrees(360));
  g.arc(right, bottom, radius, 0, degrees(90));
  g.arc(left, bottom, radius, degrees(90), degrees(180));
  g.arc(left, top, radius, degrees(180), degrees(315));
  g.lineTo(last[0] + offset, last[1] + offset);
  g.stroke();
}

export function drawGeneratedLinks(g, layout, toScreen, scale, link) {
  const radius = layout.bendRadius * scale;
  const extension = layout.extension * scale;
  g.save();
  g.lineWidth = Math.max(1.25, link * scale);
  g.lineJoin = 'round';
  for (const shape of layout.shapes) {
    if (shape.type === 'cross') {
      g.strokeStyle = '#925019';
      drawHooks(g, toScreen(...shape.start), toScreen(...shape.end), radius, extension);
    } else {
      g.strokeStyle = shape.type === 'outer' ? '#343e4b' : '#235b93';
      drawHoop(g, shape, toScreen, radius, extension);
    }
  }
  g.restore();
}

export function drawSectionDimensions(g, left, top, width, height, b, h) {
  const right = left + width;
  const bottom = top + height;
  const dimensionX = left - 24;
  const dimensionY = bottom + 23;
  g.save();
  g.strokeStyle = '#56616d';
  g.fillStyle = '#374151';
  g.lineWidth = 1;
  g.beginPath();
  for (const x of [left, right]) {
    g.moveTo(x, bottom + 4);
    g.lineTo(x, dimensionY + 6);
    g.moveTo(x - 4, dimensionY + 4);
    g.lineTo(x + 4, dimensionY - 4);
  }
  for (const y of [top, bottom]) {
    g.moveTo(left - 4, y);
    g.lineTo(dimensionX - 6, y);
    g.moveTo(dimensionX - 4, y + 4);
    g.lineTo(dimensionX + 4, y - 4);
  }
  g.moveTo(left, dimensionY);
  g.lineTo(right, dimensionY);
  g.moveTo(dimensionX, top);
  g.lineTo(dimensionX, bottom);
  g.stroke();
  g.font = '12px ui-monospace, monospace';
  g.textAlign = 'center';
  g.fillText(b + ' mm', left + width / 2, dimensionY + 16);
  g.translate(dimensionX - 10, top + height / 2);
  g.rotate(-Math.PI / 2);
  g.fillText(h + ' mm', 0, 0);
  g.restore();
}
