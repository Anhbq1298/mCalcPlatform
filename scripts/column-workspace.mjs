import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reinforcementEditorEdits } from './column-reinforcement-editor.mjs';
import { shearBasis, shearDefaults, shearScope } from '../tools/mbcolumn-lite/src/shear.mjs';

const fields = `      <label class="check"><input id="shearEnabled" type="checkbox"> Check directional shear (EC2 2023)</label>
      <label class="f"><span>Link Ø (mm)</span> <input id="link" type="number" step="1" min="0"></label>
      <div class="fields" id="shearFields" hidden>
        <label class="f"><span>Link spacing (mm)</span><input id="shearSpacing" type="number" min="1"></label>
        <label class="f"><span>Link fyk (MPa)</span><input id="shearFyk" type="number" min="1"></label>
        <label class="f wide"><span>Link layout</span><select id="shearLayout" aria-label="Link layout">
          <option value="auto">Automatic from reinforcement</option>
          <option value="manual">Manual effective legs</option>
        </select></label>
        <label class="f" data-manual-legs><span>Effective X legs</span><input id="shearLegsX" type="number" min="2" step="1"></label>
        <label class="f" data-manual-legs><span>Effective Y legs</span><input id="shearLegsY" type="number" min="2" step="1"></label>
        <label class="check wide"><input id="shearClassA" type="checkbox"> Class A links</label>
        <p class="hint wide">${shearScope}</p>
      </div>
      <p class="hint" id="shear-link-legend" aria-live="polite"></p>`;

const bindings = `  const shearFields = [['shearSpacing', 'spacing'], ['shearFyk', 'fyk'],
    ['shearLegsX', 'legsX'], ['shearLegsY', 'legsY']];
  function syncShearVisibility() {
    $('shearFields').hidden = !state.shear.enabled;
    document.querySelectorAll('[data-manual-legs]').forEach(label => {
      label.hidden = state.shear.mode !== 'manual';
    });
  }
  function syncShear() {
    $('shearEnabled').checked = state.shear.enabled;
    $('shearClassA').checked = state.shear.classA;
    $('shearLayout').value = state.shear.mode;
    syncShearVisibility();
    for (const [id, key] of shearFields) $(id).value = state.shear[key];
  }
  $('shearEnabled').addEventListener('change', () => {
    state.shear.enabled = $('shearEnabled').checked;
    refreshShearDraft();
  });
  $('shearLayout').addEventListener('change', () => {
    state.shear.mode = $('shearLayout').value;
    refreshShearDraft();
  });
  $('shearClassA').addEventListener('change', () => {
    state.shear.classA = $('shearClassA').checked;
  });
  for (const [id, key] of shearFields) $(id).addEventListener('input', () => {
    state.shear[key] = $(id).valueAsNumber;
    refreshShearDraft();
  });

  $('link').addEventListener('input', () => {
    state.link = $('link').valueAsNumber;
    refreshShearDraft();
  });

  function autoLinkLayout() {
    const bars = state.bars.map(bar => {
      const definition = barByName(bar.bar);
      return { x: bar.x, y: bar.y, radius: definition.extentR, bundle: definition.count > 1 };
    });
    return window.mcalcLinkLayout?.generate({ b: state.b, h: state.h, cover: state.cover, link: state.link, bars });
  }
  window.addEventListener('mcalc-column-drawing-ready', () => draw());

  function syncInputs() {
    syncShear();`;

