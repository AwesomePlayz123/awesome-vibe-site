// Local dev server. On Cloudflare Pages, files in public/ are served as-is and functions/api/*.js become /api/*.
// This mimics that so `npm start` behaves the same as the deployed site.
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import * as game from './functions/api/game.js';
import * as file from './functions/api/file.js';
import * as clipart from './functions/api/clipart.js';
import * as audio from './functions/api/audio.js';
import * as steamSearch from './functions/api/steam-search.js';
import * as spotify from './functions/api/spotify.js';
import * as steamCheck from './functions/api/steam-check.js';
import * as proxy from './functions/api/proxy.js';
import * as youtube from './functions/api/youtube.js';
import * as steamArt from './functions/api/steam-art.js';
import * as steamReview from './functions/api/steam-review.js';
import * as script from './functions/api/script.js';
import * as gameFacts from './functions/api/game-facts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
const ROUTES = { '/api/game': game, '/api/file': file, '/api/clipart': clipart, '/api/audio': audio, '/api/steam-search': steamSearch, '/api/spotify': spotify, '/api/steam-check': steamCheck, '/api/proxy': proxy, '/api/youtube': youtube, '/api/steam-art': steamArt, '/api/steam-review': steamReview, '/api/script': script, '/api/game-facts': gameFacts };

// Secrets for local runs: environment variables, or a .dev.vars file (KEY=value per line, same as Cloudflare's tooling).
const env = { ...process.env };
try {
  const text = await fsp.readFile(path.join(__dirname, '.dev.vars'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/i);
    if (m) env[m[1]] = m[2];
  }
} catch {
  /* no .dev.vars — fine */
}

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
    let file = filePath;
    const stat = await fsp.stat(file);
    if (stat.isDirectory()) {
      // Like Cloudflare: /tools/x → /tools/x/, and folders serve their index.html
      if (!pathname.endsWith('/')) {
        res.writeHead(308, { Location: `${pathname}/` }).end();
        return;
      }
      file = path.join(file, 'index.html');
    }
    const data = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
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
      // Same as Pages: onRequestGet / onRequestPost per method.
      const handler = route[`onRequest${req.method[0]}${req.method.slice(1).toLowerCase()}`];
      if (!handler) return res.writeHead(405).end();
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      let body;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        body = Buffer.concat(chunks);
      }
      const request = new Request(url, { method: req.method, headers, body });
      return await sendResponse(res, await handler({ request, env }));
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
