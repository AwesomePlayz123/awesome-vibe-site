// GET /api/file?src=<steam / pixabay / freesound / jamendo url>[&download=<filename>]
// Same-origin pass-through for Steam CDN files (images, trailer playlists and video segments) and Pixabay
// images, so the page can draw images on a canvas, read trailer streams, and save files with tidy names.
import { isSteamCdn, isPixabayFile } from '../../lib/steam.js';
import { json, attachment, safeName } from '../../lib/http.js';

// Freesound previews/waveforms and Jamendo audio/artwork.
function isAudioFile(url) {
  try {
    const { protocol, hostname: h } = new URL(url);
    if (protocol !== 'https:') return false;
    return h === 'freesound.org' || h.endsWith('.freesound.org') || h.endsWith('.jamendo.com');
  } catch {
    return false;
  }
}

const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  const src = q.get('src');
  if (!isSteamCdn(src) && !isPixabayFile(src) && !isAudioFile(src)) {
    return json(400, { error: 'Only files from Steam, Pixabay, Freesound or Jamendo can be fetched.' });
  }

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
