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
| Column head l_H < 2h_H: check only in the slab, r_cont = 2d + l_H + 0.5c (circular) | §6.4.2(8), Eq. 6.33, Fig. 6.17 | `head.mjs` | Implemented; solved as a circular loaded area of diameter 2(r_cont − 2d) |
| Rectangular head l_H < 2h_H: r_cont = min(2d + 0.56√(l1·l2), 2d + 0.69·l1), l1 ≤ l2 | §6.4.2(8), Eq. 6.34, 6.35 | `head.mjs` | Implemented (l1 ≤ l2 confirmed in the BS EN text) |
| Head l_H > 2h_H: sections inside the head with d_H = d + h_H and in the slab | §6.4.2(9)–(10), Fig. 6.18 | `head.mjs` | Implemented, internal columns only |
| r_cont,ext = l_H + 2d + 0.5c, r_cont,int = 2(d + h_H) + 0.5c | §6.4.2(11), Eq. 6.36, 6.37 | `head.mjs` | Circular: code rule. Rectangular: perimeters built as offsets of the drop outline (2d) and of the column (2d_H, only when it fits inside the drop), as documented by Tekla Structural Designer (Punching shear checks to EC2). Interpretation, explained in `help.html`; it does not hold the status |

### Drop panels: decisions that go beyond the text

- Face check for l_H < 2h_H uses the column perimeter with the slab d (conservative; EC2 is silent).
- Links beyond the drop: the slab section is designed with the drop as the loaded area (Eq. 6.52, 6.54, §9.4.3, d of the slab). Arrangement offsets s are from the column face; s > l_H,min puts a layer on the drop outline at t = s − l_H,min, s ≤ l_H,min − c keeps it in the drop (d_H section); layers on the step are rejected. Interpretation, explained in `help.html`. Rectangular heads with l_H ≤ 2h_H: check on the equivalent circle, links on the head outline, mapped by 16 angular sectors (`head-mapped.mjs`); proposed method, reinforced rows report Not verified until benchmarked.
- Drop input is the total thickness h_tot; h_H = h_tot − h. Older saves (head.depth) migrate on restore.
- For 2h_H < l_H < 2(d + h_H) the inner perimeter at 2d_H would leave the head; only the slab section is checked and the face check uses d_H (Tekla: inner perimeter only when it fits).
- Links inside the drop stop at l_H,min − c; links beyond the drop are designed in the slab section around the drop. Rectangular heads with l_H ≤ 2h_H take links on the head outline mapped to the equivalent circle (Not verified, `head-mapped.mjs`).
- Straddling cases (l_H < 2h_H in one direction, > 2h_H in the other), offset heads, heads set back from a slab edge the column is flush with, heads with openings, and mixed shapes (circular head on a rectangular column) are reported as unsupported. Heads at edge and corner columns are clipped to the slab (interpretation, see Help).
- Moment β with a head uses the column (inside) or the head (outside) as the loaded area; it is flagged because EC2 gives no W1 for heads.

### Eq. 6.43 interpretation

EN 1992-1-1 writes β = 1 + 1.8·√((e_y/b_z)² + (e_z/b_y)²), where b_y and b_z are the control perimeter dimensions. Independent implementations differ on whether the e subscript names the eccentricity direction or the moment axis. For example, the Blueprints library defines e_y as the eccentricity along y and b_y as the dimension along y. Pairing each eccentricity with the perpendicular dimension contradicts the trend of Eq. 6.39. This tool evaluates both pairings and uses the larger β. For square columns the two pairings are identical.

## Benchmarks

Published examples are re-run by `scripts/benchmarks.mjs` and asserted by `test/benchmarks.test.mjs` (same-rule values within the rounding of the published value). The full comparison tables are in `help.html`, section 8.

| Benchmark | Same-rule values | Agreement | Different-rule values |
| --- | --- | --- | --- |
| CSI SAFE, Eurocode 2-04 RC-PN-001 (CEN NA) | d, u1, k, ρ_l, v_min, v_Rd,c; v_Ed and D/C with the source β | ≤ 0.16 % | v_Ed with the tool β: CSI adds Eq. 6.39 terms of both axes (β = 1.1075), the tool uses Eq. 6.43 (β = 1.0605) |
| JRC EUR 26566, column B2 | d, u0, v_Ed,0, v_Rd,max, u1, v_Ed,1, k, v_Rd,c, v_min, f_ywd,ef, u_out,ef, a_out | ≤ 1.0 % (v_min printed to two decimals) | s_r rounded to 120 mm, A_sw scales with it; the tool applies k_max (A1:2014) and fails the design |
| Dlubal VE 1023 (DIN) | u1, v_Ed | ≤ 0.04 % | — |
| Dlubal VE 1028 (DIN) | d, u1, v_Ed, k, ρ_l, v_Rd,c, v_min | ≤ 0.08 % | 1.4·v_Rd,c and u_out with the required reinforcement (German NA) |

Reference cases (`scripts/verification.mjs`, `test/verification.test.mjs`) cover the geometries without a published example: openings, edge and corner columns, drops at all positions, mapped links. Three of them are recomputed by hand outside the engine.

Edge and corner formulas were checked against the Blueprints (MIT) implementations of Eq. 6.44, 6.45 and 6.46, and Eq. 6.45 was re-derived by integrating ∫|e| dl over the edge perimeter.

### Rectangular setbacks

EN 1992-1-1 §6.4.2(4), Fig. 6.15 and the [Ancon Shearfix design manual](https://www.ancon.com.au/downloads/6765/Shearfix_EC2_Design_Manual_AU-Mod.pdf), §7, compare the closed perimeter and the paths returning to one or two free edges. The tool extends the straight runs to the slab edges and excludes the free boundary. The face check takes the reduced flush length of the actual column as a conservative modelling choice. The check uses an eligible simplified β or a user-defined β. Setback shear-link layouts and openings combined with a setback perimeter are outside this method. For drops, the inner and outer sections follow the existing rectangular drop interpretation with the actual clipped drop outline.

`test/edge.test.mjs` compares the generated paths and shear stress with independent sums of straight segments and quarter-circle arcs. A 400 × 300 mm column with d = 200 mm gives u1 = 2506.637 mm with a 75 mm edge overhang and 1528.319 mm with corner overhangs of 75 and 125 mm. The drop fixtures separately compare inner and outer control sections. These are analytical benchmarks, not published design examples for set-back drops.
