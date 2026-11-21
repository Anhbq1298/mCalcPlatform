import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { shearBasis, shearDefaults, shearScope } from '../tools/mbcolumn-lite/src/shear.mjs';

const fields = `<h2>Shear</h2>
      <label class="check"><input id="shearEnabled" type="checkbox"> Check directional shear (EC2 2023)</label>
      <div class="fields" id="shearFields" hidden>
        <label class="f"><span>Link spacing (mm)</span><input id="shearSpacing" type="number" min="1"></label>
        <label class="f"><span>Link fyk (MPa)</span><input id="shearFyk" type="number" min="1"></label>
        <label class="f"><span>Effective X legs</span><input id="shearLegsX" type="number" min="2" step="1"></label>
        <label class="f"><span>Effective Y legs</span><input id="shearLegsY" type="number" min="2" step="1"></label>
        <label class="check wide"><input id="shearClassA" type="checkbox"> Class A links</label>
        <p class="hint wide">${shearScope}</p>
      </div>
      <h2>Load cases</h2>`;

const bindings = `  const shearFields = [['shearSpacing', 'spacing'], ['shearFyk', 'fyk'],
    ['shearLegsX', 'legsX'], ['shearLegsY', 'legsY']];
  function syncShear() {
    $('shearEnabled').checked = state.shear.enabled;
    $('shearFields').hidden = !state.shear.enabled;
    $('shearClassA').checked = state.shear.classA;
    for (const [id, key] of shearFields) $(id).value = state.shear[key];
  }
  $('shearEnabled').addEventListener('change', () => {
    state.shear.enabled = $('shearEnabled').checked;
    syncShear(); renderLoadTable(); draw(); changed();
  });
  $('shearClassA').addEventListener('change', () => {
    state.shear.classA = $('shearClassA').checked;
    changed();
  });
  for (const [id, key] of shearFields) $(id).addEventListener('input', () => {
    state.shear[key] = $(id).valueAsNumber || 0;
    draw(); changed();
  });

  function syncInputs() {
    syncShear();`;

const linkDrawing = `    // Show the outer link and the effective legs as a section schematic.
    const shearLegend = $('shear-link-legend');
    shearLegend.hidden = !state.shear.enabled;
    if (state.shear.enabled) {
      const { legsX, legsY, spacing } = state.shear;
      const inset = cov + lk / 2;
      const left = x0 + inset, top = y0 + inset;
      const width = w - 2 * inset, height = hh - 2 * inset;
      const hasLink = lk > 0 && w > 2 * (cov + lk) && hh > 2 * (cov + lk);
      const validCount = count => Number.isSafeInteger(count) && count >= 2;
      const canDraw = (count, span) => validCount(count) && count <= 300 && span / (count - 1) >= 3;
      const summary = 'Link Ø' + state.link + ' @ ' + spacing + ' mm · X legs: ' + legsX + ' · Y legs: ' + legsY;
      let note = 'Schematic · dashed interior legs: red X and green Y. Verify positions and anchorage from the detailing.';
      if (!hasLink) note = 'Enter a link diameter and cover that fit the section.';
      else if (!validCount(legsX) || !validCount(legsY)) note = 'Enter at least two whole legs in each direction.';
      else if ((legsX > 2 && !canDraw(legsX, height)) || (legsY > 2 && !canDraw(legsY, width))) {
        note = 'Some interior legs are too closely spaced to show in this view. Check the detailing.';
      }
      const caption = summary + ' · ' + note;
      if (shearLegend.textContent !== caption) shearLegend.textContent = caption;
      if (hasLink) {
        g.save();
        g.strokeStyle = steel;
        g.lineWidth = Math.max(2, lk / 2);
        g.strokeRect(left, top, width, height);
        g.lineWidth = 2;
        g.setLineDash([5, 3]);
        if (canDraw(legsX, height)) {
          g.strokeStyle = css('--axis-x');
          for (let n = 1; n < legsX - 1; n++) {
            const y = top + height * n / (legsX - 1);
            g.beginPath(); g.moveTo(left, y); g.lineTo(left + width, y); g.stroke();
          }
        }
        if (canDraw(legsY, width)) {
          g.strokeStyle = css('--axis-y');
          for (let n = 1; n < legsY - 1; n++) {
            const x = left + width * n / (legsY - 1);
            g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + height); g.stroke();
          }
        }
        g.restore();
      }
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
    ['      <div class="canvaswrap">', '      <p class="hint" id="shear-link-legend" hidden></p>\n      <div class="canvaswrap">'],
    ['aria-label="Column section with rebar positions"', 'aria-label="Column section with rebar and shear links" aria-describedby="shear-link-legend"'],
    ['    // centroid axes', linkDrawing + '    // centroid axes'],
    ["<script>\nwindow.MBCOLUMN_API_URL = window.MBCOLUMN_API_URL || 'https://mbcolumnlite-api-sg.onrender.com';\n</script>\n", ''],
    [solver, `  const solver = {
    mode: 'local solver',
    call(route, input) { return window.mcalcColumnSolver(route, input); },
    run(input) { return this.call('analyse', input); },
  };

`],
    ['title="Calculate section capacity using private API"', 'disabled title="Calculate section capacity and enabled shear checks"'],
    ['// Calculations run on the private backend; report reference tables remain public.', '// Calculate slenderness and effective creep in the local worker.'],
    ['    bars: [],\n    loads: [', '    shear: ' + JSON.stringify(shearDefaults) + ',\n    bars: [],\n    loads: ['],
    ["  function syncInputs() {", bindings],
    ['<h2>Load cases</h2>', fields],
    ["    $('loadCols').innerHTML", `    if (state.shear.enabled) cols.push(['vx', 'Vx (kN)'], ['vy', 'Vy (kN)']);
    $('loadCols').innerHTML`],
    ['      <div class="verdict" id="verdict">', '      <section id="column-shear-results" hidden></section>\n      <div class="verdict" id="verdict">'],
    ['    runSeq++; lastResult = null; lastSlender = null; lastPhi = null;', '    runSeq++; lastResult = null; lastSlender = null; lastPhi = null;\n    window.mcalcColumnShear?.render();'],
    ['      const out = await solver.run(input);', `      if (state.shear.enabled) input.shear = {
        diameter: state.link, links: { ...state.shear },
        loads: state.loads.map(({ name, p, vx, vy }) => ({ name, p, vx, vy })),
      };
      const out = await solver.run(input);`],
    ['      lastResult = out; renderResults(out);', '      lastResult = out; renderResults(out);\n      window.mcalcColumnShear.render(out.shear, out.shearError);'],
    ['. Check Render service and ALLOWED_ORIGINS.', ''],
    ['[load.p, load.mx, load.my].every(finite)', '[load.p, load.mx, load.my, load.vx ?? 0, load.vy ?? 0].every(finite)'],
    ['      state = { ...state, ...structuredClone(inputs) };', `      const incoming = structuredClone(inputs);
      state = { ...state, ...incoming, shear: { ...${JSON.stringify(shearDefaults)}, ...incoming.shear } };`],
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
