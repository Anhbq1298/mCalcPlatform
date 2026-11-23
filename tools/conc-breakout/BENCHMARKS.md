# mConcBreakout verification record

Run the module suite with `node --test tools/conc-breakout/test/*.test.mjs`. Re-run the ACI comparison and emit the complete inputs and measured results with `node tools/conc-breakout/benchmarks/aci-349.mjs`.

## Published numerical comparisons

| Reference and basis | Input and reference quantity | Reference | Calculated | Difference and status |
| --- | --- | ---: | ---: | --- |
| ACI Committee 349, 1997, B2(b), pp. 349.2R-17–19, step 1 | 7 in square, 5/8 in plate, 3 × 3 × 1/4 in tube, 5 in stud grid, 4 ksi concrete, 70 kip·in and 12.4 kip shear. Factored top-row force from the published required area, 0.9 × 0.307 × 50 | 13.815 kip | 13.810 kip by statics and 13.588 kip by shell | −0.036% for published-model statics, within rounding. −1.64% for the shell. Shell comparison only |
| ACI Committee 349, 1997, B3(b), pp. 349.2R-24–25, step 1 | Same plate layout, 5/8 in studs, with 11.1 kip tension. Factored top-row force from a fixed 4 in compression lever arm, (70 + 11.1 × 1.5) / 4 | 21.7 kip | 21.663 kip by statics and 18.872 kip by shell | −0.17% for published-model statics, within rounding. −13.03% for the shell. Shell comparison only |
| Kuhlmann, Wald, Hofmann et al., InFaSo Design Manual II, February 2014, Examples 9.4–9.5 | Basic cone reference for non-cracked C30/37 with 200 / 165 mm embedment, k1 = 12.7 | 196.8 / 147.4 kN | 196.8 / 147.4 kN | Reproduced to published precision. Component formula only |
| InFaSo Design Manual II, Example 9.5 | Two studs, As = 380 mm² each, fuk = 470 MPa; published CEN/TS study factors γN = 1.5 and γV = 1.25 | 238.1 / 171.5 kN | 238.1 / 171.5 kN | Reproduced using the example's factors. Current EN 1992-4 factors are checked separately |
| InFaSo+ Handbook II, §§2.2 and 3.2.2, PDF pp. 201–203 and 230–235 (printed pp. 22–24 and 51–56) | Slim plate on nonlinear component springs, column base with supplementary reinforcement and threaded load-introduction fasteners | Moment–rotation curves for the stated system | Open | The embedded plate plus separate baseplate and supplementary ties require their own components |

The ACI trial uses S235 elastic plate properties, a rigid HSS perimeter, 300 mm trial concrete thickness, 5.69 in effective stud length from B2(a), a trial 1 in head diameter and 45 kN/mm elastic shear stiffness. B3(b) does not publish a calibrated spring curve. Concrete reaction is recovered from the compression-only contact field, so its resultant is free to move. B3(b) instead fixes the reaction location at the steel section edge. Coupling, the different compression resultant and unknown anchor stiffness mean the published strength-model result is a comparison rather than a shell acceptance target. The differences are recorded without a fitted stiffness. Peak component force changes from the 14.5 mm mesh to the 10 mm mesh are 0.079% and 0.086% of the respective governing reactions. The legacy ACI resistance equations and strength factors are used only to reconstruct the reference values.

## Analytical and independent hand calculations