const linkDrawing = `    // Generated links use the same geometry as the effective leg counts.
    const automaticLinks = state.shear.enabled && state.shear.mode === 'auto' ? autoLinkLayout() : null;
    if (automaticLinks?.shapes) {
      window.mcalcLinkLayout.draw(g, automaticLinks, toScreen, view.s, state.link);
    }
    const { mode, spacing } = state.shear;
    const legs = mode === 'auto' ? automaticLinks : state.shear;
    const linkCaption = 'Link Ø' + state.link + ' @ ' + spacing + ' mm';
    const legCaption = legs && !legs.error ? ' · X legs: ' + legs.legsX + ' · Y legs: ' + legs.legsY : '';
    const caption = !state.shear.enabled ? 'Off' :
      (mode === 'auto' ? 'Auto' : 'Manual') + ' · ' + linkCaption + legCaption +
      (automaticLinks?.error ? ' · Layout unavailable' : '');
    if (!activeEditor?.committed) {
      const output = $('committed-shear-summary');
      if (output.textContent !== caption) output.textContent = caption;
    }
    if (activeEditor?.kind === 'shear') {
      const output = $('shear-link-legend');
      const detail = automaticLinks?.error ?? (state.shear.enabled && mode === 'manual'
        ? 'Outer hoop shown. Interior leg positions and anchorage depend on the detailing.'
        : automaticLinks?.bundles ? 'Links wrap the bundle envelope.' : '');
      const text = detail ? caption + ' · ' + detail : caption;
      if (output.textContent !== text) output.textContent = text;
      output.classList.toggle('error', Boolean(automaticLinks?.error));
    }
`;

