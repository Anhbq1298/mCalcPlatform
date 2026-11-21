import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function replaceOnce(text, needle, replacement) {
  if (text.split(needle).length !== 2) throw new Error('Source integration anchor changed: ' + needle);
  return text.replace(needle, () => replacement);
}

async function patch(root, path, edits) {
  const file = join(root, path);
  let source = await readFile(file, 'utf8');
  for (const [needle, replacement] of edits) source = replaceOnce(source, needle, replacement);
  await writeFile(file, source);
}

export async function integrateCanvas(root) {
  const controller = 'src/documents/documentController.ts';
  await patch(root, 'src/export/PdfExporter.tsx', [
    ['async function buildPrintView()', 'export async function buildPrintView()'],
  ]);
  await patch(root, controller, [
    ['function currentDocument()', 'export function currentDocument()'],
    ['export async function initDocuments(): Promise<void> {', `import { registerPage } from '../../platform/apps/tool-page.mjs';
import { createStore } from '../../platform/packages/design-sdk/src/index.mjs';

export async function restorePlatformWorksheet(inputs: Record<string, unknown>, detached = false): Promise<void> {
  const doc = parseDocument(inputs);
  await flushBeforeSwitch();
  await loadDocument(detached ? { ...doc, id: newId() } : doc);
}

let startup: Promise<void> | undefined;
export function initDocuments(): Promise<void> {
  return startup ??= initPlatform().catch(error => { startup = undefined; throw error; });
}

async function initPlatform(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const reportId = params.get('report');
  if (reportId) {
    const design = await createStore().getDesign(reportId);
    if (!design?.report) throw new Error('Saved report is unavailable.');
    await engine.ready();
    await restorePlatformWorksheet(design.report, true);
    if (params.has('print')) {
      try {
        await engine.idle();
        await (await import('../export/PdfExporter')).buildPrintView();
        document.documentElement.dataset.packagePrint = 'ready';
      } catch (error) {
        document.documentElement.dataset.packagePrint = error instanceof Error ? error.message : String(error);
      }
      return;
    }
  } else if (params.has('new')) {
    await engine.ready();
    await newDocument();
  } else await initLegacyDocuments();
  registerPage('calccanvas', {
    snapshot: () => ({ ...currentDocument(), updatedAt: useAppStore.getState().savedAt ?? useAppStore.getState().createdAt }),
    restore: restorePlatformWorksheet,
  });
}

async function initLegacyDocuments(): Promise<void> {`],
  ]);
}

export async function integrateSteel(root) {
  const prefix = "import { registerPage, resolveReport } from '../../../platform/apps/tool-page.mjs';\n";
  await patch(root, 'src/tools/steel/App.tsx', [
    ["import { sectionById }", prefix + "import { sectionById }"],
    ["window.open('../?open=handoff'", "window.open('../../calc/?open=handoff'"],
    ["useState<Page>(load)", "useState<Page>(() => new URLSearchParams(window.location.search).has('new') ? DEFAULT : load())"],
    ["  const download = () =>", `  useEffect(() => {
    registerPage('steel-beam-column', {
      snapshot: () => page,
      restore: raw => {
        const next = raw as unknown as Page;
        const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
        if (!['I', 'RHS', 'CHS'].includes(next.shape) || !I_FAMILIES.some(family => family === next.family)
          || !next.rhs || !next.chs || !next.member || !Array.isArray(next.combos)
          || !next.combos.every(combo => combo && typeof combo.name === 'string' && COLS.every(([key]) => finite(combo[key])))
          || ![next.rhs.h, next.rhs.b, next.rhs.t, next.chs.d, next.chs.t, next.fyNom, next.gammaM0, next.eta].every(finite)) {
          throw new Error('Invalid steel beam-column design inputs.');
        }
        sectionById(next.sectionId);
        const member = { ...DEFAULT_MEMBER, ...next.member };
        setPage({ ...DEFAULT, ...next, member: { ...member, ...cmValues(member.cmDef?.calc ? member.cmDef : undefined) } });
      },
      report: () => {
        if (busy) throw new Error('Wait for the steel calculation to finish.');
        return resolveReport(withReport);
      },
    });
  });
  const download = () =>`],
  ]);
}

export async function integrateComposite(root) {
  const prefix = "import { registerPage, resolveReport } from '../../../platform/apps/tool-page.mjs';\n";
  await patch(root, 'src/tools/composite/App.tsx', [
    ["import { sections }", prefix + "import { sections }"],
    ["window.open('../?open=handoff'", "window.open('../../calc/?open=handoff'"],
    ["  if (!state) {", `  useEffect(() => {
    if (!state) return;
    registerPage('composite-beam', {
      snapshot: () => snap(),
      restore: raw => {
        const next = raw as unknown as Snap;
        if (!next.values || !Object.values(next.values).every(value => Number.isFinite(value))
          || !next.rows || !Object.values(next.rows).every(rows => Array.isArray(rows)
            && rows.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string')))
          || !next.bracing || !next.taper || !next.slab || !sections.some(section => section.id === next.sectionId)) {
          throw new Error('Invalid composite beam design inputs.');
        }
        apply(next);
      },
      report: () => {
        if (busy) throw new Error('Wait for the composite calculation to finish.');
        return resolveReport(withReport);
      },
    });
  });

  if (!state) {`],
  ]);
}

export async function integrateColumn(root) {
  await patch(root, 't/mbcolumn-lite/index.html', [
    ["    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');",
      "    const saved = new URLSearchParams(location.search).has('new') ? null : JSON.parse(localStorage.getItem(STORE_KEY) || 'null');"],
    ['  setTimeout(typesetLabels, 600);', `  window.mcalcColumnAdapter = {
    snapshot: () => structuredClone(state),
    restore: inputs => {
      const finite = value => typeof value === 'number' && Number.isFinite(value);
      if (!inputs || ![inputs.b, inputs.h, inputs.fc, inputs.fy, inputs.es].every(finite)
        || !inputs.grid || !finite(inputs.grid.spacing) || inputs.grid.spacing < 1
        || !Array.isArray(inputs.bars) || inputs.bars.length > 300
        || !inputs.bars.every(bar => bar && finite(bar.x) && finite(bar.y) && typeof bar.bar === 'string')
        || !Array.isArray(inputs.loads) || inputs.loads.length > 50
        || !inputs.loads.every(load => load && typeof load.name === 'string' && [load.p, load.mx, load.my].every(finite))) {
        throw new Error('Invalid concrete column design inputs.');
      }
      state = { ...state, ...structuredClone(inputs) };
      clearSel(); syncInputs(); renderRebarTable(); renderLoadTable(); layout(); changed();
    },
    reportData: () => {
      if (!lastResult) throw new Error('Run the column calculation before generating a report.');
      return { data: reportData(), images: captureImages(),
        headers: { bars: BAR_HEAD, slenderness: SL_HEAD, cases: state.slender.on ? CASE_HEAD_SL : CASE_HEAD_FIRST } };
    },
  };
  setTimeout(typesetLabels, 600);`],
    ['</script>\n</body>\n</html>', '</script>\n<script type="module" src="/platform/apps/mbcolumn-page.mjs"></script>\n</body>\n</html>'],
  ]);
}
