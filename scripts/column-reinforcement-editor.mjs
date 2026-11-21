function dialog(id, title, controls) {
  return `<dialog id="${id}" class="reinforcement-dialog" aria-labelledby="${id}-title">
    <header>
      <h2 id="${id}-title">${title}</h2>
      <button class="btn dialog-close" type="button" data-cancel aria-label="Close ${title.toLowerCase()}">×</button>
    </header>
    <div class="reinforcement-dialog-body">
      <div class="reinforcement-controls">${controls}</div>
      <div class="reinforcement-drawing">
        <button class="btn" type="button" data-fit>Fit view</button>
        <div class="reinforcement-slot"></div>
      </div>
    </div>
    <footer>
      <p class="hint" role="status" data-editor-message></p>
      <button class="btn" type="button" data-cancel>Cancel</button>
      <button class="btn primary" type="button" data-apply>Apply</button>
    </footer>
  </dialog>`;
}

const reinforcementRows = `      <h2>Reinforcement</h2>
      <div class="reinforcement-row">
        <div>
          <strong>Longitudinal reinforcement</strong>
          <p class="hint" id="committed-bar-summary"></p>
        </div>
        <button class="btn" type="button" id="browse-bars" aria-haspopup="dialog" aria-label="Browse longitudinal reinforcement">Browse…</button>
      </div>
      <div class="reinforcement-row">
        <div>
          <strong>Shear reinforcement</strong>
          <p class="hint" id="committed-shear-summary"></p>
        </div>
        <button class="btn" type="button" id="browse-shear" aria-haspopup="dialog" aria-label="Browse shear reinforcement">Browse…</button>
      </div>
`;

const summaryPanel = `    <section class="panel rect-column-summary" aria-labelledby="h-summary">
      <h2 id="h-summary">Check summary</h2>
      <div id="column-check-summary" aria-live="polite"><p>Click Calculate to check the section.</p></div>
    </section>`;

const sectionBar = `      <div class="section-heading">
        <h2>Section drawing</h2>
        <button class="btn" type="button" id="fitView">Fit view</button>
        <button class="btn" type="button" id="expand-section" aria-haspopup="dialog">Expand</button>
      </div>`;

const drawingDialog = `<dialog id="section-view-dialog" class="reinforcement-dialog section-view-dialog" aria-labelledby="section-view-title">
  <header>
    <h2 id="section-view-title">Section drawing</h2>
    <button class="btn dialog-close" type="button" data-cancel aria-label="Close section drawing">×</button>
  </header>
  <div class="reinforcement-drawing">
    <button class="btn" type="button" data-fit>Fit view</button>
    <div class="reinforcement-slot"></div>
  </div>
</dialog>`;

