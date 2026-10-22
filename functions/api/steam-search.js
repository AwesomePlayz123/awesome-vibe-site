// GET /api/steam-search?q=<game name>&cc=us
// Type-ahead suggestions from the Steam store search (same results as the store's search box).
import { json, cachedJson } from '../../lib/http.js';
import { REGIONS } from '../../lib/steam.js';

function formatPrice(price, cc) {
  if (!price) return null;
  const fmt = (cents) => {
    try {
      return new Intl.NumberFormat(cc === 'us' ? 'en-US' : `en-${cc.toUpperCase()}`, { style: 'currency', currency: price.currency }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${price.currency}`;
    }
  };
  const discount = price.initial > price.final ? Math.round((1 - price.final / price.initial) * 100) : 0;
  return { final: fmt(price.final), initial: discount ? fmt(price.initial) : null, discount };
}

export async function onRequestGet({ request }) {
  const p = new URL(request.url).searchParams;
  const q = (p.get('q') || '').trim().slice(0, 80);
  let cc = (p.get('cc') || 'us').toLowerCase();
  if (!REGIONS.includes(cc)) cc = 'us';
  if (q.length < 2) return json(200, { items: [] });

  try {
    const data = await cachedJson(`steamsearch:${cc}:${q.toLowerCase()}`, async () => {
      const res = await fetch(
        `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=${cc.toUpperCase()}`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' } }
      );
      if (!res.ok) throw Object.assign(new Error(`Steam search returned ${res.status}`), { status: 502 });
      return res.json();
    });
    const items = (data.items || [])
      .filter((i) => i.type === 'app')
      .slice(0, 8)
      .map((i) => ({ id: i.id, name: i.name, image: i.tiny_image, price: formatPrice(i.price, cc) }));
    return json(200, { items });
  } catch (e) {
    return json(e.status || 502, { error: e.message || 'Steam search failed.' });
  }
}
