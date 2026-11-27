# No-notch schedule verification

The worksheet uses SCI P358, 2014 reprint, §5.5, with the first-generation British Eurocodes and UK National Annex factors. The default screen assumes permanent lateral restraint, span/depth 20, a 44 mm installation envelope and a single supported beam. Only the geometry and checked component resistances are scheduled. An unspecified support, flange attachment, erection conditions and stiffness/rotation require project verification. Positive specified rotation and concurrent axial force have no validated selection method. The generator reports them as outside scope. The solver currently accepts the standard M20 8.8 threaded fastener, normal hole and S275 plate for schedule selection.

## Numerical comparisons

The connection tests reproduce P358 §5.6 Example 1, Checks 2 and 3. Published bolt group, web bearing, plate bearing, gross shear, net shear and block tearing values are compared separately for the 4×1 and 5×2 layouts. Relative tolerances are 1.5% for the bolt group comparisons and 0.2% for the plate section comparisons, allowing for rounded intermediate coefficients.

The schedule tests reproduce Example 2, pp. 155–157. The four M20 bolts in a single shear plane give 427.64 kN compared with the published 428 kN (−0.085%). Including the supporting column web changes the governing component. The comparison uses the published 246.7 mm clear depth and 13.8 mm web thickness for that support. The published resistance is 412 kN.

Check 4 p.123 is independently evaluated using the web shear stress and reduced bending resistance at high shear, including the second bolt line. This test is an analytical cross-check. The family test re-evaluates every included profile at the reported family resistance and checks every preceding candidate against the default selection priority. Benchmarks for the complete long-plate joint including rotational performance are outstanding.

[SCI P358](https://steelconstruction.info/upload/Wiki-Files/a/a9/SCI_P358.pdf)
