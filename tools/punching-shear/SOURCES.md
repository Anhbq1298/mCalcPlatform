# mPunchingShear: sources and verification

Scope: internal rectangular (any rotation) and circular columns; rectangular edge and corner columns with faces flush with the slab edges; openings; in-plane normal stress. EN 1992-1-1:2004 + AC:2010 + A1:2014, §6.4 punching, §8.3, §8.5, §9.3.2 and §9.4.3 detailing. CEN recommended values by default, plus a UK NA profile that stays Not verified until the user confirms its values. Singapore and UK NA profiles stay Not verified until the user confirms them. No German NA values are used.

## Clauses and where they are implemented

| Item | Clause | Module | Status |
| --- | --- | --- | --- |
| u0, u1 at 2d with rounded corners, layer paths | §6.4.2 | `geometry.mjs` | Exact lengths; benchmarked |
| W1 for rectangular perimeters | Eq. 6.41 | `geometry.mjs` | Closed form = numerical ∫\|e\| dl |
| k for internal rectangular columns | Table 6.1 | `demand.mjs` | Linear interpolation, clamped at 0.5 and 3.0 |
| β uniaxial, rectangular | Eq. 6.39 | `demand.mjs` | Implemented |
| β circular | Eq. 6.42 | `demand.mjs` | Uses the resultant eccentricity (axisymmetric section) |
| β biaxial, rectangular | Eq. 6.43 | `demand.mjs` | See interpretation note below |
| β simplified | §6.4.3(6), Fig. 6.21N | `demand.mjs` | User must confirm the conditions |
| v_Ed = βV/(u·d) | Eq. 6.38 | `demand.mjs` | β applied once |
| v_Rd,c, v_min, k ≤ 2, ρ ≤ 0.02 | Eq. 6.47, Eq. 6.3N | `resistance.mjs` | σ_cp = 0 |
| v_Rd,max = 0.4·ν·f_cd at u0 | §6.4.5(3), Eq. 6.53, Eq. 6.6N | `resistance.mjs` | AC:2010 value |
| v_Rd,cs with vertical links | Eq. 6.52 | `resistance.mjs`, `reinforcement-checks.mjs` | Smallest layer A_sw, largest s_r |
| f_ywd,ef = 250 + 0.25d ≤ f_ywd | §6.4.5(1) | `resistance.mjs` | Implemented |
| v_Ed ≤ k_max·v_Rd,c, k_max = 1.5 | §6.4.5(1) Note, A1:2014 | `reinforcement-checks.mjs` | Recommended value; source: EurocodeApplied calculator notes |
| u_out,ef and outermost layer ≤ 1.5d inside it | Eq. 6.54, §6.4.5(4) | `resistance.mjs`, `reinforcement-checks.mjs` | Implemented |
| First layer ≤ 0.5d | §9.4.3(4) | `reinforcement-checks.mjs` | Implemented |
| First layer ≥ 0.3d | The Concrete Centre guidance | `reinforcement-checks.mjs` | Guidance only, reported as Requires confirmation |
| s_r ≤ 0.75d; s_t ≤ 1.5d inside u1, ≤ 2d outside; at least two perimeters | §9.4.3(1) | `reinforcement-checks.mjs` | s_t measured between actual consecutive effective legs along each layer |
| Minimum leg area | §9.4.3(2), Eq. 9.11 | `resistance.mjs` | Vertical links |
| Openings within 6d: sector between tangents ineffective; l2 → √(l1·l2) when l1 > l2 | §6.4.2(3), Fig. 6.14 | `perimeters.mjs` | Exact sector removal from every perimeter and layer; legs in the sector are not placed |
| Edge/corner control perimeters | §6.4.2(4), Fig. 6.15 | `perimeters.mjs` | Clipped paths: 2c1 + c2 + 2πd (edge), c1 + c2 + πd (corner) |
| u1* | Fig. 6.20 (a ≤ 1.5d, ≤ 0.5c1) | `position.mjs` | Implemented |
| u0 edge c2 + 3d ≤ c2 + 2c1; corner 3d ≤ c1 + c2 | §6.4.5(3) | `position.mjs` | Implemented |
| β edge: u1/u1*; Eq. 6.44 with k for c1/2c2 and W1 Eq. 6.45 | §6.4.3(4) | `beta.mjs` | Inward eccentricity only; outward is Unsupported loading |
| β corner: Eq. 6.46 u1/u1* | §6.4.3(5) | `beta.mjs` | Inward eccentricity only |
| β simplified 1.4 edge, 1.5 corner | §6.4.3(6), Fig. 6.21N | `beta.mjs` | User confirms conditions |
| σ_cp = (σ_cy + σ_cz)/2, k1 = 0.1 | Eq. 6.47 | `resistance.mjs` | Implemented |
| Slab depth ≥ 200 mm with shear reinforcement | §9.3.2(1) | `detailing.mjs` | Implemented |
| Mandrel φm ≥ 4φ (φ ≤ 16), 7φ (φ > 16) | §8.3, Table 8.1N | `detailing.mjs` | Implemented |
| Link anchorage: hook extension ≥ max(5φ, 50), bend ≥ max(10φ, 70) | §8.5, Fig. 8.5 | `detailing.mjs` | Implemented |
| Bends fit within h − 2c (φm + 2φ) | Physical geometry | `detailing.mjs` | Implemented |
| Link engages top and bottom flexural bars | §8.5, §9.4.3 | `detailing.mjs` | User confirmation |
| UK NA: v_Rd,max = 0.5νf_cd, v_Ed ≤ 2v_Rd,c at u1 | UK NA 6.4.5(3) | `profile.mjs` | Secondary sources (CADS report, The Concrete Centre); Not verified until confirmed |
| SG NA: v_Rd,max = 0.5νf_cd ≤ 2v_Rd,c; 6.4.3(6) and 6.4.4(1) default EN; C_max = C50/60 for shear; α_cc = 1.0 for shear | NA to SS EN 1992-1-1:2008 + A1:2010, 6.4.5(3), 3.1.2(2)P, 3.1.6(1)P | `profile.mjs`, `setup.mjs` | SCIA Engineer Singapore NA table and a copy of Table NA.1 agree; Not verified until confirmed against the NA text |

