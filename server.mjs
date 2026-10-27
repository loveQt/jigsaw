import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 5187);
const runtimeFiles = new Set([
  '/index.html', '/src/main.js', '/src/level.js', '/src/puzzle-engine.js',
  '/src/icons.js', '/src/style.css', '/src/packing.js', '/src/mosaic-data.js',
  '/src/contour-data.js', '/src/contour-geometry.js',
  '/src/party-data.js', '/src/party-geometry.js',
  '/src/maze-geometry.js', '/src/maze-art.js',
]);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
};
const assetTypes = new Set(['.svg', '.png', '.webp', '.jpg', '.jpeg', '.avif', '.woff2']);

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/') path = '/index.html';
    const isAsset = path.startsWith('/assets/') && assetTypes.has(extname(path));
    if ((!runtimeFiles.has(path) && !isAsset) || /(^|\/)\./.test(path)) {
      notFound(res);
      return;
    }
    const allowedRoot = isAsset ? resolve(root, 'public/assets') : root;
    const relative = isAsset ? path.slice('/assets/'.length) : `.${path}`;
    const file = await realpath(resolve(allowedRoot, relative));
    const canonicalRoot = await realpath(allowedRoot);
    if (!file.startsWith(canonicalRoot + sep) || !(await stat(file)).isFile()) {
      notFound(res);
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    notFound(res);
  }
}).listen(port, '127.0.0.1', () => console.log(`Pawzzle ready at http://127.0.0.1:${port}`));
