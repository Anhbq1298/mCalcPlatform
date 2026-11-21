import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist', import.meta.url));
const mount = '/mCalcPlatform/';
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.woff2', 'font/woff2'], ['.woff', 'font/woff'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'],
]);
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!path.startsWith(mount)) throw new Error();
    const file = resolve(root, path.slice(mount.length) + (path.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error();
    response.setHeader('Content-Type', contentTypes.get(extname(file)) ?? 'application/octet-stream');
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(4180);
