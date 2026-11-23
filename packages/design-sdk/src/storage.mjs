import { parseDesign, validateProject } from './documents.mjs';
import { copyFolderTree } from './folder-tree.mjs';

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
      const guard = operation => {
        try { return operation(); }
        catch (error) { reject(error); tx.abort(); }
      };
      request = guard(() => run(name => tx.objectStore(name), guard));
    });
  }

  function update(collection, id, transform, validate) {
    return transaction([collection], 'readwrite', (store, guard) => {
      const records = store(collection);
      const request = records.get(id);
      request.onsuccess = () => guard(() => {
        if (!request.result) throw new Error('This record is no longer available.');
        records.put(validate(transform(request.result)));
      });
    });
  }

  return {
    getDesign: id => transaction(['designs'], 'readonly', store => store('designs').get(id)),
    listDesigns: () => transaction(['designs'], 'readonly', store => store('designs').getAll()),
    saveDesign: doc => transaction(['designs'], 'readwrite', store => store('designs').put(parseDesign(doc))),
    updateDesign: (id, transform) => update('designs', id, transform, parseDesign),
    getProject: id => transaction(['projects'], 'readonly', store => store('projects').get(id)),
    listProjects: () => transaction(['projects'], 'readonly', store => store('projects').getAll()),
    saveProject: project => transaction(['projects'], 'readwrite', store => store('projects').put(validateProject(project))),
    updateProject: (id, transform) => update('projects', id, transform, validateProject),
    addProjectDesign: (projectId, folderId, doc) => transaction(['designs', 'projects'], 'readwrite', (store, guard) => {
      const projects = store('projects');
      const request = projects.get(projectId);
      request.onsuccess = () => guard(() => {
        const project = request.result;
        const folder = project?.folders.find(item => item.id === folderId);
        if (!folder) throw new Error('The destination folder is unavailable.');
        folder.designs.push(doc.id);
        store('designs').add(parseDesign(doc));
        projects.put(validateProject(project));
      });
    }),
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
    copyFolder: async (projectId, folderId, parentId) => {
      const source = await transaction(['projects'], 'readonly', store => store('projects').get(projectId));
      if (!source) throw new Error('This project is unavailable.');
      const { project, designMap } = copyFolderTree(source, folderId, parentId);
      const copies = await Promise.all([...designMap].map(async ([from, to]) => {
        const doc = await transaction(['designs'], 'readonly', store => store('designs').get(from));
        if (!doc) throw new Error('This project references an unavailable calculation.');
        return parseDesign({ ...structuredClone(doc), id: to });
      }));
      return transaction(['designs', 'projects'], 'readwrite', store => {
        for (const doc of copies) store('designs').add(doc);
        store('projects').put(validateProject(project));
      });
    },
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
        return store('projects').add(validateProject({ ...project, id, folders }));
      }
    }),
  };
}
