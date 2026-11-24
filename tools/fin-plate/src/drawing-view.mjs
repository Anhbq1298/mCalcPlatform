import { draw } from './drawing.mjs';

export function drawingViews(nodes) {
  let zoom = 1;
  const drawings = Object.entries(nodes).map(([view, svg]) => {
    let bounds;
    let pan = [0, 0];
    let drag;
    function update() {
      if (!bounds) return;
      const [x, y, w, h] = bounds;
      svg.setAttribute('viewBox', [x + (w - w / zoom) / 2 + pan[0], y + (h - h / zoom) / 2 + pan[1], w / zoom, h / zoom].join(' '));
    }
    svg.onpointerdown = event => {
      const scale = svg.getScreenCTM()?.a;
      if (!bounds || !scale) return;
      drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, pan, scale };
      svg.setPointerCapture(event.pointerId);
    };
    svg.onpointermove = event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      pan = [drag.pan[0] - (event.clientX - drag.x) / drag.scale, drag.pan[1] - (event.clientY - drag.y) / drag.scale];
      update();
    };
    svg.onlostpointercapture = () => { drag = undefined; };
    return {
      render(beam, input, result, options) {
        bounds = draw(svg, beam, input, result, { ...options, view });
        update();
      },
      update,
      fit() { pan = [0, 0]; update(); },
      clear() { bounds = drag = undefined; svg.replaceChildren(); },
    };
  });
  return {
    render: (...args) => drawings.forEach(drawing => drawing.render(...args)),
    clear: () => drawings.forEach(drawing => drawing.clear()),
    zoom(factor) {
      zoom = Math.max(0.5, Math.min(8, zoom * factor));
      drawings.forEach(drawing => drawing.update());
    },
    fit() {
      zoom = 1;
      drawings.forEach(drawing => drawing.fit());
    },
  };
}
