import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tiny static server for the Velora Heat game: serves files under game/ on
// port 8080 (or $PORT), Node standard library only. Any path that resolves
// outside game/ is refused with a 404 and never served.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(__dirname, 'game');
const PORT = Number(process.env.PORT) || 8080;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

function send404(res: http.ServerResponse, url: string): void {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 not found: ' + url);
}

const server = http.createServer((req, res) => {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('405 method not allowed');
    return;
  }
  let rawPath = '/';
  try {
    rawPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch {
    send404(res, req.url || '/');
    return;
  }
  // Resolve inside game/ and refuse anything that escapes it (including
  // encoded ".." segments, which resolve collapses before the prefix test).
  const resolved = path.resolve(gameDir, '.' + rawPath);
  if (resolved !== gameDir && !resolved.startsWith(gameDir + path.sep)) {
    send404(res, rawPath);
    return;
  }
  let filePath = resolved;
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    send404(res, rawPath);
    return;
  }
  // Re-check after the directory join (index.html stays inside game/).
  if (!filePath.startsWith(gameDir + path.sep)) {
    send404(res, rawPath);
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send404(res, rawPath);
      return;
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length });
    if (method === 'GET') res.end(data);
    else res.end();
  });
  console.log(method + ' ' + rawPath);
});

server.listen(PORT, () => {
  console.log('Velora Heat dev server: http://localhost:' + PORT + '/ (serving ' + gameDir + ')');
});
