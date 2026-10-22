// GET /api/spotify?url=<open.spotify.com playlist/album/track link>
// Title and cover come from Spotify's public oEmbed endpoint. For songs, the artist name is read from the
// song page's link-preview tags (the same info Discord/iMessage show when a Spotify link is pasted).
// No key needed. If the artist can't be found, `artist` is null and everything else still works.
import { json, cachedJson } from '../../lib/http.js';

function decode(s = '') {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

// Read <meta property|name="…" content="…"> tags, whatever order the attributes are in.
function metaTags(html) {
  const out = [];
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = tag.match(/\b(?:property|name)\s*=\s*"([^"]+)"/i)?.[1];
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1];
    if (key && content !== undefined) out.push([key.toLowerCase(), decode(content)]);
  }
  return out;
}

async function trackArtist(canonical) {
  try {
    const res = await fetch(canonical, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; awesome-vibe-site link preview)', 'Accept-Language': 'en' },
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 300000);
    const tags = metaTags(html);
    const musicians = tags.filter(([k]) => k === 'music:musician_description').map(([, v]) => v.trim()).filter(Boolean);
    if (musicians.length) return [...new Set(musicians)].join(', ');
    // Fallback: "The Weeknd · After Hours · Song · 2020"
    const desc = tags.find(([k]) => k === 'og:description')?.[1] || '';
    const first = desc.split(' · ')[0]?.trim();
    return first && desc.includes(' · ') ? first : null;
  } catch {
    return null;
  }
}

export async function onRequestGet({ request }) {
  const src = new URL(request.url).searchParams.get('url') || '';
  const m = src.match(/^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track)\/([A-Za-z0-9]{10,40})/);
  if (!m) return json(400, { error: 'Not a Spotify playlist, album or track link.' });
  const [, type, id] = m;
  const canonical = `https://open.spotify.com/${type}/${id}`;
  try {
    const data = await cachedJson(`spotify-info-v2:${canonical}`, async () => {
      const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(canonical)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (res.status === 404) throw Object.assign(new Error('Spotify couldn’t find that (it may be private).'), { status: 404 });
      if (!res.ok) throw Object.assign(new Error(`Spotify returned ${res.status}`), { status: 502 });
      const o = await res.json();
      return {
        title: o.title || null,
        thumbnail: o.thumbnail_url || null,
        artist: type === 'track' ? await trackArtist(canonical) : null,
      };
    });
    return json(200, { type, id, ...data });
  } catch (e) {
    return json(e.status || 502, { error: e.message });
  }
}
