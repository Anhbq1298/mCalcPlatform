# mConcBreakout: sources and verification

Scope: a cast-in steel plate with welded reinforcing bars and headed studs. Actions N, V (downward) and M lie in one plane. EN 1992-4:2018 for headed fasteners, EN 1992-1-1:2004 for anchorage and bearing, and EN 1993-1-8:2005 for the component method and welds. Recommended values are used; no National Annex is applied.

## Status

Implemented and unit-tested. Benchmarked against published INFASO formula values (below). **Not yet validated** against a complete published worked example of the combined welded-bar and headed-stud connection, because none was found. The INFASO Design Manual II balcony case (§3.3) gives F_Ed = 136.17 kN but no complete component check in the accessible text.

## Clauses and where they are implemented

| Item | Clause | Module | Basis |
| --- | --- | --- | --- |
| γ_Ms (N, V), γ_Mc = 1.5, γ_inst = 1.0 | EN 1992-4 Table 4.1 | `materials.mjs` | Code |
| N⁰_Rk,c = k1·√f_ck·h_ef^1.5, k1 = 8.9 / 12.7 | Eq. 7.2 | `anchors.mjs` | Code (indicative k1 for headed fasteners) |
| A_c,N, A⁰_c,N = s_cr,N², ψ_s,N, ψ_re,N, ψ_ec,N | Eq. 7.1, 7.3–7.6 | `anchors.mjs` | Code; A_c,N as the exact union of squares |
| ψ_M,N = 1 | Eq. 7.7 | `anchors.mjs` | Conservative simplification |
| h′_ef for ≥ 3 close edges | §7.2.1.4(8), Eq. 7.9 | `anchors.mjs` | Code |
| N_Rk,p = k2·A_h·f_ck | Eq. 7.11–7.12 | `anchors.mjs` | Code |
| Splitting omitted with reinforcement, w_k ≤ 0.3 mm | §7.2.1.7(2)b, Eq. 7.22 | `calculate.mjs` | Code; user confirms |
| Blow-out required when c ≤ 0.5·h_ef | §7.2.1.8 | `calculate.mjs` | Detected; reported Incomplete |
| V⁰_Rk,s = k6·A_s·f_uk, k7 | Eq. 7.34–7.35 | `anchors.mjs` | Code |
| V_Rk,cp = k8·N_Rk,c | Eq. 7.39a | `calculate.mjs` | Code; k8 from product data |
| V⁰_Rk,c, α, β, l_f, A⁰_c,V = 4.5c1², ψ_s,V, ψ_h,V | Eq. 7.40–7.46 | `anchors.mjs` | Code |
| Front-row share / rear-row full shear | §6.2.2 (no hole clearance) | `calculate.mjs` | Interpretation; worse case governs |
| Narrow thin member c1′ | §7.2.2.5 | `anchors.mjs` | Code |
| Interaction | Eq. 7.54, 7.55 | `anchors.mjs` | Code |
| c = t·√(f_y/(3f_jd·γ_M0)), f_jd = β_j·α·f_cd | EN 1993-1-8 §6.2.5, Eq. 6.5–6.6 | `equilibrium.mjs` | Code |
| Fillet weld, simplified method | EN 1993-1-8 §4.5.3.3 | `rebar.mjs` | Code; EN ISO 17660-1 not checked |
| f_bd, l_b,rqd, l_b,min, α1 | EN 1992-1-1 Eq. 8.2–8.6, Table 8.2 | `rebar.mjs` | Code, α2–α5 = 1 |
| Mandrel | EN 1992-1-1 Table 8.1N | `rebar.mjs` | Code |
| CCC node stress | EN 1992-1-1 Eq. 6.57N, 6.60 | `calculate.mjs` | Code, reported as warning |
| Strip l_eff from yield lines | EN 1993-1-8 Table 6.4 | `plate.mjs` | Method adapted to welded bars, no prying |
| Rigid-plate indicator k_plate/k_bars ≥ 10 | none | `equilibrium.mjs` | Engineering criterion |

Sources consulted: EN 1992-4:2018 text (Hilti-hosted copy, partly garbled extraction; the constants above were cross-checked with known worked values); the INFASO Design Manual II (Example 9.4, Example 9.5, §3.3). SCI P102, P252 and P398 were not consulted for this version.

## Benchmarks (`test/benchmarks.test.mjs`)

| Quantity | Published | Tool | Note |
| --- | --- | --- | --- |
| N⁰_Rk,c, h_ef = 200, f_ck = 30, k1 = 12.7 | 196.8 kN (INFASO 9.4) | 196.8 kN | Exact |
| N⁰_Rk,c, h_ef = 165, f_ck = 30, k1 = 12.7 | 147.4 kN (INFASO 9.5) | 147.4 kN | Exact |
| N_Rd,s, 2 × A_s 380 mm², f_uk 470, γ = 1.5 | 238.1 kN (INFASO 9.5) | 238.1 kN | Published γ from CEN/TS; the tool's Table 4.1 value differs |
| V_Rd,s, 2 × 0.6·A_s·f_uk, γ = 1.25 | 171.5 kN (INFASO 9.5) | 171.5 kN | As above |
| Pull-out, p_k = 12·f_ck | 279.4 kN (INFASO 9.5) | not applicable | INFASO uses CEN/TS p_k; EN 1992-4 uses k2 = 7.5 / 10.5 |

The other tests are independent hand calculations: EC2 anchorage for Ø16 in C30/37, the edge-breakout chain, global equilibrium residuals, the union area for a group, and narrow-member c1′.
