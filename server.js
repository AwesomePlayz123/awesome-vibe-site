import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { getGame, parseAppId, isSteamCdn } from './lib/steam.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

// Use an ffmpeg already on PATH if there is one; otherwise the copy bundled by ffmpeg-static.
let FFMPEG = 'ffmpeg';
if (spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status !== 0) {
  try {
    const mod = await import('ffmpeg-static');
    if (mod.default) FFMPEG = mod.default;
  } catch {
    /* neither available — the trailer route will explain */
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function attachment(name) {
  const ascii = name.replace(/[^\w.\- ]+/g, '_').trim() || 'download';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function safeName(s, fallback = 'file') {
  return (String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback).slice(0, 120);
}

// GET /api/game?url=<steam url or app id>
async function handleGame(req, res, q) {
  const appid = parseAppId(q.get('url'));
  if (!appid) return sendJson(res, 400, { error: "That doesn't look like a Steam store link. Try something like https://store.steampowered.com/app/548430/" });
  try {
    sendJson(res, 200, await getGame(appid));
  } catch (e) {
    sendJson(res, e.status || 502, { error: e.message || 'Could not reach Steam.' });
  }
}

// GET /api/image?src=<steam cdn url>[&download=<filename>]
// Same-origin proxy so the browser can draw Steam images onto a canvas and save them with a nice filename.
async function handleImage(req, res, q) {
  const src = q.get('src');
  if (!isSteamCdn(src)) return sendJson(res, 400, { error: 'Only Steam CDN images can be proxied.' });
  try {
    const upstream = await fetch(src, { signal: AbortSignal.timeout(20000) });
    if (!upstream.ok) return sendJson(res, upstream.status, { error: `Steam CDN returned ${upstream.status}` });
    const headers = {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    };
    const len = upstream.headers.get('content-length');
    if (len) headers['Content-Length'] = len;
    const dl = q.get('download');
    if (dl) headers['Content-Disposition'] = attachment(safeName(dl));
    res.writeHead(200, headers);
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (e) {
    sendJson(res, 502, { error: e.message });
  }
}

// GET /api/trailer?src=<hls .m3u8 or mp4 url>&name=<filename without extension>
// Steam serves trailers as HLS streams, so ffmpeg stitches the best-quality stream into a regular MP4.
async function handleTrailer(req, res, q) {
  const src = q.get('src');
  const name = safeName(q.get('name'), 'trailer') + '.mp4';
  if (!isSteamCdn(src)) return sendJson(res, 400, { error: 'Only Steam CDN trailers can be downloaded.' });

  const isHls = new URL(src).pathname.toLowerCase().endsWith('.m3u8');
  if (!isHls) {
    // Direct MP4 (older games): just stream it through.
    const upstream = await fetch(src).catch(() => null);
    if (!upstream?.ok) return sendJson(res, 502, { error: 'Could not fetch that trailer from Steam.' });
    const headers = { 'Content-Type': 'video/mp4', 'Content-Disposition': attachment(name) };
    const len = upstream.headers.get('content-length');
    if (len) headers['Content-Length'] = len;
    res.writeHead(200, headers);
    return Readable.fromWeb(upstream.body).pipe(res);
  }

  const tmp = path.join(os.tmpdir(), `trailer-${crypto.randomUUID()}.mp4`);
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', tmp];
  let stderr = '';
  const code = await new Promise((resolve) => {
    let ff;
    try {
      ff = spawn(FFMPEG, args, { windowsHide: true });
    } catch {
      return resolve('missing');
    }
    ff.on('error', (e) => resolve(e.code === 'ENOENT' ? 'missing' : 1));
    ff.stderr.on('data', (d) => (stderr += d));
    ff.on('close', resolve);
    // If the user cancels while ffmpeg is still working, stop it.
    res.on('close', () => {
      if (ff.exitCode === null) ff.kill('SIGKILL');
    });
  });

  if (code === 'missing') {
    return sendJson(res, 501, { error: 'ffmpeg not found. Run "npm install" (it bundles ffmpeg) or install ffmpeg and add it to your PATH.' });
  }
  if (code !== 0) {
    await fsp.rm(tmp, { force: true });
    return sendJson(res, 502, { error: 'ffmpeg could not convert the trailer.', details: stderr.slice(-500) });
  }
  const { size } = await fsp.stat(tmp);
  res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': size, 'Content-Disposition': attachment(name) });
  const stream = fs.createReadStream(tmp);
  stream.pipe(res);
  const cleanup = () => fsp.rm(tmp, { force: true }).catch(() => {});
  stream.on('close', cleanup);
  res.on('close', cleanup);
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' });
  try {
    const data = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  try {
    if (pathname === '/api/game') return await handleGame(req, res, searchParams);
    if (pathname === '/api/image') return await handleImage(req, res, searchParams);
    if (pathname === '/api/trailer') return await handleTrailer(req, res, searchParams);
    if (req.method === 'GET') return await serveStatic(req, res, pathname);
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    if (!res.headersSent) sendJson(res, 500, { error: e.message });
    else res.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`\n  awesome-vibe-site running at http://localhost:${PORT}\n`);
});
