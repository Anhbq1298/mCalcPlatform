import { cp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { integrateCanvas, integrateSteel, integrateComposite, integrateColumn } from './prepare-tools.mjs';
import { stageSharedSources } from './shared-sources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const canvas = join(root, 'vendor/calccanvas');
const column = join(root, 'vendor/mbcolumn-lite');
const stage = join(root, '.stage/calccanvas');
const dev = process.argv.includes('--dev');
const flags = process.argv.slice(2).filter(arg => arg !== '--dev');
const entries = ['index.html', 'calc/index.html', 't/steel-beam-column/index.html', 't/composite-beam/index.html',
  't/mbcolumn-lite/index.html', 'package/index.html'];

async function put(from, to) {
  const file = join(stage, to);
  await mkdir(dirname(file), { recursive: true });
  await cp(from, file, { recursive: true });
}

function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], { cwd: stage, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Build command failed (' + code + ').')));
  });
}

async function prepare() {
  await readFile(join(canvas, 'package.json')).catch(() => { throw new Error('Initialize the pinned repositories with git submodule update --init.'); });
  await readFile(join(canvas, 'node_modules/vite/package.json')).catch(() => { throw new Error('Install the Canvas dependencies with npm ci --prefix vendor/calccanvas.'); });
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  for (const path of ['src', 'public', 'templates', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'package.json']) {
    await put(join(canvas, path), path);
  }
  await symlink(join(canvas, 'node_modules'), join(stage, 'node_modules'), 'junction');
  for (const path of ['apps', 'packages', 'tools', 'assets']) await put(join(root, path), 'platform/' + path);
  await put(join(root, 'vendor/mbcolumn-solver'), 'platform/vendor/mbcolumn-solver');
  await put(join(root, 'apps/hub/index.html'), entries[0]);
  await put(join(canvas, 'index.html'), entries[1]);
  await put(join(canvas, 'steel/index.html'), entries[2]);
  await put(join(canvas, 'composite/index.html'), entries[3]);
  await put(join(column, 'index.html'), entries[4]);
  await put(join(root, 'apps/hub/package.html'), entries[5]);
  await stageSharedSources(stage, canvas);
  await integrateCanvas(stage);
  await integrateSteel(stage);
  await integrateComposite(stage);
  await integrateColumn(stage);
  const paths = Object.fromEntries(entries.map((entry, index) => ['page' + index, join(stage, entry)]));
  await writeFile(join(stage, 'vite.config.ts'), `
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: ${JSON.stringify(join(root, 'dist'))},
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: ${JSON.stringify(paths)} },
  },
});
`);
}

await prepare();
if (!dev) {
  const typescriptDir = join(canvas, 'node_modules/typescript');
  const bin = JSON.parse(await readFile(join(typescriptDir, 'package.json'), 'utf8')).bin;
  await run(resolve(typescriptDir, typeof bin === 'string' ? bin : bin.tsc), ['-b']);
}
await run(join(canvas, 'node_modules/vite/bin/vite.js'), dev ? flags : ['build', ...flags]);
if (!dev) {
  await writeFile(join(root, 'dist/.nojekyll'), '');
  for (const [from, to] of [['steel', '../t/steel-beam-column/'], ['composite', '../t/composite-beam/']]) {
    const folder = join(root, 'dist', from);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'index.html'), '<!doctype html><meta charset="utf-8"><title>mCalc Platform</title>'
      + '<script>location.replace(' + JSON.stringify(to) + '+location.search+location.hash)</script>'
      + '<a href="' + to + '">Open the tool</a>');
  }
}
