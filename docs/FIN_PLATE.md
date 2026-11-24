# mFinPlate

Open **Fin Plate Connection** from the tool library. Choose **Beam to beam** or **Beam to column**, select the supporting face for a column, and use **Open template** to edit the joint. Saved and imported designs open with their stored inputs. The Connections project folder accepts the module. Individual designs use `.mfp`, and project packages use `.mcalc`. The report opens as an editable Canvas worksheet.

Choose a beam from the shared steel catalogue or enter a custom I-section. The tool uses the selected web thickness and clear web depth. Vertical bolt columns run across the plate, and horizontal rows run up the web. Editing the arrangement updates the scaled plan and elevation. The 50° skew preset uses 300 kN vertical shear and a fixed 150 mm normal eccentricity.

**Compare bolt columns** shows one, two and three columns under the current inputs. The comparison includes the plate width, axis eccentricity, component utilization and detailing findings for each regular grid.

Open **Detailed calculation** below the workspace for a worked calculation with design inputs, dimensioned plan and elevation, an explicit utilization summary, and checks organized in SCI P358 order. The worksheet presents supporting web and flange attachments and square and skewed beam-to-beam layouts with no notch, a single notch or a double notch. Each check identifies its applicable results and any separate verification. **Print calculation** prints the worksheet on A4 or saves it to PDF through the browser. Skewed worksheets show the elastic bolt model, directional bearing screening on regular grids and the reduced notch geometry where present. They flag the standard SCI checks that require a separate assessment.

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

These benchmark fixtures use the published web end distances. Project regressions separately check the 50° M24 layouts, including 88.03 kN maximum bolt force for two columns and 58.25 kN for three columns.

The stability benchmark reproduces 771 kN and 742.5 kN for the two sides of Example 1. The worked double-column example classifies the plate using the centroid distance, while the general procedure uses the first bolt line. Both branches give the same governing elastic resistance for that example. A separate long-plate regression uses the rounded Table 5.2 reduction factor at slenderness 1.05.

The interface presents a partial assessment for every layout. Full weld group verification, additional support configurations, overall stability of unrestrained notched beams, tying and rotation remain open. The three-column check covers elastic bolt forces, shear and directional bearing screening. Custom coordinate layouts report elastic bolt forces, shear and geometric edge or collision findings.

[SCI P358](https://steelconstruction.info/upload/Wiki-Files/a/a9/SCI_P358.pdf) · [ArcelorMittal Orange Book](https://orangebook.arcelormittal.com/node/240)

## Joint types and beam notches

Beam to column supports attachment to the web or flange of an I/H column, or to the outer face of an SHS, RHS or CHS column. Beam to beam attaches to the supporting beam web. Saved designs retain their original support key, including the legacy rigid-support option.

The beam-to-beam notch inputs describe a square-ended cope in the **supported beam**, measured from its uncut flange faces and from its beam end. A double notch uses a common length. The drawing shows the reduced depth and its shoulder. The notch limits the web edge available for bolt bearing, and the reduced tee or web section is used for gross shear, net shear, block tearing and bending at the connection and notch section where applicable. The SCI short-cut local stability criteria are evaluated for restrained S275/S355 beams. The UI identifies checks outside that scope. The unrestrained beam stability verification remains part of member design. The notch procedure covers regular one- or two-column standard vertical-shear cases with bolt centres within the notch length and holes clear of the cut edge. The CI benchmark uses P358 §5.6 Example 1, Checks 4–6.

Published benchmark targets for the notch checks:

| P358 result | One column | Two columns |
| --- | ---: | ---: |
| Check 4 gross / net / block shear resistance (kN) | 561 / 581 / 312 | 794 / 837 / 481 |
| Check 4 bending resistance at the connection (kNm) | — | 164 |
| Check 5 shoulder moment demand / resistance (kNm) | 24 / 89.1 | 42 / 164 |
| Check 6 notch length limit (mm) | 413 | 533 |

The worked two-column case uses a 120 mm notch length in the Check 4 applicability calculation and a 110 mm notch length in the Check 5 sketch and demand calculation. The latter reproduces the published 42 kNm.

## Beam-to-beam profiles and clearance

New beam-to-beam templates require a supporting I/H section in addition to the supported beam section. Both can use a catalogue or a custom profile. Align the supported beam top, mid-depth or bottom with the corresponding reference on the supporting beam. New templates use mid-depth alignment. Custom top offset is measured from the supported top to the supporting top, and existing designs retain that offset. The plan projects both members and the elevation shows the supporting I-section along the supported beam axis. Profile dimensions are reported at their actual section values. The elevation shows bolt holes. The Bolt forces and utilization tab shows the arrows, bolt numbers and force table.

- **Fit between supporting flanges.** Set the end gap along the supported beam axis from the near face of the supporting web. The geometry screens for contact with the supporting flanges and web and for a plate weld line outside the clear supporting web.
- **Outside supporting flange.** The tool adds the near flange projection and the skew corner allowance to the beam setback. The regular bolt grid and plate width follow the resulting setback. Geometry-based eccentricity uses the actual bolt locations. The standard short-plate method is not applied to this layout. Extended plate, weld and supporting-member verifications are flagged.

Both options allow a top, bottom or double notch on the supported beam. New fit templates automatically cope the supported beam when there is a flange clash. The default depth is 50 mm, increased as necessary to remove the supported flange and root and clear the supporting flange vertically by 10 mm. The cope shoulder clears the projected supporting flange horizontally by 10 mm, consistent with the nominal allowance in SCI P358 §2.3. Automatic dimensions follow the current sections, skew and alignment. Switch off automatic notching to enter manual dimensions. Remaining bolt-edge, weld, beam web and stability checks still apply. Existing designs without a supporting section still open using the original support-face reference and can be updated by choosing a profile.
