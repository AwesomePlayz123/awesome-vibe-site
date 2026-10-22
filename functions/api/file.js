// GET /api/file?src=<steam cdn url>[&download=<filename>]
// Same-origin pass-through for Steam CDN files (images, trailer playlists and video segments), so the page
// can draw images on a canvas, read trailer streams, and save files with tidy names.
import { isSteamCdn } from '../../lib/steam.js';
import { json, attachment, safeName } from '../../lib/http.js';

const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  const src = q.get('src');
  if (!isSteamCdn(src)) return json(400, { error: 'Only files on Steam’s CDN can be fetched.' });

  const headers = {};
  const range = request.headers.get('range');
  if (range) headers.Range = range;

  let upstream;
  try {
    upstream = await fetch(src, { headers });
  } catch (e) {
    return json(502, { error: `Could not reach Steam's CDN: ${e.message}` });
  }
  if (!upstream.ok) return json(upstream.status, { error: `Steam's CDN returned ${upstream.status}` });

  const out = new Headers();
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set('Cache-Control', 'public, max-age=86400');
  const dl = q.get('download');
  if (dl) out.set('Content-Disposition', attachment(safeName(dl)));

  return new Response(upstream.body, { status: upstream.status, headers: out });
}
