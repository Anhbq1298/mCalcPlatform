// Canvas worksheet cross-check for mPunchingShear (runs the Canvas engine through vitest).
export default { test: { include: ['tools/punching-shear/crosscheck/*.crosscheck.ts'], root: new URL('../../../', import.meta.url).pathname } };
