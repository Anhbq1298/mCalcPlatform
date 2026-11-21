# mPunchingShear: sources and verification

Scope: internal rectangular (any rotation) and circular columns, EN 1992-1-1:2004 + AC:2010 + A1:2014, §6.4 punching and §9.4.3 detailing, CEN recommended values. No National Annex is selected, and no Singapore, UK or German NA values are used or labelled.

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
| Openings within 6d | §6.4.2(3) | `calculate.mjs` | Detected and reported as Unsupported geometry |
| Anchorage of links | §8.5 | — | Not checked; always Requires confirmation |

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
| Hand calculation | v_Rd,max at f_ck 30 | — | 4.224 MPa | Matches Eq. 6.53 with 0.4·ν·f_cd |

Not benchmarked: Dlubal VE 1028 (circular). The circular route is covered by exact geometry and formula tests and by the Canvas cross-check, not by a published example.

## Independent cross-check (`npm run test:punching-canvas`)

The report is a Canvas worksheet whose resistances, β, stresses, a_out and checks are live formulas. The cross-check evaluates it with the Canvas calculation engine and compares the results with the JS solver. Relative tolerance is 1×10⁻⁶ for v_Rd,c, v_Rd,max, u1, f_ywd,ef, β, v_Ed, v_Rd,cs and a_out. Every pass/fail check must agree. Eight cases are covered: CSI geometry, auto layout, uniaxial and biaxial moments with rotation, two-leg links, circular column, no links required, a provided layout with detailing failures, and bar-derived depth with user β.

## Test coverage (`npm test`)

Geometry exactness, convergence, offset invariance, rotation and translation invariance, Table 6.1, Eq. 6.39, 6.42 and 6.43, resistances, auto layout, check-provided failures, leg counting and effectiveness, different diameters per layer, slab edges, openings, explicit result states, restore with unknown fields, drawings, the 3D scene and the report document. The browser suite (`npm run test:browser`) covers Tool Library launch, input editing, layer add, link selection and omission, combinations, save and reopen, 3D interaction, responsive plan, and report generation.

## Limitations before broader production use

- Line-by-line review of the implemented equations against the licensed EN 1992-1-1 text by a second engineer.
- Edge and corner columns, perimeter clipping, openings within 6d, load reduction inside the perimeter, column bases, prestress.
- National Annex profiles. Each needs its own verified parameter set; the German NA, for example, changes v_Rd,max and the row factors.
- Link anchorage and bend geometry checks.
- A published circular-column benchmark.