const browserCode = `  function showEditorMessage(message, error = true) {
    const output = activeEditor.dialog.querySelector('[data-editor-message]');
    output.textContent = message;
    output.classList.toggle('error', Boolean(message) && error);
  }

  function refreshShearDraft() {
    syncShearVisibility();
    draw();
    const movesOutside = state.bars.some(bar => !insideLinks(bar));
    showEditorMessage(movesOutside ? 'Adjust the longitudinal bars to fit inside the new link line before calculating.' : '', false);
  }

  function validLegCount(count) {
    return Number.isSafeInteger(count) && count >= 2;
  }

  function editorIssue(kind) {
    if (kind === 'bars') {
      if ([...$('rebarTable').querySelectorAll('input')].some(input => !Number.isFinite(input.valueAsNumber))) {
        return 'Enter a coordinate for every bar.';
      }
      if (state.bars.length > 300) return 'Use no more than 300 bar positions.';
      return validateBarGeometry();
    }
    if (!Number.isFinite(state.link) || state.link < 0) return 'Enter a non-negative link diameter.';
    if (!state.shear.enabled) return null;
    const { spacing, fyk, mode, legsX, legsY } = state.shear;
    if (!(state.link > 0 && 2 * (state.cover + state.link) < Math.min(state.b, state.h))) {
      return 'Enter a positive link diameter that fits inside the concrete cover.';
    }
    if (!(Number.isFinite(spacing) && spacing >= 1 && Number.isFinite(fyk) && fyk >= 1)) {
      return 'Enter valid link spacing and link steel strength.';
    }
    if (mode === 'manual' && !(validLegCount(legsX) && validLegCount(legsY))) {
      return 'Enter at least two whole effective legs in each direction.';
    }
    return null;
  }

  function finishEditor(apply) {
    const editor = activeEditor;
    if (!editor) return;
    const issue = apply ? editorIssue(editor.kind) : null;
    if (issue) { showEditorMessage(issue); return; }

    if (apply && editor.kind === 'shear') {
      const { shear } = state;
      const previous = editor.committed.shear;
      if (!shear.enabled) {
        for (const key of ['spacing', 'fyk']) {
          if (!(Number.isFinite(shear[key]) && shear[key] >= 1)) shear[key] = previous[key];
        }
      }
      if (!shear.enabled || shear.mode === 'auto') {
        for (const key of ['legsX', 'legsY']) {
          if (!validLegCount(shear[key])) shear[key] = previous[key];
        }
      }
    }
    let commit = false;
    if (editor.committed) {
      const draft = state;
      clearTimeout(histTimer);
      ({ hist, hPos, mergeNote } = editor);
      histTimer = 0;
      state = editor.committed;
      if (apply && JSON.stringify(draft) !== JSON.stringify(state)) {
        state = draft;
        commit = true;
      }
    }
    activeEditor = null;
    editor.dialog.close();
    $('main-section-slot').append($('section-canvas-wrap'));
    clearSel();
    box = null;
    drag = -1;
    dragArm = null;
    setTool('move');
    cv.tabIndex = -1;
    syncInputs();
    syncFaces();
    renderRebarTable();
    if (commit) {
      renderLoadTable();
      changed();
      clearTimeout(histTimer);
      recordHistory();
    }
    layout();
    editor.trigger.focus({ preventScroll: true });
  }

  function bindEditor(kind, triggerId, dialogId) {
    const trigger = $(triggerId), dialog = $(dialogId);
    trigger.addEventListener('click', () => {
      if (activeEditor || (kind !== 'view' && $('calculateBtn').disabled)) return;
      const editor = { kind, trigger, dialog };
      if (kind !== 'view') {
        clearTimeout(histTimer);
        recordHistory();
        Object.assign(editor, { committed: state, hist, hPos, mergeNote });
        state = structuredClone(state);
        hist = [];
        hPos = -1;
        recordHistory();
        editor.dialog.querySelector('[data-editor-message]').textContent = '';
        syncInputs();
        syncFaces();
        renderRebarTable();
      }
      activeEditor = editor;
      dialog.querySelector('.reinforcement-slot').append($('section-canvas-wrap'));
      cv.tabIndex = kind === 'bars' ? 0 : -1;
      dialog.showModal();
      if (kind === 'shear') refreshShearDraft();
      layout();
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      finishEditor(false);
    });
    dialog.querySelectorAll('[data-cancel]').forEach(button =>
      button.addEventListener('click', () => finishEditor(false)));
    dialog.querySelector('[data-apply]')?.addEventListener('click', () => finishEditor(true));
    dialog.querySelector('[data-fit]').addEventListener('click', () => { fitView(); draw(); });
  }

  bindEditor('bars', 'browse-bars', 'longitudinal-editor');
  bindEditor('shear', 'browse-shear', 'shear-editor');
  bindEditor('view', 'expand-section', 'section-view-dialog');

  const sectionObserver = new ResizeObserver(layout);
  sectionObserver.observe(cv);
`;

