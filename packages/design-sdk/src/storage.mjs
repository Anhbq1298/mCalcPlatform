import { parseDesign, validateProject } from './documents.mjs';

export function createStore(factory = globalThis.indexedDB) {
  let connection;
  function open() {
    connection ??= new Promise((resolve, reject) => {
      if (!factory) { reject(new Error('Browser storage is unavailable.')); return; }
      const request = factory.open('mcalc-platform', 1);
      request.onupgradeneeded = () => {
        for (const name of ['designs', 'projects']) request.result.createObjectStore(name, { keyPath: 'id' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); connection = undefined; };
        resolve(db);
      };
    }).catch(error => { connection = undefined; throw error; });
    return connection;
  }

  async function transaction(names, mode, run) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      tx.oncomplete = () => resolve(request?.result);
      tx.onabort = () => reject(tx.error ?? new Error('Storage transaction failed.'));
      let request;
      try { request = run(name => tx.objectStore(name)); }
      catch (error) { tx.abort(); reject(error); }
    });
  }

  return {
    getDesign: id => transaction(['designs'], 'readonly', store => store('designs').get(id)),
    listDesigns: () => transaction(['designs'], 'readonly', store => store('designs').getAll()),
    saveDesign: doc => transaction(['designs'], 'readwrite', store => store('designs').put(parseDesign(doc))),
    getProject: id => transaction(['projects'], 'readonly', store => store('projects').get(id)),
    listProjects: () => transaction(['projects'], 'readonly', store => store('projects').getAll()),
    saveProject: project => transaction(['projects'], 'readwrite', store => store('projects').put(validateProject(project))),
    moveDesign: (projectId, designId, folderId) => transaction(['designs', 'projects'], 'readwrite', store => {
      const projects = store('projects');
      const project = projects.get(projectId);
      const design = store('designs').get(designId);
      const update = () => {
        if (project.readyState !== 'done' || design.readyState !== 'done') return;
        const doc = project.result;
        const target = doc?.folders.find(folder => folder.id === folderId);
        if (!target || !design.result) { project.transaction.abort(); return; }
        for (const folder of doc.folders) folder.designs = folder.designs.filter(id => id !== designId);
        target.designs.push(designId);
        projects.put(validateProject(doc));
      };
      project.onsuccess = design.onsuccess = update;
    }),
    importPackage: ({ designs, project }) => transaction(['designs', 'projects'], 'readwrite', store => {
      const ids = new Map();
      for (const doc of designs) {
        const id = crypto.randomUUID();
        ids.set(doc.id, id);
        store('designs').add(parseDesign({ ...doc, id }));
      }
      if (project) {
        const id = crypto.randomUUID();
        const folders = project.folders.map(folder => ({ ...folder, designs: folder.designs.map(source => ids.get(source)) }));
        store('projects').add(validateProject({ ...project, id, folders }));
      }
    }),
  };
}
