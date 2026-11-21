import { createDesign, duplicateDesign } from './documents.mjs';
import { exportPackage, hashReport } from './package-file.mjs';
import { createStore } from './storage.mjs';
import { migrateToolInputs } from './migrations.mjs';

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountToolShell({ tool, getAdapter, home, reportUrl, reportOwner }) {
  const db = createStore();
  const bar = document.createElement('nav');
  bar.className = 'mcalc-shell';
  bar.setAttribute('aria-label', 'Design workspace');
  bar.innerHTML = '<a data-hub>Workspace</a><button data-new>New</button><button data-open>Open</button>'
    + '<label>Design name <input maxlength="200"></label><button data-save>Save</button><button data-copy>Duplicate</button>'
    + '<button data-project>Add to project</button><button data-report>Report</button>'
    + '<button data-export>Export .mcalc</button><output aria-live="polite"></output>';
  document.body.prepend(bar);
  const named = bar.querySelector('input');
  const status = bar.querySelector('output');
  const action = name => bar.querySelector('[data-' + name + ']');

  named.value = reportOwner ? reportOwner.meta.name + ' · Report' : tool.name;
  let current = reportOwner, busy = false, locked = false;
  const location = new URL(window.location.href);
  const key = location.searchParams.get('design');
  const workspace = new URL(home);
  for (const param of ['project', 'folder']) {
    if (location.searchParams.has(param)) workspace.searchParams.set(param, location.searchParams.get(param));
  }
  if (workspace.searchParams.has('project')) workspace.hash = 'projects';
  action('hub').href = workspace.href;
  const message = value => { status.textContent = value; };
  const setBusy = value => {
    busy = value;
    named.disabled = busy || locked || !!reportOwner;
    for (const key of ['save', 'copy', 'project', 'report']) action(key).disabled = busy || locked;
    action('export').disabled = busy || (locked && !current);
    action('copy').disabled ||= !!reportOwner;
    action('project').disabled ||= !!reportOwner;
    action('report').disabled ||= !!reportOwner;
  };

  async function capture(includeReport = false) {
    const adapter = getAdapter();
    if (!adapter) throw new Error('Wait for the tool to finish opening.');
    const snapshot = structuredClone(await adapter.snapshot());
    const inputs = { ...current?.inputs, ...snapshot };
    const name = named.value.trim() || tool.name;
    const previous = current;
    if (reportOwner) {
      const owner = await db.getDesign(reportOwner.id);
      if (!owner?.report || owner.reportHash !== reportOwner.reportHash
        || JSON.stringify(owner.report) !== JSON.stringify(current?.report)
        || JSON.stringify(owner.inputs) !== JSON.stringify(reportOwner.inputs)) {
        throw new Error('This report changed in another tab. Open the latest worksheet before saving.');
      }
      return { ...owner, report: snapshot };
    }
    const doc = previous ? { ...previous, inputs, meta: { ...previous.meta, name } } : createDesign(tool, name, inputs);
    if (previous && previous.schema < tool.schema) {
      if (!adapter.migrate) throw new Error('This tool cannot migrate the saved design schema.');
      doc.schema = tool.schema;
      doc.toolVersion = tool.version;
    }
    delete doc.pending;
    if (previous && JSON.stringify(previous.inputs) !== JSON.stringify(inputs)) {
      delete doc.report;
      delete doc.reportHash;
    }
    if (tool.id === 'calccanvas') doc.report = inputs;
    else if (includeReport && adapter.report) {
      doc.report = await adapter.report();
      delete doc.reportHash;
    }
    if (doc.report && !doc.reportHash) doc.reportHash = await hashReport(doc.report);
    return doc;
  }

  async function persist(doc) {
    if (!current || reportOwner) {
      await db.saveDesign(doc);
      return doc;
    }
    await db.updateDesign(doc.id, latest => {
      if (latest.schema !== current.schema || latest.tool !== tool.id
        || latest.pending !== current.pending || JSON.stringify(latest.inputs) !== JSON.stringify(current.inputs)) {
        throw new Error('This design changed in another tab. Reopen it before saving.');
      }
      const name = doc.meta.name === current.meta.name ? latest.meta.name : doc.meta.name;
      doc = { ...doc, meta: { ...latest.meta, name } };
      if (doc.report === current.report && JSON.stringify(doc.inputs) === JSON.stringify(current.inputs)
        && JSON.stringify(latest.report) !== JSON.stringify(current.report)) {
        doc.report = latest.report;
        doc.reportHash = latest.reportHash;
      }
      return doc;
    });
    named.value = doc.meta.name;
    return doc;
  }

  async function save() {
    const doc = await persist(await capture());
    current = doc;
    if (reportOwner) { message('Report saved.'); return doc; }
    location.searchParams.set('design', doc.id);
    location.searchParams.delete('new');
    location.searchParams.delete('legacy');
    location.searchParams.delete('report');
    history.replaceState(null, '', location);
    message('Design saved.');
    return doc;
  }

  function handler(name, callback) {
    action(name).addEventListener('click', async () => {
      if (busy) return;
      setBusy(true);
      try { await callback(); }
      catch (error) { message(error.message); }
      finally { setBusy(false); }
    });
  }

  handler('new', () => {
    const url = new URL(location);
    url.search = '?new=1';
    window.location.assign(url);
  });
  handler('open', () => {
    const url = new URL(workspace);
    url.hash ||= 'designs';
    window.location.assign(url);
  });
  handler('save', save);
  handler('copy', async () => {
    const doc = duplicateDesign(await capture());
    await db.saveDesign(doc);
    const url = new URL(location);
    url.search = '?design=' + doc.id;
    window.location.assign(url);
  });
  handler('project', async () => {
    const design = await save();
    const url = new URL(home);
    url.searchParams.set('add', design.id);
    window.location.assign(url);
  });
  handler('report', async () => {
    if (!getAdapter()?.report && tool.id !== 'calccanvas') {
      await getAdapter()?.openNativeReport?.();
      return;
    }
    let doc = await capture(true);
    if (!doc.report) throw new Error('Run the calculation before opening a report.');
    doc = await persist(doc);
    current = doc;
    location.searchParams.set('design', doc.id);
    location.searchParams.delete('new');
    location.searchParams.delete('legacy');
    location.searchParams.delete('report');
    history.replaceState(null, '', location);
    const url = new URL(reportUrl);
    url.searchParams.set('report', doc.id);
    for (const [param, value] of workspace.searchParams) url.searchParams.set(param, value);
    window.location.assign(url);
  });
  handler('export', async () => {
    const doc = locked ? current : await capture();
    download(await exportPackage({ designs: [doc] }), doc.meta.name + '.mcalc');
    message('Design exported.');
  });

  setBusy(true);
  (async () => {
    try {
      if (reportOwner) {
        const changed = reportOwner.reportHash && await hashReport(reportOwner.report) !== reportOwner.reportHash;
        message(changed ? 'Edited report snapshot.' : 'Saved report snapshot.');
      } else if (key) {
        current = await db.getDesign(key);
        if (!current || current.tool !== tool.id) {
          current = undefined;
          throw new Error('This design is unavailable for this tool.');
        }
        named.value = current.meta.name;
        if (current.schema > tool.schema) throw new Error('This design was created in a newer version. Export it from this read-only view.');
        const adapter = getAdapter();
        if (!adapter) throw new Error('The tool did not finish opening.');
        if (current.pending) {
          await adapter.reset?.();
          message('Save to keep your calculation inputs.');
        } else await adapter.restore(await migrateToolInputs(current, tool, adapter));
      } else if (location.searchParams.has('new')) {
        await getAdapter()?.reset?.();
      }
    } catch (error) {
      locked = true;
      for (const element of document.body.children) if (element !== bar && element instanceof HTMLElement) element.inert = true;
      message(error.message);
    } finally {
      setBusy(false);
    }
  })();
}
