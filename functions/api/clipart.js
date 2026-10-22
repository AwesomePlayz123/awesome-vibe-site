// GET /api/clipart?q=<keywords>&type=vector|illustration|photo|all&transparent=1&offset=0
// Searches Pixabay (images are free for commercial use, no credit needed in your videos).
// Needs the PIXABAY_API_KEY secret (Cloudflare: project Settings → Variables and Secrets).
import { json } from '../../lib/http.js';

const TYPES = ['vector', 'illustration', 'photo', 'all'];
const PAGE = 10;

// Pixabay asks API users to cache results for 24 hours.
async function cachedSearch(params, key) {
  const cacheKey = new Request(`https://pixabay-cache.local/?${params}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit.json();
  }
  const res = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&${params}`);
  if (res.status === 429) throw Object.assign(new Error('Pixabay rate limit hit — wait a minute and try again.'), { status: 429 });
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const text = await res.text().catch(() => '');
    const badKey = /key/i.test(text);
    throw Object.assign(
      new Error(badKey ? 'Pixabay rejected the API key. Check the PIXABAY_API_KEY secret in Cloudflare.' : `Pixabay error: ${text.slice(0, 200)}`),
      { status: badKey ? 503 : 400 }
    );
  }
  if (!res.ok) throw Object.assign(new Error(`Pixabay returned ${res.status}`), { status: 502 });
  const data = await res.json();
  if (cache) {
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } })
    );
  }
  return data;
}

const extOf = (url) => (url.match(/\.(png|jpe?g|gif|svg|webp)(\?|$)/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');

export async function onRequestGet({ request, env }) {
  const key = env?.PIXABAY_API_KEY;
  if (!key) {
    return json(503, {
      error: 'The Pixabay API key isn’t set up yet. Add a secret named PIXABAY_API_KEY in Cloudflare (project → Settings → Variables and Secrets), then redeploy.',
      code: 'NO_KEY',
    });
  }

  const p = new URL(request.url).searchParams;
  const q = (p.get('q') || '').trim().slice(0, 100);
  if (!q) return json(400, { error: 'Type a keyword to search for.' });
  const type = TYPES.includes(p.get('type')) ? p.get('type') : 'vector';
  const transparent = p.get('transparent') === '1';
  const offset = Math.max(0, Math.min(190, Number(p.get('offset')) || 0));

  const params = new URLSearchParams({
    q,
    image_type: type,
    safesearch: 'true',
    per_page: '200',
    lang: 'en',
  }).toString();

  let data;
  try {
    data = await cachedSearch(params, key);
  } catch (e) {
    return json(e.status || 502, { error: e.message });
  }

  let hits = (data.hits || []).map((h) => {
    const scale = Math.min(1, 1280 / Math.max(h.imageWidth, h.imageHeight));
    return {
      id: h.id,
      pageURL: h.pageURL,
      type: h.type,
      tags: h.tags,
      user: h.user,
      preview: h.webformatURL,
      download: h.largeImageURL,
      ext: extOf(h.largeImageURL),
      width: Math.round(h.imageWidth * scale),
      height: Math.round(h.imageHeight * scale),
    };
  });
  // Pixabay serves images that have transparency as PNG, so this is a good first-pass filter.
  if (transparent) hits = hits.filter((h) => h.ext === 'png');

  return json(200, {
    query: q,
    type,
    total: hits.length,
    offset,
    results: hits.slice(offset, offset + PAGE),
    hasMore: offset + PAGE < hits.length,
  });
}
