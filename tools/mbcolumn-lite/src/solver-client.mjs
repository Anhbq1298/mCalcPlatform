export function createColumnSolver() {
  let worker;
  let sequence = 0;
  const pending = new Map();

  function reset(message) {
    worker?.terminate();
    worker = undefined;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(message));
    }
    pending.clear();
  }

  return function solve(route, input) {
    return new Promise((resolve, reject) => {
      if (!worker) {
        worker = new Worker(new URL('./solver.worker.mjs', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          const entry = pending.get(data.id);
          if (!entry) return;
          pending.delete(data.id);
          clearTimeout(entry.timer);
          if (data.error) entry.reject(new Error(data.error));
          else entry.resolve(data.result);
        };
        worker.onerror = () => reset('The local column solver stopped. Calculate again to restart it.');
      }
      const id = ++sequence;
      const timer = setTimeout(() => reset('The local solver timed out. Reduce the fibre count or load cases and try again.'), 90000);
      pending.set(id, { resolve, reject, timer });
      try { worker.postMessage({ id, route, input }); }
      catch (error) { reset(error.message); }
    });
  };
}