export function reinforcementEditorEdits(source, shearFields) {
  const inputGroups = source.match(/(      <h2 id="h-design">Materials<\/h2>[\s\S]*?)(      <h2>Section<\/h2>[\s\S]*?)(?=      <h2>Slenderness<\/h2>)/);
  const stageBar = source.match(/      <div class="stagebar">[\s\S]*?      <\/div>/)?.[0];
  const rebar = source.match(/    <section class="panel" aria-labelledby="h-rebar">([\s\S]*?)    <\/section>/);
  if (!inputGroups || !stageBar || !rebar) throw new Error('The upstream reinforcement workspace markup changed.');
  const gridControls = stageBar.replace(/        <button[^\n]+id="fitView"[^\n]+\n/, '');
  const longControls = gridControls + rebar[1].replace(/^\s*<h2 id="h-rebar">.*\n/, '');
  return [
    [stageBar, sectionBar + '\n      <div id="main-section-slot">'],
    ['      <div class="canvaswrap">', '      <div class="canvaswrap" id="section-canvas-wrap">'],
    ['    </section>\n\n    <!-- ── Rebar table', '      </div>\n    </section>\n\n    <!-- ── Rebar table'],
    [rebar[0], summaryPanel],
    ['  <!-- ── Results ── -->', dialog('longitudinal-editor', 'Longitudinal reinforcement', longControls)
      + '\n' + dialog('shear-editor', 'Shear reinforcement', shearFields)
      + '\n' + drawingDialog + '\n\n  <!-- ── Results ── -->'],
    [inputGroups[0], inputGroups[2] + reinforcementRows + inputGroups[1]],
    ['<section class="panel" aria-labelledby="h-design">', '<section class="panel column-inputs" aria-label="Design inputs" tabindex="0">'],
    ['<label class="f wide"><span>Concrete grade', '<label class="f"><span>Concrete grade'],
    ['<label class="f wide"><span>Rebar grade', '<label class="f"><span>Rebar grade'],
    ['        <label class="f"><span>Link Ø (mm)</span> <input id="link" type="number" step="1" min="0" value="10"></label>\n', ''],
    [" numBind('link', 'link', () => { renderRebarTable(); draw(); });", ''],
    ['  let state = {', '  let activeEditor = null;\n  let state = {'],
    ['    slender: { on: false,', '    slender: { on: true,'],
    ['    save(); clearTimeout(timer); markNeedsCalculation();', '    save();\n    if (!activeEditor?.committed) { clearTimeout(timer); markNeedsCalculation(); }'],
    ['    clearTimeout(timer); markNeedsCalculation(); updateUndoButtons();', '    if (!activeEditor?.committed) { clearTimeout(timer); markNeedsCalculation(); }\n    updateUndoButtons();'],
    ['    const s = $(\'status\'); s.textContent', "    if (activeEditor?.kind === 'bars') { showEditorMessage(text, isError); return; }\n    const s = $('status'); s.textContent"],
    ["    const t = e.target;\n    if (t &&", "    if (activeEditor?.kind !== 'bars' || e.key === 'Escape') return;\n    const t = e.target;\n    if (t &&"],
    ["    if (!(e.ctrlKey || e.metaKey)) return;\n    // inside", "    if (activeEditor && activeEditor.kind !== 'bars') return;\n    if (!(e.ctrlKey || e.metaKey)) return;\n    // inside"],
    ['  cv.tabIndex = 0;', '  cv.tabIndex = -1;'],
    ['    const padR = 64, padL = 124, padT = 88, padB = 88;', `    const editing = activeEditor?.kind === 'bars';
    const padR = 22, padL = editing ? 105 : 52, padT = 18, padB = 53;`],
    ['    if (state.grid.show &&', "    if (activeEditor?.kind === 'bars' && state.grid.show &&"],
    ['    drawCornerBoxes(g);', ''],
    [source.slice(source.indexOf('  // White boxes:'), source.indexOf('  function hitBar(')), ''],
    ["    $('barSummary').textContent = ", "    const summary = "],
    [' · ρ ${rho.toFixed(2)}%`;\n  }', ' · ρ ${rho.toFixed(2)}%`;\n    $(\'barSummary\').textContent = summary;\n    if (!activeEditor?.committed) $(\'committed-bar-summary\').textContent = summary;\n  }'],
    ['  function validate() {', `  function validateBarGeometry() {
    if (!state.bars.length) return 'Invalid section: no rebar. Add at least one bar to check the column.';
    const out = state.bars.findIndex(r => !insideLinks(r));
    if (out >= 0) return 'Bar ' + (out + 1) + ' is outside the link line. Move it inside, or reduce the cover or link Ø.';
    return null;
  }

  function validate() {`],
    ["    if (!state.bars.length) return 'Invalid section: no rebar. Add at least one bar to check the column.';\n    if (!(state.fc", "    const barIssue = validateBarGeometry();\n    if (barIssue) return barIssue;\n    if (!(state.fc"],
    ['    const out = state.bars.findIndex((r) => !insideLinks(r));\n    if (out >= 0) return `Bar ${out + 1} is outside the link line. Move it inside, or reduce the cover or link Ø.`;\n', ''],
    ['    $(\'calculateBtn\').disabled = true;', "    $('calculateBtn').disabled = true;\n    $('browse-bars').disabled = $('browse-shear').disabled = true;"],
    ['      $(\'calculateBtn\').disabled = false;', "      $('calculateBtn').disabled = false;\n      $('browse-bars').disabled = $('browse-shear').disabled = false;"],
    ['  new ResizeObserver(layout).observe(cv.parentElement);', browserCode],
    ['snapshot: () => structuredClone(state),', 'snapshot: () => structuredClone(activeEditor?.committed ?? state),'],
    ['    restore: inputs => {\n      const finite', '    restore: inputs => {\n      if (activeEditor) finishEditor(false);\n      const finite'],
    ['    reportData: () => {\n      if (!lastResult)', "    reportData: () => {\n      if (activeEditor) throw new Error('Close the section dialog before generating a report.');\n      if (!lastResult)"],
  ];
}
