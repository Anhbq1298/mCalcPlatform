function createMBColumnCore() {
  'use strict';

  // ── Design code services ────────────────────────────────────────────────────

  function piecewiseLinear(x, table) {
    for (let i = 0; i < table.length - 1; i++) {
      const [x0, y0] = table[i];
      const [x1, y1] = table[i + 1];
      if (x >= x0 && x <= x1) {
        const t = (x - x0) / (x1 - x0);
        return y0 + t * (y1 - y0);
      }
    }
    return table[table.length - 1][1];
  }

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  function createEc2(options) {
    const opts = options || {};
    const alphaCc = opts.alphaCc ?? 0.85;
    const gammaC = opts.gammaC ?? 1.50;
    const gammaS = opts.gammaS ?? 1.15;
    const epsilonUd = opts.epsilonUd ?? 0.045;
    // 'Ec2' = parabola-rectangle (εc2, εcu2); 'Ec3' = bilinear (εc3, εcu3)
    const profile = opts.strainProfile === 'Ec3' ? 'Ec3' : 'Ec2';

    const parabolicUltimate = (fck) => fck <= 50 ? 0.0035 : fck >= 90 ? 0.0026
      : piecewiseLinear(fck, [[50, 0.0035], [55, 0.0031], [60, 0.0029], [70, 0.0027], [80, 0.0026], [90, 0.0026]]);
    const parabolicPeak = (fck) => fck <= 50 ? 0.0020 : fck >= 90 ? 0.0026
      : piecewiseLinear(fck, [[50, 0.0020], [55, 0.0022], [60, 0.0023], [70, 0.0024], [80, 0.0025], [90, 0.0026]]);
    const rectangularPeak = (fck) => fck <= 50 ? 0.00175 : fck >= 90 ? 0.0023
      : piecewiseLinear(fck, [[50, 0.00175], [55, 0.0018], [60, 0.0019], [70, 0.0020], [80, 0.0022], [90, 0.0023]]);
    const rectangularUltimate = parabolicUltimate;

    return {
      name: 'EC2',
      concreteUltimateStrain: (fck) => profile === 'Ec3' ? rectangularUltimate(fck) : parabolicUltimate(fck),
      concretePeakStrain: (fck) => profile === 'Ec3' ? rectangularPeak(fck) : parabolicPeak(fck),
      concreteParabolicExponent: (fck) => fck <= 50 ? 2.0 : fck >= 90 ? 1.4
        : piecewiseLinear(fck, [[50, 2.0], [55, 1.75], [60, 1.6], [70, 1.45], [80, 1.4], [90, 1.4]]),
      useEc2CompressionDomain: true,
      useBilinearConcreteStress: profile === 'Ec3',
      concreteEffectiveStrengthFactor: (fck) => fck <= 50 ? 1.0 : fck >= 90 ? 0.8
        : piecewiseLinear(fck, [[50, 1.0], [55, 0.975], [60, 0.95], [70, 0.9], [80, 0.85], [90, 0.8]]),
      concreteStressBlockFactor: alphaCc / gammaC,
      phi: () => 1.0,
      nominalCompressionLimit: (p) => p,
      compressionDesignLimit: (p) => p,
      steelDesignStrength: (fyk) => fyk / gammaS,
      steelMaxTensileStrain: () => epsilonUd,
      supportsNominalReferenceCurve: false,
    };
  }

  // MBColumn Lite is Eurocode 2 only (fibre integration).
  function createDesignCode(options) {
    return createEc2(options);
  }

  // ── Sweep strategy (NeutralAxisSweepStrategy) ───────────────────────────────

  function projectExtreme(b, h, nx, ny) {
    const hx = b / 2.0, hy = h / 2.0;
    return Math.max(Math.abs(hx * nx + hy * ny), Math.abs(hx * nx - hy * ny));
  }

  // One strain state for neutral-axis angle theta and depth c (same rules as the sweep below).
  function stateAt(section, concrete, code, theta, c, cMax) {
    const ecu = code.concreteUltimateStrain(concrete.fc), peak = code.concretePeakStrain(concrete.fc);
    const nx = Math.cos(theta), ny = Math.sin(theta);
    const maxProjection = projectExtreme(section.b, section.h, nx, ny), hTheta = 2 * maxProjection;
    let epsExtreme = ecu, epsFar = ecu * (1.0 - hTheta / c);
    if (code.useEc2CompressionDomain && c > hTheta) {
      const t = (c - hTheta) / (cMax - hTheta);
      epsExtreme = ecu + (peak - ecu) * t; epsFar = peak * t;
    }
    return { thetaRad: theta, neutralAxisDepth: c, extremeCompressionStrain: epsExtreme, farFiberStrain: epsFar,
      neutralAxisOffset: maxProjection - c, maxProjection, minProjection: -maxProjection, sectionDepthAlongNormal: hTheta,
      useEc2CompressionDomain: code.useEc2CompressionDomain, nx, ny };
  }

  function generateStates(section, concrete, code, settings) {
    const angleCount = Math.max(1, Math.round(360.0 / settings.angleStepDegrees));
    const depthCount = Math.max(2, settings.neutralAxisSamples);
    const cMax = 10.0 * Math.max(section.b, section.h);
    const ecu = code.concreteUltimateStrain(concrete.fc);
    const peak = code.concretePeakStrain(concrete.fc);
    const useEc2 = code.useEc2CompressionDomain;
    const lerp = (a, b, t) => a + (b - a) * t;
    const states = [];

    for (let d = 0; d < depthCount; d++) {
      // 'uniform' is the desktop sweep. 'graded' puts the samples where the interaction curve bends
      // (flexure and the balanced region, c up to about 1.5 h) and fewer deep in pure compression.
      const u = d / (depthCount - 1);
      const c = settings.depthSpacing === 'graded'
        ? 0.1 + (cMax - 0.1) * Math.pow(u, 2.5)
        : 0.1 + d * (cMax - 0.1) / (depthCount - 1);
      for (let a = 0; a < angleCount; a++) {
        const theta = a * settings.angleStepDegrees * Math.PI / 180.0;
        const nx = Math.cos(theta);
        const ny = Math.sin(theta);
        const maxProjection = projectExtreme(section.b, section.h, nx, ny);
        const minProjection = -maxProjection;
        const hTheta = maxProjection - minProjection;

        let epsExtreme, epsFar;
        if (useEc2 && c > hTheta) {
          const t = (c - hTheta) / (cMax - hTheta);
          epsExtreme = lerp(ecu, peak, t);
          epsFar = lerp(0.0, peak, t);
        } else {
          epsExtreme = ecu;
          epsFar = ecu * (1.0 - hTheta / c);
        }

        states.push({
          depthIndex: d,
          angleIndex: a,
          thetaRad: theta,
          neutralAxisDepth: c,
          extremeCompressionStrain: epsExtreme,
          farFiberStrain: epsFar,
          neutralAxisOffset: maxProjection - c,
          maxProjection,
          minProjection,
          sectionDepthAlongNormal: hTheta,
          useEc2CompressionDomain: useEc2,
          nx, ny,
        });
      }
    }
    return states;
  }

  function strainAtProjection(s, projection) {
    if (!s.useEc2CompressionDomain) {
      return s.extremeCompressionStrain * (projection - s.neutralAxisOffset) / s.neutralAxisDepth;
    }
    const ratio = (s.maxProjection - projection) / s.sectionDepthAlongNormal;
    return s.extremeCompressionStrain + ratio * (s.farFiberStrain - s.extremeCompressionStrain);
  }

  // ── Fibre integrator (FiberSectionIntegrator, rectangular) ──────────────────

  function concreteStress(strain, peakStrain, exponent, stressCap, useHognestad, useBilinear) {
    if (strain <= 0.0) return 0.0;
    if (strain >= peakStrain) return stressCap;
    const r = strain / peakStrain;
    if (useBilinear) return stressCap * r;
    return useHognestad
      ? stressCap * (2.0 * r - Math.pow(r, exponent))
      : stressCap * (1.0 - Math.pow(1.0 - r, exponent));
  }

  function buildRectangularFibers(b, h, countX, countY) {
    const nx = Math.max(8, countX), ny = Math.max(8, countY);
    const dx = b / nx, dy = h / ny, area = dx * dy;
    const x0 = -b / 2.0 + dx / 2.0, y0 = -h / 2.0 + dy / 2.0;
    const xs = new Float64Array(nx * ny), ys = new Float64Array(nx * ny);
    let i = 0;
    for (let ix = 0; ix < nx; ix++) {
      const x = x0 + ix * dx;
      for (let iy = 0; iy < ny; iy++) { xs[i] = x; ys[i] = y0 + iy * dy; i++; }
    }
    return { xs, ys, area, count: i };
  }

  const normalizeExtreme = (v) => (!Number.isFinite(v) ? 0.0 : v);

  function integrate(section, fibers, concrete, steel, code, s) {
    const nx = s.nx, ny = s.ny;
    const useBilinear = code.useBilinearConcreteStress;
    const peakStrain = code.concretePeakStrain(concrete.fc);
    const exponent = code.concreteParabolicExponent(concrete.fc);
    const stressCap = code.concreteStressBlockFactor * code.concreteEffectiveStrengthFactor(concrete.fc) * concrete.fc;
    const hognestad = code.supportsNominalReferenceCurve;

    let cN = 0, cMx = 0, cMy = 0;
    let maxC = -Infinity, minC = Infinity, hasCompression = false;
    const { xs, ys, area, count } = fibers;
    for (let i = 0; i < count; i++) {
      const x = xs[i], y = ys[i];
      const strain = strainAtProjection(s, x * nx + y * ny);
      if (strain > maxC) maxC = strain;
      if (strain < minC) minC = strain;
      if (strain <= 0.0) continue;
      hasCompression = true;
      const force = concreteStress(strain, peakStrain, exponent, stressCap, hognestad, useBilinear) * area;
      cN += force;
      cMx -= force * y;
      cMy += force * x;
    }

    // Steel (IntegrateSteel, no stress-block projection)
    const fyd = code.steelDesignStrength(steel.fy);
    const epsUd = code.steelMaxTensileStrain(steel.fy, steel.es);
    let sN = 0, sMx = 0, sMy = 0, maxTension = 0, maxS = -Infinity, minS = Infinity;
    for (const bar of section.bars) {
      const strain = strainAtProjection(s, bar.x * nx + bar.y * ny);
      if (strain > maxS) maxS = strain;
      if (strain < minS) minS = strain;
      if (strain < 0.0) maxTension = Math.min(Math.max(maxTension, -strain), epsUd);
      const stress = clamp(steel.es * strain, -fyd, fyd);
      const displaced = strain > 0.0
        ? concreteStress(strain, peakStrain, exponent, stressCap, hognestad, useBilinear) : 0.0;
      const force = (stress - displaced) * bar.area;
      sN += force;
      sMx -= force * bar.y;
      sMy += force * bar.x;
    }

    return {
      pn: cN + sN, mnx: cMx + sMx, mny: cMy + sMy,
      concreteForce: cN, steelForce: sN,
      maxTensionSteelStrain: maxTension,
      maxConcreteStrain: normalizeExtreme(maxC), minConcreteStrain: normalizeExtreme(minC),
      maxSteelStrain: normalizeExtreme(maxS), minSteelStrain: normalizeExtreme(minS),
      hasConcreteCompression: hasCompression,
    };
  }

  // ── Design adapters (DesignCodeAdapters.cs) ─────────────────────────────────

  function classify(r) {
    if (!r.hasConcreteCompression) return 'Pure tension';
    return r.maxTensionSteelStrain >= 0.005 ? 'Tension controlled' : 'Compression controlled';
  }

  // ── Solver entry (PmmInteractionSolver / PmmSolver) ─────────────────────────

  // MBColumn Lite runs a finer mesh than the desktop default (10° / 100 depths):
  // 72 neutral-axis angles (5° step) × 120 depths.
  const DEFAULT_SETTINGS = { angleStepDegrees: 5.0, neutralAxisSamples: 120, fiberCountX: 40, fiberCountY: 40, depthSpacing: 'graded', refine: true };

  /**
   * input = {
   *   codeOptions?: { alphaCc, gammaC, gammaS, strainProfile: 'Ec2' | 'Ec3' },
   *   section: { b, h, bars: [{ x, y, area }] },   // mm, mm²  (origin = centroid)
   *   concrete: { fc },                              // MPa
   *   steel: { fy, es },                             // MPa
   *   settings?: { angleStepDegrees, neutralAxisSamples, fiberCountX, fiberCountY }
   * }
   */
  function solveSurface(input) {
    const settings = Object.assign({}, DEFAULT_SETTINGS, input.settings || {});
    const code = createDesignCode(input.codeOptions);
    const section = input.section;
    const fibers = buildRectangularFibers(section.b, section.h, settings.fiberCountX, settings.fiberCountY);
    const states = generateStates(section, input.concrete, code, settings);
    const points = [];
    for (const s of states) {
      const r = integrate(section, fibers, input.concrete, input.steel, code, s);
      const phi = code.phi(r.maxTensionSteelStrain, input.steel.fy, input.steel.es);
      points.push({
        depthIndex: s.depthIndex,
        angleIndex: s.angleIndex,
        thetaDeg: s.thetaRad * 180.0 / Math.PI,
        c: s.neutralAxisDepth,
        pn: r.pn, mnx: r.mnx, mny: r.mny,
        phi,
        phiPn: r.pn * phi, phiMnx: r.mnx * phi, phiMny: r.mny * phi,
        maxTensionSteelStrain: r.maxTensionSteelStrain,
        maxConcreteStrain: r.maxConcreteStrain,
        state: classify(r),
      });
    }
    const angleCount = Math.max(1, Math.round(360.0 / settings.angleStepDegrees));
    const cMax = 10.0 * Math.max(section.b, section.h);
    // exact resultant at any (theta, c): used to refine ray hits on the triangulated surface
    const resultant = (theta, c) => {
      const st = stateAt(section, input.concrete, code, theta, Math.min(cMax, Math.max(0.1, c)), cMax);
      const r = integrate(section, fibers, input.concrete, input.steel, code, st);
      const phi = code.phi(r.maxTensionSteelStrain, input.steel.fy, input.steel.es);
      return [r.mnx * phi, r.mny * phi, r.pn * phi];
    };
    let pMax = -Infinity, pMin = Infinity, mMax = 0;
    for (const q of points) { pMax = Math.max(pMax, q.phiPn); pMin = Math.min(pMin, q.phiPn); mMax = Math.max(mMax, Math.hypot(q.phiMnx, q.phiMny)); }
    const exact = { resultant, cMax, scale: [mMax || 1, mMax || 1, Math.max(Math.abs(pMax), Math.abs(pMin)) || 1] };
    return { depthCount: settings.neutralAxisSamples, angleCount, points, exact: settings.refine ? exact : null };
  }

  // ── Ratio check (RatioCheckService) ─────────────────────────────────────────

  const NEAR_ZERO = 1e-9;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.sqrt(dot(a, a));
  const norm = (a) => { const l = len(a); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : a; };
  const vecOf = (p) => [p.phiMnx, p.phiMny, p.phiPn];

  function buildTriangles(surface) {
    const grid = [];
    for (let a = 0; a < surface.angleCount; a++) grid.push(new Array(surface.depthCount).fill(null));
    for (const p of surface.points) {
      if (p.angleIndex >= 0 && p.angleIndex < surface.angleCount && p.depthIndex >= 0 && p.depthIndex < surface.depthCount)
        grid[p.angleIndex][p.depthIndex] = p;
    }
    const tris = [];
    const mk = (a, b, c) => { const v0 = vecOf(a); return { a, b, c, v0, e1: sub(vecOf(b), v0), e2: sub(vecOf(c), v0) }; };
    for (let a = 0; a < surface.angleCount; a++) {
      const na = (a + 1) % surface.angleCount;
      for (let d = 0; d < surface.depthCount - 1; d++) {
        const p00 = grid[a][d], p10 = grid[na][d], p01 = grid[a][d + 1], p11 = grid[na][d + 1];
        if (!p00 || !p10 || !p01 || !p11) continue;
        tris.push(mk(p00, p10, p01));
        tris.push(mk(p10, p11, p01));
      }
    }
    return tris;
  }

  // Möller–Trumbore, identical tolerances to the C# implementation.
  function intersect(origin, dir, tri) {
    const h = cross(dir, tri.e2);
    const a = dot(tri.e1, h);
    if (a > -NEAR_ZERO && a < NEAR_ZERO) return null;
    const f = 1.0 / a;
    const s = sub(origin, tri.v0);
    const u = f * dot(s, h);
    if (u < 0.0 || u > 1.0) return null;
    const q = cross(s, tri.e1);
    const v = f * dot(dir, q);
    if (v < 0.0 || u + v > 1.0) return null;
    const t = f * dot(tri.e2, q);
    return t > NEAR_ZERO ? { t, u, v } : null;
  }

  // Refine a ray hit: find (theta, c) whose resultant R lies exactly on origin + t·dir.
  // Works in scaled coordinates (M/Mscale, P/Pscale) so the two residual components are comparable.
  function refineHit(surface, origin, dir, hit) {
    const ex = surface.exact; if (!ex || !hit) return hit;
    const S = ex.scale, sc = (v) => [v[0] / S[0], v[1] / S[1], v[2] / S[2]];
    const o = sc(origin), dRaw = sc(dir), dl = len(dRaw), d = [dRaw[0] / dl, dRaw[1] / dl, dRaw[2] / dl];
    // orthonormal basis perpendicular to d
    const tmp = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let e1 = cross(d, tmp); e1 = norm(e1); const e2 = cross(d, e1);
    const w0 = 1 - hit.u - hit.v, A = hit.tri.a, B = hit.tri.b, C = hit.tri.c;
    // start: barycentric mix of the vertices' (theta, ln c); unwrap theta around vertex A
    const th = (q) => { let t = q.thetaDeg * Math.PI / 180; const ta = A.thetaDeg * Math.PI / 180; while (t - ta > Math.PI) t -= 2 * Math.PI; while (t - ta < -Math.PI) t += 2 * Math.PI; return t; };
    const res = (xx) => { const R = sc(ex.resultant(xx[0], Math.exp(xx[1]))); const q = sub(R, o); return { R, f: [dot(q, e1), dot(q, e2)], t: dot(q, d) }; };
    const lc = (q) => Math.log(Math.max(q.c, 1.0));
    const tEst = hit.t * Math.hypot(dir[0] / S[0], dir[1] / S[1], dir[2] / S[2]) / (len(dir) || 1);
    const starts = [
      [th(A) * w0 + th(B) * hit.u + th(C) * hit.v, lc(A) * w0 + lc(B) * hit.u + lc(C) * hit.v],
      [th(A), lc(A)], [th(B), lc(B)], [th(C), lc(C)],
      [(th(A) + th(B) + th(C)) / 3, (lc(A) + lc(B) + lc(C)) / 3],
    ];
    const lo = Math.log(0.1), hi = Math.log(ex.cMax);
    const newton = (x0) => {
      let x = x0.slice(), cur = res(x);
      for (let it = 0; it < 40; it++) {
        const err = Math.hypot(cur.f[0], cur.f[1]);
        if (err < 1e-10) break;
        const h = 1e-6;
        const a = res([x[0] + h, x[1]]), b = res([x[0], x[1] + h]);
        const J = [[(a.f[0] - cur.f[0]) / h, (b.f[0] - cur.f[0]) / h], [(a.f[1] - cur.f[1]) / h, (b.f[1] - cur.f[1]) / h]];
        const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        if (!Number.isFinite(det) || Math.abs(det) < 1e-18) break;
        const dx = [-(J[1][1] * cur.f[0] - J[0][1] * cur.f[1]) / det, -(-J[1][0] * cur.f[0] + J[0][0] * cur.f[1]) / det];
        // damped step: at most 10° in angle and a factor e^0.7 in depth per iteration
        let step = Math.min(1, 0.1745 / (Math.abs(dx[0]) || 1e-30), 0.7 / (Math.abs(dx[1]) || 1e-30)), next = null;
        for (let ls = 0; ls < 14; ls++) {
          const xn = [x[0] + step * dx[0], Math.min(hi, Math.max(lo, x[1] + step * dx[1]))];
          const r = res(xn);
          if (Math.hypot(r.f[0], r.f[1]) < err) { x = xn; next = r; break; }
          step /= 2;
        }
        if (!next) break;
        cur = next;
      }
      return { x, cur, err: Math.hypot(cur.f[0], cur.f[1]) };
    };
    let best = null;
    for (const x0 of starts) {
      const r = newton(x0);
      // a converged point on the forward ray, not far from the triangle estimate
      if (r.err < 1e-7 && r.cur.t > 0 && Math.abs(r.cur.t - tEst) < 0.2 * tEst + 0.02) { best = r; break; }
    }
    if (!best) return Object.assign({}, hit, { refined: false });
    const { x, cur } = best;
    const point = [o[0] + cur.t * d[0], o[1] + cur.t * d[1], o[2] + cur.t * d[2]].map((v, i) => v * S[i]);
    const tReal = Math.hypot(point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]) / (len(dir) || 1);
    return Object.assign({}, hit, { t: tReal, refined: true, thetaNA: x[0], c: Math.exp(x[1]) });
  }

  function castRay(tris, origin, dir) {
    let best = null;
    for (const tri of tris) {
      const hit = intersect(origin, dir, tri);
      if (hit && hit.t > NEAR_ZERO && (!best || hit.t < best.t)) best = { t: hit.t, tri, u: hit.u, v: hit.v };
    }
    return best;
  }

  function interpolated(hit) {
    const w0 = 1 - hit.u - hit.v, w1 = hit.u, w2 = hit.v;
    const { a, b, c } = hit.tri;
    const L = (k) => a[k] * w0 + b[k] * w1 + c[k] * w2;
    return { c: L('c'), pn: L('pn'), mnx: L('mnx'), mny: L('mny'), phi: L('phi'),
      maxTensionSteelStrain: L('maxTensionSteelStrain'), state: a.state };
  }

  /** demand = { name, pu (N), mux (N·mm), muy (N·mm) } */
  function checkDemand(surface, tris, demand) {
    const d = [demand.mux, demand.muy, demand.pu];
    const dMag = len(d);
    const base = { name: demand.name };
    if (dMag < NEAR_ZERO) return { ...base, ratio: 0, pass: true, message: 'Zero demand.', capacity: null };

    const dMoment = Math.hypot(d[0], d[1]);
    if (dMoment < NEAR_ZERO) {
      let gov = surface.points[0];
      for (const p of surface.points)
        if (demand.pu >= 0 ? p.phiPn > gov.phiPn : p.phiPn < gov.phiPn) gov = p;
      const capMag = Math.abs(gov.phiPn);
      const r = capMag <= NEAR_ZERO ? Infinity : dMag / capMag;
      return { ...base, ratio: r, pass: r <= 1.0, message: 'Pure axial demand.',
        capacity: { pn: gov.phiPn, mnx: 0, mny: 0 }, governing: gov, thetaDeg: 0 };
    }

    const dir = norm(d);
    let theta = Math.atan2(demand.muy, demand.mux) * 180.0 / Math.PI;
    if (theta < 0) theta += 360.0;
    const hit = refineHit(surface, [0, 0, 0], dir, castRay(tris, [0, 0, 0], dir));

    if (!hit) {
      // Fallback: closest well-aligned surface point
      let maxProj = 0, gov = null;
      for (const p of surface.points) {
        const v = vecOf(p);
        const proj = dot(v, dir);
        if (proj > maxProj && dot(norm(v), dir) > 0.95) { maxProj = proj; gov = p; }
      }
      if (maxProj <= NEAR_ZERO)
        return { ...base, ratio: Infinity, pass: false, message: 'No capacity found along demand direction.', capacity: null, thetaDeg: theta };
      const r = dMag / maxProj;
      return { ...base, ratio: r, pass: r <= 1.0, message: 'Fallback radial capacity check.',
        capacity: { pn: dir[2] * maxProj, mnx: dir[0] * maxProj, mny: dir[1] * maxProj }, governing: gov, thetaDeg: theta };
    }

    const r = dMag / hit.t;
    return { ...base, ratio: r, pass: r <= 1.0, message: 'Radial 3D capacity check.',
      capacity: { pn: dir[2] * hit.t, mnx: dir[0] * hit.t, mny: dir[1] * hit.t },
      governing: interpolated(hit), thetaDeg: theta };
  }

  function checkBatch(surface, demands) {
    const tris = buildTriangles(surface);
    return demands.map((dm) => checkDemand(surface, tris, dm));
  }

  // ── Diagram slices (rays through the same triangulated surface) ─────────────

  /** P–M curve in the vertical plane at moment direction thetaDeg (Mx–My plane angle). */
  function pmCurve(surface, thetaDeg, rays, trisIn) {
    const tris = trisIn || buildTriangles(surface);
    const th = thetaDeg * Math.PI / 180, cx = Math.cos(th), cy = Math.sin(th);
    // P is typically an order of magnitude larger than M, so space the rays evenly in
    // normalised (M/Mscale, P/Pscale) space; otherwise they bunch around the P axis.
    let pScale = 0, mScale = 0;
    for (const p of surface.points) {
      pScale = Math.max(pScale, Math.abs(p.phiPn));
      mScale = Math.max(mScale, Math.hypot(p.phiMnx, p.phiMny));
    }
    pScale = pScale || 1; mScale = mScale || 1;
    const n = rays || 180, out = [];
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + Math.PI * i / n; // -90° (tension) .. +90° (compression)
      const m = Math.cos(a) * mScale, pz = Math.sin(a) * pScale, l = Math.hypot(m, pz);
      const dir = [m / l * cx, m / l * cy, pz / l];
      const hit = refineHit(surface, [0, 0, 0], dir, castRay(tris, [0, 0, 0], dir));
      if (hit) out.push({ m: (m / l) * hit.t, p: (pz / l) * hit.t, exact: hit.refined !== false });
    }
    return out;
  }

  /** Mx–My contour at constant axial load pu (N). */
  function mxMyContour(surface, pu, rays, trisIn) {
    const tris = trisIn || buildTriangles(surface);
    const n = rays || 72, out = [];
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * i / n;
      const o = [0, 0, pu], dv = [Math.cos(a), Math.sin(a), 0];
      const hit = refineHit(surface, o, dv, castRay(tris, o, dv));
      if (hit) out.push({ mx: Math.cos(a) * hit.t, my: Math.sin(a) * hit.t });
    }
    return out;
  }

  /** Full analysis: surface + ratios + diagram data at the governing case. */
  function analyse(input) {
    const t0 = Date.now();
    const surface = solveSurface(input);
    const tris = buildTriangles(surface);
    const results = (input.demands || []).map((dm) => checkDemand(surface, tris, dm));
    let govIndex = -1;
    results.forEach((r, i) => { if (govIndex < 0 || r.ratio > results[govIndex].ratio) govIndex = i; });
    const gov = govIndex >= 0 ? input.demands[govIndex] : { pu: 0, mux: 0, muy: 0 };
    const thetaDeg = govIndex >= 0 && results[govIndex].thetaDeg != null ? results[govIndex].thetaDeg : 0;
    let pMax = -Infinity, pMin = Infinity;
    for (const p of surface.points) { if (p.phiPn > pMax) pMax = p.phiPn; if (p.phiPn < pMin) pMin = p.phiPn; }
    // Design surface as an angle × depth grid for the 3D view: [φMnx, φMny, φPn] per node.
    const xyz = new Float32Array(surface.angleCount * surface.depthCount * 3);
    for (const p of surface.points) {
      const k = (p.angleIndex * surface.depthCount + p.depthIndex) * 3;
      xyz[k] = p.phiMnx; xyz[k + 1] = p.phiMny; xyz[k + 2] = p.phiPn;
    }
    return {
      results, govIndex,
      mesh: { angleCount: surface.angleCount, depthCount: surface.depthCount, xyz },
      summary: { phiPnMax: pMax, phiPnMin: pMin, pointCount: surface.points.length,
        angleCount: surface.angleCount, depthCount: surface.depthCount },
      pm: { thetaDeg, curve: pmCurve(surface, thetaDeg, 360, tris) },
      mm: { pu: gov.pu, curve: mxMyContour(surface, gov.pu, 240, tris) },
      elapsedMs: Date.now() - t0,
    };
  }

  // ── Creep coefficient φ(∞, t0), EN 1992-1-1 Annex B (B.1–B.8) ────────────────
  // rh in %, t0 in days (cement class S/N/R adjusts t0, B.9), h0 = 2·Ac/u in mm, fcm in MPa.
  function creepCoefficient({ rh, t0, h0, fcm, cement }) {
    const a1 = Math.pow(35 / fcm, 0.7), a2 = Math.pow(35 / fcm, 0.2);
    const k = (1 - rh / 100) / (0.1 * Math.cbrt(h0));
    const phiRH = fcm <= 35 ? 1 + k : (1 + k * a1) * a2;                        // B.3a / B.3b
    const betaFcm = 16.8 / Math.sqrt(fcm);                                      // B.4
    const alpha = cement === 'S' ? -1 : cement === 'R' ? 1 : 0;                 // B.9
    const t0adj = Math.max(0.5, t0 * Math.pow(9 / (2 + Math.pow(t0, 1.2)) + 1, alpha));
    const betaT0 = 1 / (0.1 + Math.pow(t0adj, 0.2));                            // B.5
    const phi0 = phiRH * betaFcm * betaT0;                                      // B.2, βc(∞, t0) = 1
    return { phiInf: phi0, phiRH, betaFcm, betaT0, t0adj };
  }

  // ── EC2 slenderness, nominal curvature method (EN 1992-1-1 §5.8.3, §5.8.8) ───
  // Based on Application/Services/Ec2NominalCurvatureService.cs, checked clause by clause against EC2:
  //  · r_m keeps its sign (§5.8.3.1(1)): ends tensioned on opposite sides (double curvature) → r_m < 0.
  //    The desktop takes |M| at both ends, which always gives r_m > 0.
  //  · d = h/2 + i_s with i_s the radius of gyration of the whole reinforcement (§5.8.8.3(2)).
  //    The desktop uses half the bar spread; both agree when the bars sit only on the two faces.
  //  · Unbraced members: r_m = 1.0 (C = 0.7) and M0e = M02 (§5.8.3.1(1), §5.8.8.2(2) applies to braced).
  // Units: N, mm, N·mm, MPa. Compression positive. Moments signed in the section convention.
  function ec2Slenderness(sec, mem, load) {
    const gammaC = sec.gammaC ?? 1.5, gammaS = 1.15, NBAL = 0.4, CURV = 10.0, TOL = 1e-9;
    const fcd = (sec.alphaCc ?? 0.85) * sec.fck / gammaC, fyd = sec.fyk / gammaS, eyd = fyd / sec.es;
    const Ac = sec.b * sec.h;
    const As = sec.bars.reduce((t, r) => t + r.area, 0);
    const omega = As * fyd / (Ac * fcd);                              // §5.8.3.1(1)
    const nEd = load.nEd, n = nEd / (Ac * fcd);                       // relative normal force
    const phiEf = mem.phiEf != null && mem.phiEf >= 0 ? mem.phiEf : null;
    const A = phiEf != null ? 1 / (1 + 0.2 * phiEf) : 0.7;            // §5.8.3.1(1)
    const B = Math.sqrt(1 + 2 * omega);
    const is = (key) => As > 0 ? Math.sqrt(sec.bars.reduce((t, r) => t + r.area * r[key] * r[key], 0) / As) : 0;
    const warnings = [];
    if (phiEf == null) warnings.push('φef not given: A = 0.7 (§5.8.3.1) and K_φ = 1 (creep not included in the curvature).');

    const axis = (name, depth, i, d, k, mTop, mBot) => {
      const l0 = k * mem.L, lambda = l0 / i;
      const ei = l0 / 400, Mi = nEd * ei;                             // §5.2(7): θ_i l0/2 with θ_i = 1/200
      const e0 = Math.max(depth / 30, 20), Mmin = nEd * e0;           // §6.1(4)
      // the end with the larger first-order moment defines M02 and the positive direction
      const big = Math.abs(mTop) >= Math.abs(mBot) ? mTop : mBot, small = big === mTop ? mBot : mTop;
      const sgn = big < 0 ? -1 : 1;
      const M02 = Math.abs(big) + Mi;                                 // imperfection added in the unfavourable sense
      const M01 = sgn * small + Mi;                                   // signed relative to M02: < 0 for double curvature
      let rm = M02 > TOL ? M01 / M02 : 1.0;
      if (!mem.braced) rm = 1.0;
      const C = 1.7 - rm;
      const lambdaLim = n > 0 ? 20 * A * B * C / Math.sqrt(n) : Infinity;   // Eq. 5.13N
      const slender = lambda >= lambdaLim;
      const r = { axis: name, l0, i, lambda, lambdaLim, slender, n, A, B, C, rm, ei, e0, Mi, M01, M02, Mmin, d, sign: sgn };
      if (!slender) { r.MEd = sgn * Math.max(M02, Mmin); r.governs = M02 >= Mmin ? 'M02' : 'NEd·e0'; return r; }
      const M0e = mem.braced ? Math.max(0.6 * M02 + 0.4 * M01, 0.4 * M02) : M02;   // §5.8.8.2(2)
      const nu = 1 + omega, Kr = Math.min(1, Math.max(0, (nu - n) / (nu - NBAL)));     // Eq. 5.36
      const beta = 0.35 + sec.fck / 200 - lambda / 150, Kphi = Math.max(1, 1 + beta * (phiEf ?? 0));  // Eq. 5.37
      const invR0 = eyd / (0.45 * d), invR = Kr * Kphi * invR0;       // Eq. 5.34
      const e2 = invR * l0 * l0 / CURV, M2 = nEd * e2;                 // §5.8.8.2(3), c = 10
      const cands = mem.braced
        ? [['M02', M02], ['M0e + M2', M0e + M2], ['M01 + 0.5·M2', M01 + 0.5 * M2], ['NEd·e0', Mmin]]
        : [['M02 + M2', M02 + M2], ['NEd·e0', Mmin]];
      const top = cands.reduce((a, c2) => (c2[1] > a[1] ? c2 : a));
      Object.assign(r, { M0e, nu, Kr, beta, Kphi, invR0, invR, e2, M2, MEd: sgn * top[1], governs: top[0] });
      return r;
    };

    if (!(nEd > 0)) {
      return { applicable: false, mxEd: load.mxTop, myEd: load.myTop, x: null, y: null, status: 'Not applicable (NEd ≤ 0)',
        warnings: ['NEd is not compressive: the slenderness check does not apply; end moments used as given.'], omega, fcd, fyd };
    }
    // Mx bends about X: depth h along Y, I_x = b h³/12; My bends about Y: depth b along X.
    const x = axis('x', sec.h, sec.h / Math.sqrt(12), sec.h / 2 + is('y'), mem.kx, load.mxTop, load.mxBot);
    const y = axis('y', sec.b, sec.b / Math.sqrt(12), sec.b / 2 + is('x'), mem.ky, load.myTop, load.myBot);
    const status = x.slender && y.slender ? 'Slender X + Y' : x.slender ? 'Slender X' : y.slender ? 'Slender Y' : 'Stocky';
    return { applicable: true, x, y, mxEd: x.MEd, myEd: y.MEd, status, warnings, omega, fcd, fyd, eyd, n };
  }

  return { createDesignCode, solveSurface, checkBatch, pmCurve, mxMyContour, analyse, ec2Slenderness, creepCoefficient, DEFAULT_SETTINGS };
}
export { createMBColumnCore };
