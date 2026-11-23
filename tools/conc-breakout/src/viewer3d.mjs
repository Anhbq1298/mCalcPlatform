// Interactive 3D panel: drag to orbit, wheel or buttons to zoom, field and deformation controls.
import { buildScene, FIELDS, renderScene } from './view3d.mjs';

export const DEFAULT_VIEW = { yaw: -0.6, pitch: 0.45, zoom: 1 };

export function createViewer(container) {
  container.innerHTML = `<div class="viewer-controls">
      <label>Colour <select data-3d="field">${Object.entries(FIELDS).map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}</select></label>
      <label>Deformation <input type="range" min="0" max="3" step="0.25" value="0" data-3d="scale" aria-label="Deformation exaggeration"></label>
      <button type="button" data-3d="zoom-in" aria-label="Zoom in">+</button><button type="button" data-3d="zoom-out" aria-label="Zoom out">−</button>
      <button type="button" data-3d="reset">Reset view</button>
    </div><div class="drawing viewer-canvas" tabindex="0" aria-label="3D view; drag to rotate, arrow keys to orbit"></div>
    <p class="viewer-note">Drag to rotate · wheel to zoom · rigid-plate analysis shows the plate without a field.</p>`;
  const canvas = container.querySelector('.viewer-canvas');
  const control = name => container.querySelector(`[data-3d="${name}"]`);
  const view = { ...DEFAULT_VIEW };
  let scene = null;
  let result = null;
  let frame = 0;
  const draw = () => {
    frame = 0;
    if (!scene) return;
    const width = Math.max(320, Math.round(canvas.clientWidth || 560));
    canvas.innerHTML = renderScene(scene, { ...view, width, height: Math.round(width * 0.82) });
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
  const rebuild = () => {
    if (!result) return;
    scene = buildScene(result, { field: control('field').value, scale: Number(control('scale').value) });
    schedule();
  };
  control('field').addEventListener('change', rebuild);
  control('scale').addEventListener('input', rebuild);
  control('zoom-in').addEventListener('click', () => { view.zoom = Math.min(view.zoom * 1.2, 6); schedule(); });
  control('zoom-out').addEventListener('click', () => { view.zoom = Math.max(view.zoom / 1.2, 0.3); schedule(); });
  control('reset').addEventListener('click', () => { Object.assign(view, DEFAULT_VIEW); schedule(); });
  let drag = null;
  canvas.addEventListener('pointerdown', event => {
    drag = { x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag) return;
    view.yaw = drag.yaw + (event.clientX - drag.x) * 0.01;
    view.pitch = Math.min(1.5, Math.max(-1.5, drag.pitch + (event.clientY - drag.y) * 0.01));
    schedule();
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    view.zoom = Math.min(6, Math.max(0.3, view.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
    schedule();
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    const step = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[event.key];
    if (!step) return;
    event.preventDefault();
    view.yaw += step[0];
    view.pitch = Math.min(1.5, Math.max(-1.5, view.pitch + step[1]));
    schedule();
  });
  return {
    update(next) { result = next; rebuild(); },
    redraw: schedule,
    view,
  };
}