### Eq. 6.43 interpretation

EN 1992-1-1 writes β = 1 + 1.8·√((e_y/b_z)² + (e_z/b_y)²), where b_y and b_z are the control perimeter dimensions. Independent implementations differ on whether the e subscript names the eccentricity direction or the moment axis. For example, the Blueprints library defines e_y as the eccentricity along y and b_y as the dimension along y. Pairing each eccentricity with the perpendicular dimension contradicts the trend of Eq. 6.39. This tool evaluates both pairings and uses the larger β. For square columns the two pairings are identical.

## Benchmarks

| Benchmark | Quantity | Published | Tool | Result |
| --- | --- | --- | --- | --- |
| CSI SAFE RC-PN-001, 300 × 900, d = 218 | u1 | 5,139.468 mm | 5,139.469 mm | Matches |
| same | v_Rd,c at ρ = 0.5 %, f_ck 30 | 0.5796 MPa (Singapore-labelled) | 0.5795 MPa | Matches; NA not claimed as verified |
| same | v_Ed | 1.099 MPa with SAFE β | — | SAFE moment method not implemented; not compared |
| Dlubal VE 1023, 450 × 450, d = 190 | u1 | 4.188 m | 4.187 m | Matches within rounding |
| same | v_Ed with β = 1.10, V = 787.3 kN | 1.088 MPa | 1.0886 MPa | Matches |
| same | Base A_sw per row | 4.98 cm² (German NA) | 5.23 cm² (CEN) | ≈ 5 % difference expected from German NA rules; not an exact test |
| CSI SAFE RC-PN-001, Singapore-labelled case | v_Ed (β back-calculated from 1.099 MPa), v_Rd,c, D/C | 1.099, 0.5796 MPa, 1.90 | 1.099, 0.5795 MPa, 1.896 | Matches; SG limits 0.5νf_cd = 5.28 MPa and 2v_Rd,c = 1.159 MPa pass |
| Hand calculation | v_Rd,max at f_ck 30 | — | 4.224 MPa | Matches Eq. 6.53 with 0.4·ν·f_cd |

| Dlubal VE 1028, circular D = 300, d = 210, β = 1.10 | u1 | 3.581 m | 3.581 m | Matches |
| same | v_Ed | 0.731 MPa | 0.7313 MPa | Matches |
| same | k, v_Rd,c, v_min | 1.976, 0.585, 0.532 MPa | 1.976, 0.585, 0.532 | Match; v_Rd,max and u_out use German NA rules and are not compared |

Edge and corner formulas were checked against the Blueprints (MIT) implementations of Eq. 6.44, 6.45 and 6.46, and Eq. 6.45 was re-derived by integrating ∫|e| dl over the edge perimeter.

## Independent cross-check (`npm run test:punching-canvas`)

The report is a Canvas worksheet whose resistances, β, stresses, a_out and checks are live formulas. The cross-check evaluates it with the Canvas calculation engine and compares the results with the JS solver. Relative tolerance is 1×10⁻⁶ for v_Rd,c, v_Rd,max, u1, f_ywd,ef, β, v_Ed, v_Rd,cs and a_out. Every pass/fail check must agree. Thirteen cases are covered: CSI geometry, auto layout, uniaxial and biaxial moments with rotation, two-leg links, circular column, no links required, a provided layout with detailing failures, bar-derived depth with user β, edge column with e_par, edge with simplified β, corner column, openings with σ_cp and bend anchorage, and the UK profile. u0, u1*, and every detailing check are also compared.

## Test coverage (`npm test`)

Geometry exactness, convergence, offset invariance, rotation and translation invariance, Table 6.1, Eq. 6.39, 6.42 and 6.43, resistances, auto layout, check-provided failures, leg counting and effectiveness, different diameters per layer, slab edges, openings, explicit result states, restore with unknown fields, drawings, the 3D scene and the report document. The browser suite (`npm run test:browser`) covers Tool Library launch, input editing, layer add, link selection and omission, combinations, save and reopen, 3D interaction, responsive plan, and report generation.

## Limitations before broader production use

- Line-by-line review of the implemented equations against the licensed EN 1992-1-1 text by a second engineer.
- Edge and corner columns set back from the slab edge, circular columns at edges, and eccentricity toward the slab exterior (Eq. 6.39 with the edge perimeter).
- EN 1992-1-1 defines no W1 or u1* for perimeters reduced by openings; moment-based β with openings is reported as Not verified.
- No deduction of loads inside the control perimeter: Eq. 6.48 applies to column bases only. Column bases are not covered.
- National Annexes other than CEN, Singapore and UK. The Singapore and UK profiles need confirmation against the NA text.
