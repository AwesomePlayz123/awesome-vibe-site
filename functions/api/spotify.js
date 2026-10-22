// GET /api/spotify?url=<open.spotify.com playlist/album/track link>
// Looks up the title and cover of a Spotify playlist or album via Spotify's public oEmbed endpoint,
// so saved playlists get a proper name and thumbnail. No key needed.
import { json, cachedJson } from '../../lib/http.js';

export async function onRequestGet({ request }) {
  const src = new URL(request.url).searchParams.get('url') || '';
  const m = src.match(/^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track)\/([A-Za-z0-9]{10,40})/);
  if (!m) return json(400, { error: 'Not a Spotify playlist, album or track link.' });
  const canonical = `https://open.spotify.com/${m[1]}/${m[2]}`;
  try {
    const data = await cachedJson(`spotify-oembed:${canonical}`, async () => {
      const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(canonical)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (res.status === 404) throw Object.assign(new Error('Spotify couldn’t find that playlist (it may be private).'), { status: 404 });
      if (!res.ok) throw Object.assign(new Error(`Spotify returned ${res.status}`), { status: 502 });
      return res.json();
    });
    return json(200, { type: m[1], id: m[2], title: data.title || null, thumbnail: data.thumbnail_url || null });
  } catch (e) {
    return json(e.status || 502, { error: e.message });
  }
}
