# mFinPlate

Open **Fin Plate Connection** from the tool library. The Connections project folder accepts the module. Individual designs use `.mfp`, and project packages use `.mcalc`. The report opens as an editable Canvas worksheet.

Choose a beam from the shared steel catalogue or enter a custom I-section. The tool uses the selected web thickness and clear web depth. Vertical bolt columns run across the plate, and horizontal rows run up the web. Editing the arrangement updates the scaled plan and elevation. The 50° skew preset uses 300 kN vertical shear and a fixed 150 mm normal eccentricity.

**Compare bolt columns** shows one, two and three columns under the current inputs. The comparison includes the plate width, axis eccentricity, component utilization and detailing findings for each regular grid.

Open **Detailed calculation** below the workspace for formulas, substituted values and utilization. The tab updates with the design and shows the bolt governing each component check.

## Calculation basis

| Component | Source | Implementation |
| --- | --- | --- |
| Elastic bolt forces | Static equilibrium and equal bolt stiffness | Direct force and moment contributions use the group centroid and polar property. All three equilibrium residuals are checked. |
| Bolt shear | BS EN 1993-1-8:2005 Table 3.4 and §3.8 | Single shear with the UK National Annex bolt resistance factor 1.25. The long-joint calculation uses the larger grid span in the component assessment. |
| Hole clearance | EN 1090-2 Table 11 | Nominal normal-round-hole clearance for the selected bolt size. |
| Detail distances | BS EN 1993-1-8:2005 Table 3.3 | Minimum end and edge distances and pitch. Clear web is used for hole-to-fillet collision. |
| Plate and web bearing | BS EN 1993-1-8:2005 Table 3.4 | Separate directional resistances. Linear component interaction is used for screening. Continuous flanges do not impose artificial free web edges. |
| Standard bolt-group design | SCI P358 §5.5 Check 2, pp. 115–117 | Symmetric one- and two-column groups. The SCI method and the per-bolt screening results appear separately. |
| Standard fin plate section | SCI P358 §5.5 Check 3, pp. 118–119 | Gross and net shear, block tearing and first-stage bending. UK National Annex net-section factor 1.1 as used by P358. |
| Plate stability | SCI P358 §5.5 Check 3 and Table 5.2, pp. 119–120 | The first bolt line determines the short-plate limit. The group centroid determines the moment arm. Long-plate resistance is calculated for laterally restrained beams with S275 fin plates. |
| Weld and single-sided support | SCI P358 §5.5 Checks 8 and 10, pp. 127–128 | Full-strength double fillet throat sizing and the conservative support punching criterion. The support local shear check uses the entered thickness at the weld. |

Geometry mode measures the distance from the idealized weld/support face to the bolt group centroid along the beam. Normal mode projects the specified value by dividing by the cosine of the plan skew. Axis mode uses the specified distance directly. Vertical shear is unchanged in each mode. The quoted design strengths are inputs for the actual component and product.

## Numerical benchmarks

SCI P358 §5.6, Example 1, pp. 140–145 uses 200 kN on the single-column side and 350 kN on the double-column side. All values below are resistances in kN. The published worked steps round intermediate bolt resistances and force coefficients. Automated comparisons use 1.5% for Check 2 and 0.2% for the plate shear components.

| Component | Single column published | Single column calculated | Double column published | Double column calculated |
| --- | ---: | ---: | ---: | ---: |
| Bolt shear | 288 | 285.72 | 577 | 584.07 |
| Fin plate bearing | 332 | 327.89 | 574 | 572.48 |
| Beam web bearing | 291 | 286.77 | 565 | 562.63 |
| Gross plate shear | 363 | 362.55 | 450 | 450.06 |
| Net plate shear | 435 | 434.69 | 538 | 537.99 |
| Plate block tearing | 347 | 347.36 | 494 | 494.38 |

These benchmark fixtures use the published web end distances. The interactive model assumes an uncoped beam. Project regressions separately check the 50° M24 layouts, including 88.03 kN maximum bolt force for two columns and 58.25 kN for three columns.

The stability benchmark reproduces 771 kN and 742.5 kN for the two sides of Example 1. The worked double-column example classifies the plate using the centroid distance, while the general procedure uses the first bolt line. Both branches give the same governing elastic resistance for that example. A separate long-plate regression uses the rounded Table 5.2 reduction factor at slenderness 1.05.

The interface presents a partial assessment for every layout. Full weld group verification, additional support configurations, beam coping, tying and rotation remain open. The three-column check covers elastic bolt forces, shear and directional bearing screening. Custom coordinate layouts report elastic bolt forces, shear and geometric edge or collision findings.

[SCI P358](https://steelconstruction.info/upload/Wiki-Files/a/a9/SCI_P358.pdf) · [ArcelorMittal Orange Book](https://orangebook.arcelormittal.com/node/240)

## Joint types and beam notches

Beam to column supports attachment to the web or flange of an I/H column, or to the outer face of an SHS, RHS or CHS column. Beam to beam attaches to the supporting beam web. Saved designs retain their original support key, including the legacy rigid-support option.

The beam-to-beam notch inputs describe a square-ended cope in the **supported beam**, measured from its uncut flange faces and from its beam end. A double notch uses a common length. The drawing shows the reduced depth and its shoulder. The notch limits the web edge available for bolt bearing, and the reduced tee or web section is used for gross shear, net shear, block tearing and bending at the connection and notch section where applicable. The SCI short-cut local stability criteria are evaluated for restrained S275/S355 beams. The UI identifies checks outside that scope. The unrestrained beam stability verification remains part of member design. The notch procedure covers regular one- or two-column standard vertical-shear cases with bolt centres within the notch length and holes clear of the cut edge. The CI benchmark uses P358 §5.6 Example 1, Checks 4–6.
