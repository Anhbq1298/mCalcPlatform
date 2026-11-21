# Circular RC column design basis

New designs use circular closed links. Each longitudinal layer is paired with one transverse layer. Layers are ordered outside to inside. Both modes store their diameters and intervals independently. Automatic bar radii reserve the larger of the two transverse diameters at each layer. The active link or helix is tangent to the outside of its associated longitudinal bars. An entered radius fixes the longitudinal position in both modes. A smaller active transverse diameter can increase actual cover when the alternate mode governs the reserve.

The section drawing shows the cage layout. Anchorage, hooks, lap zones and end turns need project-specific shop details. The regular geometry assumes the specified nominal cover at the member ends.

## Engineering checks

- **Section resistance.** The common solver carries forward the pinned circular Canvas material assumptions, including `k_tc = 0.85`, `γC = 1.5`, `γS = 1.15`, `ηcc = min((40/fck)^(1/3), 1)`, parabola-rectangle concrete and elastic-perfectly-plastic steel. Concrete stress is deducted where longitudinal steel displaces concrete. No confinement enhancement applies. The UI uses the existing section direction convention in which +Mx and +My correspond to positive horizontal and vertical lever-arm coordinates in the section diagram.
- **PMM.** The strain-plane solver integrates 120 area-normalized concrete strips. It solves axial equilibrium for 48 neutral-axis directions and interpolates the matching biaxial moment direction at the given axial force. The combined ratio with bending is `|MEd|/MRd(NEd, direction)`. The axial-only ratio uses the concentric axial limits. The interactive plot and Canvas report use the same sampled direction curve.
- **Detailing.** EN 1992-1-1:2004 §8.2(2) uses the recommended `k1 = 1`, `k2 = 5 mm`. Sections 8.3, 8.5, 9.5.2 and 9.5.3 provide the regular-zone diameter, spacing, bar-count and anchorage screening basis. The 0.6 end/lap-zone reduction is flagged where relevant. The clearance between the outer longitudinal layer and inner transverse steel is a concrete-placement review criterion, separate from the bar-to-bar minimum. A warning can coexist with a passing longitudinal clearance check.
- **Slenderness.** The automatic check uses EN 1992-1-1:2004 §§5.2, 5.8.3.1, 5.8.8 and 6.1(4), with recommended parameters and user-entered effective lengths. The nominal curvature method applies to isolated members under constant axial force with a constant, centrosymmetric cage. It uses `D/4` for gross-section radius of gyration and `d = D/2 + i_s` for effective depth by direction. The entered first-order moments are the governing magnitudes with their signs. A constant-curvature factor of 8, default effective creep ratio of 2 and adverse imperfection in both axes give the design moments used in PMM. Check the project creep ratio, effective lengths and National Annex. For externally assessed total moments, select the corresponding action basis to use them directly. The first-generation member check is distinct from the section resistance material assumptions.
- **Shear.** Closed links and continuous helices each return **Not Verified** without a shear UR. EN 1992-1-1:2004 §6.2.3 and EN 1992-1-1:2023 §8.2.3 are distinct design routes. A circular model must resolve the link contribution, actual effective chords, strut crushing, longitudinal chord forces and anchorage. Helix inclination and termination need their own verification. The former worksheet's two full-leg assumption was removed from the platform calculation. See [Orr et al.](https://files.core.ac.uk/download/pdf/141470044.pdf) for a first-generation research model and its scope.
- **National Annex.** No jurisdiction is selected or certified. The app displays the first-generation recommended detailing and slenderness checks separately from the section assumptions. Verify the project edition, associated National Annex, specified cover, end and lap conditions, and fabrication details.

## D1000 regression

C32/40, 40 mm cover, 20Ø32 outside, 12Ø25 inside, Ø12 transverse reinforcement in both layers and 20 mm maximum aggregate.

| Geometry (mm) | Outer bar radius | Inner bar radius | Outer link radius | Inner link radius | Radial bar clear | Actual outer-bar to inner-link clear |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Entered reference | 432 | 371.5 | 454 | 390 | 32 | 20 |
| Automatic with placement allowance | 432 | 359.5 | 454 | 378 | 44 | 32 |

The entered arrangement is drawable, with a concrete-placement warning. An independent angular quadrature checks the D1000 bending resistance at NEd = 8000 kN. The axial limits are checked against closed-form area and stress calculations. Tests also rotate the bars and demand together to verify biaxial direction handling.

Schema 3 migrates v1 fixed spiral cages through v2 and explicitly retains the old bar radii. From v2, both the spiral and closed-link layouts keep their original radius and spacing. The inactive mode starts with matching dimensions and can then be edited independently. The Design SDK retains unknown inputs and protects future schemas against writes.

Schema 4 adds the effective creep ratio to the member action basis. Migration preserves saved effective lengths and the externally assessed moments option.
