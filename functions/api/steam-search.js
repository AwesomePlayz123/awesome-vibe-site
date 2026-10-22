// GET /api/steam-search?q=<game name>&cc=us
// Type-ahead suggestions. Tries the store's own search box API first; if the store blocks this server
// (common on Cloudflare), falls back to Valve's Web API search suggestions.
import { json, cachedJson } from '../../lib/http.js';
import { REGIONS, storeApi, assetUrl } from '../../lib/steam.js';

function locale(cc) {
  return cc === 'us' ? 'en-US' : `en-${cc.toUpperCase()}`;
}

function formatPrice(price, cc) {
  if (!price) return null;
  const fmt = (cents) => {
    try {
      return new Intl.NumberFormat(locale(cc), { style: 'currency', currency: price.currency }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${price.currency}`;
    }
  };
  const discount = price.initial > price.final ? Math.round((1 - price.final / price.initial) * 100) : 0;
  return { final: fmt(price.final), initial: discount ? fmt(price.initial) : null, discount };
}

async function fromStore(q, cc) {
  const res = await fetch(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=${cc.toUpperCase()}`,
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' } }
  );
  if (!res.ok) throw new Error(`store ${res.status}`);
  const data = await res.json();
  return (data.items || [])
    .filter((i) => i.type === 'app')
    .slice(0, 8)
    .map((i) => ({ id: i.id, name: i.name, image: i.tiny_image, price: formatPrice(i.price, cc) }));
}

async function fromWebApi(q, cc) {
  const r = await storeApi('IStoreQueryService', 'SearchSuggestions', {
    context: { language: 'english', country_code: cc.toUpperCase() },
    search_term: q,
    max_results: 8,
    filters: { type_filters: { include_games: true, include_software: true, include_demos: false, include_dlc: false } },
    data_request: { include_assets: true, include_best_purchase_option: true, include_all_purchase_options: true },
  });
  const items = r.store_items || [];
  return items
    .filter((i) => i.appid && i.name && i.visible !== false)
    .slice(0, 8)
    .map((i) => {
      const bp = i.best_purchase_option || i.purchase_options?.[0];
      let price = null;
      if (i.is_free) price = { final: 'Free', initial: null, discount: 0 };
      else if (bp?.formatted_final_price) {
        price = {
          final: bp.formatted_final_price,
          initial: bp.discount_pct ? bp.formatted_original_price : null,
          discount: bp.discount_pct || 0,
        };
      }
      return { id: i.appid, name: i.name, image: assetUrl(i.assets, i.assets?.small_capsule, i.appid), price };
    });
}

export async function onRequestGet({ request }) {
  const p = new URL(request.url).searchParams;
  const q = (p.get('q') || '').trim().slice(0, 80);
  let cc = (p.get('cc') || 'us').toLowerCase();
  if (!REGIONS.includes(cc)) cc = 'us';
  if (q.length < 2) return json(200, { items: [] });

  try {
    const items = await cachedJson(`steamsearch-v2:${cc}:${q.toLowerCase()}`, async () => {
      try {
        return await fromStore(q, cc);
      } catch {
        return await fromWebApi(q, cc);
      }
    });
    return json(200, { items });
  } catch (e) {
    return json(502, { error: 'Steam search isn’t reachable right now. You can still paste a Steam store link.' });
  }
}
