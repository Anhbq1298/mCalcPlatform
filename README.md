# mCalc Platform

A local-first structural calculation workspace for mCalcCanvas, mSteelBeamColumn, mCompositeBeamDesign, MBColumn Lite, and mConcBreakout.

## Development

Requires Node.js 22 or newer and Git.

```sh
git submodule update --init
npm ci --prefix vendor/calccanvas
npm run dev
npm test
npm run check-boundaries
npm run build
```

See [architecture](docs/ARCHITECTURE.md) for repository boundaries and deployment status.
