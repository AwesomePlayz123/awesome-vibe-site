// GET /api/steam-check[?app=548430]
// Diagnostic: shows which Steam servers this deployment can reach. Open it in the browser if Steam Kit fails.
import { json } from '../../lib/http.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function probe(name, url, method = 'GET') {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method, headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    let note = '';
    if (method === 'GET' && res.ok) {
      const text = await res.text();
      note = text.slice(0, 160).replace(/\s+/g, ' ');
    }
    return { name, status: res.status, ok: res.ok, ms: Date.now() - t0, note };
  } catch (e) {
    return { name, status: null, ok: false, ms: Date.now() - t0, note: String(e.message || e) };
  }
}

export async function onRequestGet({ request }) {
  const app = (new URL(request.url).searchParams.get('app') || '548430').replace(/\D/g, '') || '548430';
  const input = (o) => encodeURIComponent(JSON.stringify(o));
  const checks = await Promise.all([
    probe('Store: game details (appdetails)', `https://store.steampowered.com/api/appdetails?appids=${app}&cc=us&l=english`),
    probe('Store: name search', `https://store.steampowered.com/api/storesearch/?term=portal&l=english&cc=US`),
    probe('Store: store page', `https://store.steampowered.com/app/${app}/`),
    probe(
      'Web API: game details (GetItems)',
      `https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=${input({
        ids: [{ appid: Number(app) }],
        context: { language: 'english', country_code: 'US' },
        data_request: { include_basic_info: true },
      })}`
    ),
    probe(
      'Web API: name search (SearchSuggestions)',
      `https://api.steampowered.com/IStoreQueryService/SearchSuggestions/v1?input_json=${input({
        context: { language: 'english', country_code: 'US' },
        search_term: 'portal',
        max_results: 3,
        filters: { type_filters: { include_games: true } },
        data_request: { include_basic_info: true },
      })}`
    ),
    probe('CDN: images', `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${app}/header.jpg`, 'HEAD'),
  ]);

  // Raw trailer data from the Web API, to help fix trailer downloads if needed.
  let trailerSample = null;
  let screenshotSample = null;
  let assetUrlFormat = null;
  try {
    const res = await fetch(
      `https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=${input({
        ids: [{ appid: Number(app) }],
        context: { language: 'english', country_code: 'US' },
        data_request: { include_trailers: true, include_screenshots: true, include_assets: true },
      })}`,
      { headers: { 'User-Agent': UA } }
    );
    if (res.ok) {
      const it = (await res.json())?.response?.store_items?.[0] || {};
      trailerSample = it.trailers?.highlights?.[0] || it.trailers?.other_trailers?.[0] || null;
      screenshotSample = it.screenshots?.all_ages_screenshots?.slice(0, 2) || null;
      assetUrlFormat = it.assets?.asset_url_format || null;
    }
  } catch {}

  return json(200, { checkedAt: new Date().toISOString(), app, checks, assetUrlFormat, screenshotSample, trailerSample });
}
