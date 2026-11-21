// The variable names identify editable definitions in the pinned Canvas worksheet.
export const inputGroups = [
  ['Materials', [
    ['concrete', 'Concrete fck (MPa)', 'f_{ck}', 'MPa', 35, 12, 90],
    ['steel', 'Longitudinal steel fyk (MPa)', 'f_{yk}', 'MPa', 500, 1],
    ['spiralSteel', 'Spiral steel fyk (MPa)', 'f_{ywk}', 'MPa', 500, 1],
    ['classA', 'Class A spirals', '\\delta_{A}', '', 0, 0, 1, 1],
  ]],
  ['Section', [
    ['diameter', 'Diameter (mm)', 'D', 'mm', 1200, 1],
    ['cover', 'Cover to spiral (mm)', 'c_{nom}', 'mm', 75, 0],
    ['cages', 'Reinforcement cages', 'n_{set}', '', 1, 1, 2, 1],
  ]],
  ['Outer cage', [
    ['bar1', 'Outer bar diameter (mm)', '\\phi_{l1}', 'mm', 32, 1],
    ['count1', 'Outer bar count', 'n_{l1}', '', 22, 3, 300, 1],
    ['spiral1', 'Outer spiral diameter (mm)', '\\phi_{w1}', 'mm', 20, 1],
    ['pitch1', 'Outer spiral pitch (mm)', 's_{1}', 'mm', 85, 1],
  ]],
  ['Inner cage', [
    ['bar2', 'Inner bar diameter (mm)', '\\phi_{l2}', 'mm', 25, 1],
    ['count2', 'Inner bar count', 'n_{l2}', '', 16, 3, 300, 1],
    ['spiral2', 'Inner spiral diameter (mm)', '\\phi_{w2}', 'mm', 16, 1],
    ['pitch2', 'Inner spiral pitch (mm)', 's_{2}', 'mm', 150, 1],
  ]],
  ['Design actions', [
    ['axial', 'NEd (kN, compression positive)', 'N_{Ed}', 'kN', 8000],
    ['mx', 'Mx,Ed (kN·m)', 'M_{Ed.x}', 'kN m', 3000],
    ['my', 'My,Ed (kN·m)', 'M_{Ed.y}', 'kN m', 2000],
    ['shear', 'VEd (kN, magnitude)', 'V_{Ed}', 'kN', 2500, 0],
  ]],
];

export const fields = inputGroups.flatMap(([, group]) => group);
export const legacyDefaults = Object.fromEntries(fields.map(([id, , , , value]) => [id, value]));

