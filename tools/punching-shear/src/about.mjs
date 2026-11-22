// "About" panel: what is verified against published examples, what is pending, and how the tool handles
// the points where EN 1992-1-1 leaves room for interpretation. Kept in step with help.html §8 and SOURCES.md.

const VERIFIED = [
  ['v_Rd,c (Eq. 6.47), k, ρ_l, v_min (Eq. 6.3N)', 'CSI SAFE RC-PN-001, JRC EUR 26566 B2, Dlubal VE 1028', '≤ 0.1 % (v_min JRC 1 %, source rounding)'],
  ['u0, u1, v_Ed = β·V/(u·d)', 'CSI SAFE, JRC B2, Dlubal VE 1023 / 1028', '≤ 0.22 %'],
  ['v_Rd,max = 0.4·ν·f_cd (Eq. 6.53)', 'JRC B2', '0.00 %'],
  ['f_ywd,ef = 250 + 0.25d', 'JRC B2', '0.00 %'],
  ['u_out = β·V/(v_Rd,c·d) (Eq. 6.54), a_out', 'JRC B2', '0.08 %'],
  ['A_sw per perimeter (Eq. 6.52)', 'JRC B2 (830 mm² at s_r = 123)', 'Same at equal s_r (tool rounds s_r down to 5 mm)'],
  ['u_out,ef of a cruciform layout (Fig. 6.22 B)', 'Ancon Shearfix EC2 manual, Example 16.1', '6371 mm, exact'],
  ['β from moments (Eq. 6.39 / 6.42 / 6.43), u1 with openings, edge and corner perimeters', 'Hand calculations in scripts/verification.mjs and unit tests', 'Independent formulas, 1e-6'],
];

const PENDING = [
  'u_out,ef of radial and grid layouts: same rule as the cruciform check, no published example yet.',
  'Comparison of the three arrangements for one design: no published source.',
  'Drop panels (Fig. 6.17 / 6.18) with links, and links beyond the drop: no published example; l_H ≤ 2h_H with links is reported Not verified.',
  'Edge and corner columns with links, openings with links: hand checks only.',
  'Singapore and UK National Annex profiles: Not verified until the values are confirmed by the user.',
  'Dlubal VE 1028 v_Rd,cs and u_out,ef differ (7 %, 17 %) because the source uses the DIN NA, not the CEN values.',
  'JRC B2 reports "links OK"; the tool fails k_max·v_Rd,c = 1.5·v_Rd,c (A1:2014 Note), which the source does not apply.',
];

const HANDLING = [
  ['Required vs effective outer perimeter', 'u_out,req = β·V/(v_Rd,c·d) depends on load and concrete only. u_out,ef runs 1.5d outside the outer links; where two adjacent outer links are more than 2d apart only d beyond each counts: u_out,ef = Σ min(L_i, 2d) + 2π·1.5d (internal columns without openings or a drop). Check: u_out,ef ≥ u_out,req and outer links ≥ a_out − 1.5d.', 'Interpretation of Fig. 6.22, agrees with Ancon'],
  ['Tangential spacing s_t', '≤ 1.5d inside u1 is a check. Outside u1 a gap > 2d is excluded from u_out,ef rather than failed (§9.4.3(1)), and Eq. 9.11 uses s_t = 2d. For cruciform rails only gaps along a column face count; the corner gaps are covered by u_out,ef (Fig. 6.22 B shows them > 1.5d).', 'Interpretation'],
  ['Auto arrangement', 'User enters s_r (capped at 0.75d) and, for the grid, s_t. Radial and cruciform take the fewest rails that give s_t ≤ 1.5d in u1, u_out,ef ≥ u_out,req and the Eq. 6.52 A_sw on every perimeter. Cruciform widens its arms: longer rails do not raise u_out,ef.', 'Tool procedure'],
  ['Eq. 6.52', 'Smallest effective A_sw of any perimeter and the largest radial spacing between perimeters.', 'Conservative'],
  ['k_max', '1.5·v_Rd,c (A1:2014 Note, recommended); a failure here cannot be fixed by links.', 'Code (recommended value)'],
  ['Moments', 'Only through β; the check is uniform β·v_Ed. The stress figure shows the plastic distribution of Fig. 6.19 for illustration.', 'Code'],
  ['Link detailing', 'Links are assumed to enclose the top and bottom flexural bars; the tool does not check this.', 'Stated assumption'],
];

const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function aboutHtml() {
  const verified = VERIFIED.map(([q, src, agree]) => `<tr><td>${esc(q)}</td><td>${esc(src)}</td><td>${esc(agree)}</td></tr>`).join('');
  const pending = PENDING.map(item => `<li>${esc(item)}</li>`).join('');
  const handling = HANDLING.map(([topic, how, basis]) => `<tr><td>${esc(topic)}</td><td>${esc(how)}</td><td>${esc(basis)}</td></tr>`).join('');
  return `<h2>About mPunchingShear</h2>
<p>EN 1992-1-1:2004 + AC:2010 + A1:2014, §6.4 punching, CEN recommended values. A design is reported Pass only for checks the tool implements; anything outside them is Not verified or Not supported.</p>
<h3><span class="badge verified">Verified</span> against published examples</h3>
<table><thead><tr><th>Quantity</th><th>Source</th><th>Agreement</th></tr></thead><tbody>${verified}</tbody></table>
<h3><span class="badge pending">Pending</span> not yet verified</h3>
<ul>${pending}</ul>
<h3>How the tool handles open points</h3>
<table><thead><tr><th>Topic</th><th>Handling</th><th>Basis</th></tr></thead><tbody>${handling}</tbody></table>
<p class="note">Details, figures and references: <a href="help.html" target="_blank" rel="noopener">Help</a>, sections 6 to 8.</p>`;
}

// Opens the About dialog from the title-bar button.
export function installAbout(button, dialog) {
  if (!button || !dialog) return;
  dialog.querySelector('.about-body').innerHTML = aboutHtml();
  button.addEventListener('click', () => dialog.showModal());
  dialog.querySelector('.about-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