| Category | Fixture and reference model | Acceptance and result |
| --- | --- | --- |
| Force transport and signs | Hand expansion of r × F in `test/loads.test.mjs`, including negative offsets, elevated shear and a free torsional couple | Exact expected components, including SI conversion |
| Pure axial tension | Symmetric four studs on 200 mm square grid, 100 kN centred loading, 300 × 400 × 25 mm plate. By symmetry four equal 25 kN reactions | Each within 0.05 N. No contact force above 0.05 N |
| Pure axial compression | Same symmetric model, −100 kN. No tensile reactions above 0.05 N | Passed equilibrium and unilateral response |
| Uniaxial and biaxial bending | Same model under −15 kN·m about X, 20 kN·m about Y and +15/−20 kN·m combined | Force and moment residual within scale-aware tolerance in every case |
| Pure shear X, pure shear Y, combined shear and torsion | Independent rigid diaphragm with springs at (±100, ±100) mm, differing stiffness of 10 and 20 kN/mm. Rotation from moment about stiffness centroid divided by polar spring stiffness | Analytical anchor vectors reproduced within 10⁻⁸ N in the rigid-fixture solve |
| Membrane patch | 20 × 40 mm affine plane-stress element, E = 210 GPa, ν = 0.3, εx = 0.001, εy = −0.0003, γxy = 0.004 | 210 / 0 / 323.076923 MPa within 10⁻¹⁰ MPa. Rigid rotation has no element forces within 10⁻⁷ N |
| Combined six-component load, coordinate invariance | 15 kN axial, 21/−31 kN shear, 13/−9/10 kN·m applied at (130, −150, 120) mm | Identical force recovery for the equivalent origin load |
| Flexible versus rigid, plate bending | Existing independent rigid spring-plate comparison at t = 400 mm and simply supported central and uniformly loaded square MITC4 benchmarks | Within 2% on rigid resultant, 1% on central deflection, 1.5% on uniform deflection and 3% on plate moment as tested |
| Concrete edge, group cone and pull-out | Direct numerical fixtures in `test/anchors.test.mjs`, with EN 1992-4 Eq. 7.1–7.12 and 7.40–7.46 | Existing equation tests pass. Directional multi-row edge and all required group subsets remain open |
| Pry-out | Existing Eq. 7.39a and spatial per-anchor distribution integration | Regression only. Product values and directional subgroups need independent examples |
| Welded bar anchorage | Ø16 in C30/37 at bar yield, EN 1992-1-1 Eq. 8.2–8.6 with conservative α2–α5 = 1 | Existing independent calculation passes. Weld procedure, bend bearing and whole load path remain open |
| Contact, anchor activation and mesh sensitivity | Mixed load N = 15 kN, Vx = 20 kN, Vy = −30 kN, Mx = 12, My = −5, Mz = 6 kN·m. Same geometry as axial cases | The independent 22/15 mm comparison uses 8% of peak tension or bearing, plus 0.8 kN for each shear vector. These limits separate force redistribution from mesh noise for this fixture. Point stress extrema are excluded from that claim |

Equilibrium permits 0.05 N plus 10⁻⁶ times the larger applied force or opposing normal resultant. Moment tolerance includes that force tolerance times the largest plate dimension, plus 10⁻⁶ times the applied moment norm. This protects the residual checks from round-off in the banded solve while accounting for load scale and lever arm. The UI's two-mesh 5% screen measures sensitivity of anchor and total bearing resultants. It does not establish continuum convergence at a point attachment.

## Public references inspected

- [ACI 349.2R-97, Embedment Design Examples](https://studylib.net/doc/25334083/anchor-embdement), B2(a), B2(b) and B3(b). [ACI 349.2R-07(14) official preview](https://www.concrete.org/Portals/0/Files/PDF/Previews/349.2R-07%2814%29_preview.pdf), introduction and scope. The preview does not contain the full worked examples.
- [InFaSo Design Manual II and InFaSo+ Handbook II](https://www.adit.org.il/wp-content/uploads/2019/05/InFaSo_Design-manual_II_En.pdf), referenced examples above and §2.2.2.2, which uses a beam on component springs. [InFaSo Design Manual I](https://steel.fsv.cvut.cz/infaso/InFaSo_Design-manual_I_En.pdf), Chapter 4, component inventory for anchor plates and surroundings.
- [Hilti PROFIS Engineering, calculation report 3.0.91](https://files-ask.hilti.com/original/nd/ndiuiowdhi.pdf), first page for modelling method and CBFEM notes for anchor stiffness. The report uses product-specific force–displacement tests, so its component response cannot be inferred from nominal steel strength.
- [EN 1992-4:2018 public preview](https://preview.sist.si/sist-preview/40467/dd33b1bed42248378d19514875869d80/SIST-EN-1992-4-2018.pdf), scope and headed-fastener configurations. [Public DIN extract](https://www.civilenghub.com/NewSamples/DIN/164008639/DIN-EN-1992-4-2019-2.pdf), §7.2.2.4 pry-out.
- [ISO 17660-1:2006](https://www.iso.org/standard/41194.html), scope for load-bearing reinforcing steel welding. [Klinger et al., 2018](https://www.concrete.org/portals/0/files/PDF/Klinger-2018-CI.pdf), embed constructability and coordination of attachments and surrounding reinforcement.
