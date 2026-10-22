// Local dev server. On Cloudflare Pages, files in public/ are served as-is and functions/api/*.js become /api/*.
// This mimics that so `npm start` behaves the same as the deployed site.
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import * as game from './functions/api/game.js';
import * as file from './functions/api/file.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
const ROUTES = { '/api/game': game, '/api/file': file };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

async function sendResponse(res, response) {
  const headers = Object.fromEntries(response.headers.entries());
  res.writeHead(response.status, headers);
  if (!response.body) return res.end();
  Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res);
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await fsp.readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    const route = ROUTES[url.pathname];
    if (route) {
      if (req.method !== 'GET' || !route.onRequestGet) return res.writeHead(405).end();
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      const request = new Request(url, { method: 'GET', headers });
      return await sendResponse(res, await route.onRequestGet({ request }));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
    await serveStatic(res, url.pathname);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' }).end(e.message);
    else res.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`\n  awesome-vibe-site running at http://localhost:${PORT}\n`);
});