export async function integrateColumnWorkspace(root, patch) {
  const path = 't/mbcolumn-lite/index.html';
  const file = join(root, path);
  const source = await readFile(file, 'utf8');
  const solver = source.slice(source.indexOf('  // Private server-side solver.'), source.indexOf('  // ── Inputs ──'));
  if (!solver.startsWith('  // Private server-side solver.') || !solver.includes('const solver =')) {
    throw new Error('The upstream column solver integration changed.');
  }
  await patch(root, path, [
    ['<html lang="en">\n<head>', '<html lang="en" data-theme="light">\n<head>'],
    ...reinforcementEditorEdits(source, fields),
    ['aria-label="Column section with rebar positions"', 'aria-label="Column section with rebar and shear links"'],
    ['    // link (stirrup) band', linkDrawing + '    // link (stirrup) band'],
    ['    if (w - 2 * cov > 0 && hh - 2 * cov > 0) {',
      '    if (!automaticLinks?.shapes && w - 2 * cov > 0 && hh - 2 * cov > 0) {'],
    ['    // dimensions\n', '    // dimensions\n    window.mcalcLinkLayout?.dimensions(g, x0, y0, w, hh, state.b, state.h);\n    if (!window.mcalcLinkLayout) {\n'],
    ['    // bars\n', '    }\n\n    // bars\n'],
    ['g.fillStyle = concrete; g.globalAlpha = 0.55;', "g.fillStyle = '#f9fafb'; g.globalAlpha = 1;"],
    ['g.strokeStyle = ink2; g.globalAlpha = 0.16;', "g.strokeStyle = '#87909a'; g.globalAlpha = 0.19;"],
    ['      g.fillStyle = steel;\n      for (const [ox, oy] of def.offsets)', "      g.fillStyle = '#182430';\n      for (const [ox, oy] of def.offsets)"],
    ["<script>\nwindow.MBCOLUMN_API_URL = window.MBCOLUMN_API_URL || 'https://mbcolumnlite-api-sg.onrender.com';\n</script>\n", ''],
    [solver, `  const solver = {
    mode: 'local solver',
    call(route, input) { return window.mcalcColumnSolver(route, input); },
    run(input) { return this.call('analyse', input); },
  };

`],
    ['title="Calculate section capacity using private API"', 'disabled title="Calculate section capacity and enabled shear checks"'],
    ['// Calculations run on the private backend; report reference tables remain public.', '// Calculate slenderness and effective creep in the local worker.'],
    ["['C30/37', 30], ['C35/45', 35]", "['C30/37', 30], ['C32/40', 32], ['C35/45', 35]"],
    ["concreteGrade: 'C30/37', steelGrade: 'B500B', fc: 30", "concreteGrade: 'C32/40', steelGrade: 'B500B', fc: 32"],
    ['b: 600, h: 600, cover: 40', 'b: 600, h: 1000, cover: 40'],
    ['id="h" type="number" step="25" min="100" value="600"', 'id="h" type="number" step="25" min="100" value="1000"'],
    ["{ name: 'ULS 1', p: 3000, mx: 250, my: 120, mxb: 250, myb: 120 }",
      "{ name: 'ULS 1', p: 3000, mx: 250, my: 120, mxb: 250, myb: 120, vx: 150, vy: 250 }"],
    ['    bars: [],\n    loads: [', '    shear: ' + JSON.stringify(shearDefaults) + ',\n    bars: [],\n    loads: ['],
    ["  function syncInputs() {", bindings],
    ["    $('loadCols').innerHTML", `    if (state.shear.enabled) cols.push(['vx', 'Vx (kN)'], ['vy', 'Vy (kN)']);
    $('loadCols').innerHTML`],
    ['      <div class="verdict" id="verdict">', '      <section id="column-shear-results" hidden></section>\n      <div class="verdict" id="verdict">'],
    ['    runSeq++; lastResult = null; lastSlender = null; lastPhi = null;', '    runSeq++; lastResult = null; lastSlender = null; lastPhi = null;\n    window.mcalcColumnShear?.render();\n    window.mcalcColumnSummary?.(null, null, null, false, \'Click Calculate to check the section.\');'],
    ['      const out = await solver.run(input);', `      if (state.shear.enabled) input.shear = {
        diameter: state.link, links: window.mcalcLinkLayout.resolve(state.shear, autoLinkLayout()),
        loads: state.loads.map(({ name, p, vx, vy }) => ({ name, p, vx, vy })),
      };
      const out = await solver.run(input);`],
    ['      lastResult = out; renderResults(out);', '      lastResult = out; renderResults(out);\n      window.mcalcColumnShear.render(out.shear, out.shearError);\n      window.mcalcColumnSummary(out, lastSlender, state.loads, state.shear.enabled);'],
    ["    setStatus('Solving…', false, true);", "    setStatus('Solving…', false, true);\n    window.mcalcColumnSummary(null, null, null, false, 'Calculating…');"],
    ['        setStatus(message, true);', '        setStatus(message, true);\n        window.mcalcColumnShear.render();\n        window.mcalcColumnSummary(null, null, null, false, message);'],
    ['  function showInvalid(problem) {', '  function showInvalid(problem) {\n    window.mcalcColumnShear.render();\n    window.mcalcColumnSummary(null, null, null, false, problem);'],
    ['. Check Render service and ALLOWED_ORIGINS.', ''],
    ['[load.p, load.mx, load.my].every(finite)', '[load.p, load.mx, load.my, load.vx ?? 0, load.vy ?? 0].every(finite)'],
    ['      state = { ...state, ...structuredClone(inputs) };', `      const incoming = structuredClone(inputs);
      state = { ...state, ...incoming, shear: window.mcalcLinkLayout.restore(${JSON.stringify(shearDefaults)}, incoming.shear) };`],
    ['      govIndex: out.govIndex,', `      shearRows: window.mcalcColumnShear.rows(out.shear),
      shearError: out.shearError,
      shearBasis: ${JSON.stringify(shearBasis + '. ' + shearScope)},
      govIndex: out.govIndex,`],
    ['<h2>Load cases and capacity</h2>', `\${d.shearRows.length || d.shearError ? '<h2>Directional shear</h2><p>' + escapeHtml(d.shearBasis) + '</p>'
  + (d.shearError ? '<p>' + escapeHtml(d.shearError) + '</p>' : grid(window.mcalcColumnShear.columns, d.shearRows)) : ''}
<h2>Load cases and capacity</h2>`],
    ["      h2('Load cases and capacity');", `      if (d.shearRows.length || d.shearError) {
        h2('Directional shear');
        kv([['Method', d.shearBasis], ...(d.shearError ? [['Status', d.shearError]] : [])]);
        if (d.shearRows.length) grid(window.mcalcColumnShear.columns, d.shearRows, [23, 9, 16, 14, 25, 25, 26, 19, 24]);
      }
      h2('Load cases and capacity');`],
  ]);
  const integrated = await readFile(file, 'utf8');
  await writeFile(file, integrated.replaceAll('MBColumn Lite', 'mConcreteRecCol'));
}
