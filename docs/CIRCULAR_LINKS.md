# Circular column closed links

The stable module ID and route remain `rc-circular-column`. Manifest schema 2 stores
ordered `longitudinal` layers and `transverse` links associated by stable layer ID.
Each longitudinal layer carries count, diameter, angular rotation and optional radial
clearance. Each link carries its diameter and vertical spacing. A blank clearance
uses the adjacent longitudinal diameters and the entered EC2:2004 spacing parameters.
There is no additional hidden cage gap.

## Geometry and detailing

The SVG uses millimetres as its coordinate system, with equal horizontal and vertical
scale. Link stroke width equals the actual link diameter. Each link's inner face is
tangent to the outside of its associated bar layer. Bar coordinates used by the
drawing also feed the resistance model and every-pair 2D clear-spacing check.
Circumferential clearance uses a chord rather than an arc.

For D1000, cover 40 mm, 20Ø32 + 12Ø25, two Ø12 links and aggregate 20 mm,
the recommended k1=1 and k2=5 mm give a longitudinal radial clearance of 32 mm.
The longitudinal radii are 432 and 371.5 mm; link centre radii are 454 and 390 mm.
The inner link leaves only 20 mm to the outer longitudinal layer. This arrangement
is flagged for constructability, even though the longitudinal spacing itself passes.
The passage screen conservatively compares the remaining gap with the longitudinal
spacing requirement; it does not invent a separate code bar-to-link minimum.

The checks reference [EN 1992-1-1:2004](https://www.phd.eng.br/wp-content/uploads/2015/12/en.1992.1.1.2004.pdf):
§8.2(1)–(3) for spacing and placement/compaction, §4.4.1 for cover, and §9.5.3
for column link diameter, spacing, anchorage and restraint. The recommended spacing
parameters and link-spacing cap are editable; they are not labelled as an adopted
National Annex. End/lap zones can apply the 0.6 factor. Link closure, anchorage,
restraint, durability/fire cover, lap details, execution and project applicability
remain explicit review items. Circular tangency does not establish compliance.

## Resistance and reports

`solver.mjs` is a numerical form of the pinned Canvas
[`RC_Circular_Column_Check`](https://github.com/Anhbq1298/mCalcCanvas/blob/161910b4d162361e53217b6251a29d779cd30a91/templates/RC_Circular_Column_Check.mCCV).
It retains 100 concrete strips, the original strain pivots, material factors and
sampled P–M curve, extending steel integration to every entered layer and rotation.
The P–M model follows the applied bending direction and remains a first-order
section estimate. It does not add a slenderness or full biaxial-equilibrium solver.
Interpolation outside the sampled resistance range is unavailable rather than
extrapolated. Physical clashes prevent resistance evaluation.

The inherited EN 1992-1-1:2023 shear model uses an equivalent two-leg contribution
per entered circular link layer. This is explicitly a conditional estimate. The
effective legs, anchorage and common shear mechanism for nested cages require
engineering verification. Neither the summary nor report gives an overall PASS
while these applicability checks remain unresolved. The module does not claim
that EC2:2004 detailing makes the 2023 material/shear model a single-edition design.

The report remains an editable Canvas document saved through the existing design,
project, report-hash and portable-package flows. It includes the actual SVG section,
all layer geometry, actions, resistance estimates, detailing failures/review items
and sampled curve. It replaces the fixed two-spiral worksheet snapshot, whose
geometry and labels would be misleading for arbitrary closed-link layers.

## Migration and verification

Schema 1 → 2 preserves legacy bar radii by retaining the former inner-layer radial
clearance, including inadequate values. A persistent migration review warning
identifies the conversion from spiral inputs to closed links. Unknown top-level and
layer fields survive capture/restore. Future manifest/input schemas are read-only.
The SDK applies migrations sequentially, retains original records until save and
keeps its existing concurrent-write protection. Saving stamps the new manifest schema.

Unit references retain the pinned default PMM utilization 0.7688831778, conditional
shear utilization 0.8718420942 and web width 1022.414992 mm. Tests also cover D1000
tangency/intrusion, unequal rotated layers, clashes, chord spacing, aggregate/NDP
changes, reduced zones, additional layers, legacy/future schemas and report warnings.
Browser tests cover live edits, independent layer controls, save/reopen, migration,
portable packages, future-schema protection and report opening.
