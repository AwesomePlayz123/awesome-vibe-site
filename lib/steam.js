// Everything that talks to Steam lives here.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const CDN = 'https://shared.akamai.steamstatic.com/store_item_assets/';

// Pull an app id out of whatever the user pasted:
// store.steampowered.com/app/548430/..., steamcommunity.com/app/548430, steamdb.info/app/548430, or just 548430
export function parseAppId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/\/app\/(\d+)/i) || s.match(/[?&]appids?=(\d+)/i);
  return m ? m[1] : null;
}

async function get(url, { asText = false, headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw Object.assign(new Error(`Steam returned ${res.status} for ${url}`), { upstreamStatus: res.status });
  return asText ? res.text() : res.json();
}

// Valve's Web API (api.steampowered.com) is a separate server from the store website. The store site
// often blocks cloud servers like Cloudflare's, so the Web API is used as a fallback for everything.
export async function storeApi(iface, method, input) {
  const url = `https://api.steampowered.com/${iface}/${method}/v1?input_json=${encodeURIComponent(JSON.stringify(input))}`;
  const json = await get(url);
  return json?.response || {};
}

const DATA_REQUEST = {
  include_assets: true,
  include_release: true,
  include_basic_info: true,
  include_reviews: true,
  include_screenshots: true,
  include_trailers: true,
  include_all_purchase_options: true,
  include_best_purchase_option: true,
};

const storeItemCache = new Map();
export function getStoreItem(appid, cc = 'us') {
  const key = `${appid}:${cc}`;
  if (!storeItemCache.has(key)) {
    const p = storeApi('IStoreBrowseService', 'GetItems', {
      ids: [{ appid: Number(appid) }],
      context: { language: 'english', country_code: cc.toUpperCase() },
      data_request: DATA_REQUEST,
    })
      .then((r) => r.store_items?.[0] || null)
      .catch(() => null);
    storeItemCache.set(key, p);
    p.finally(() => setTimeout(() => storeItemCache.delete(key), 60000));
  }
  return storeItemCache.get(key);
}

// Turn a Web API asset filename into a full CDN URL.
export function assetUrl(a, file, appid) {
  if (!file) return null;
  if (/^https?:\/\//.test(file)) return file;
  const fmt = a?.asset_url_format || `steam/apps/${appid}/\${FILENAME}`;
  return CDN + fmt.replace('${FILENAME}', file);
}

async function exists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Return the first URL (in priority order) that actually exists on the CDN.
async function firstExisting(urls) {
  const list = [...new Set(urls.filter(Boolean))];
  const results = await Promise.all(list.map(exists));
  const i = results.indexOf(true);
  return i === -1 ? null : list[i];
}

function decodeEntities(s = '') {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

// Library art (logo, 600x900 cover, hero) isn't in appdetails. The Web API knows the real
// (sometimes hashed) filenames, so use it first and fall back to the classic paths.
async function getLibraryAssets(appid, item) {
  const a = item?.assets || {};
  const fmt = (file) => assetUrl(a, file, appid);
  const legacy = (file) => `${CDN}steam/apps/${appid}/${file}`;
  // Newer games keep their art in a hashed folder; the logo usually sits next to the library hero.
  const heroDir = (a.library_hero || '').includes('/') ? a.library_hero.slice(0, a.library_hero.lastIndexOf('/') + 1) : null;

  const [logo, cover, hero] = await Promise.all([
    firstExisting([
      fmt(a.library_logo_2x),
      fmt(a.library_logo),
      heroDir && fmt(`${heroDir}logo_2x.png`),
      heroDir && fmt(`${heroDir}logo.png`),
      legacy('logo_2x.png'),
      legacy('logo.png'),
    ]),
    firstExisting([fmt(a.library_capsule_2x), fmt(a.library_capsule), legacy('library_600x900_2x.jpg'), legacy('library_600x900.jpg')]),
    firstExisting([fmt(a.library_hero_2x), fmt(a.library_hero), legacy('library_hero_2x.jpg'), legacy('library_hero.jpg')]),
  ]);
  return { logo, cover, hero };
}

// The "Recent / English / All reviews" rows only exist on the store page itself, so read them from there.
async function getReviewsFromStorePage(appid) {
  const html = await get(`https://store.steampowered.com/app/${appid}/?l=english&cc=us`, {
    asText: true,
    headers: { Cookie: 'birthtime=0; lastagecheckage=1-0-1900; wants_mature_content=1; Steam_Language=english' },
  });
  const rows = [];
  const seen = new Set();
  const chunks = html.split('class="user_reviews_summary_row"').slice(1);
  for (const chunk of chunks) {
    const part = chunk.slice(0, 2500);
    const label = part.match(/class="subtitle column[^"]*"[^>]*>([^<]+)</)?.[1];
    const summary = part.match(/class="game_review_summary([^"]*)"[^>]*>([^<]+)</);
    if (!label || !summary) continue;
    const key = decodeEntities(label).replace(/:$/, '').toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const count = part.match(/class="responsive_hidden"[^>]*>\s*\(([\d,.]+)\)/)?.[1] || null;
    rows.push({ label: key, summary: decodeEntities(summary[2]), tone: toneOf(summary[1]), count });
  }
  return rows;
}

async function getReviewsFromApi(appid) {
  const q = (lang) =>
    get(`https://store.steampowered.com/appreviews/${appid}?json=1&language=${lang}&purchase_type=all&num_per_page=0`)
      .then((j) => j.query_summary)
      .catch(() => null);
  const [en, all] = await Promise.all([q('english'), q('all')]);
  const rows = [];
  for (const [label, s] of [['ENGLISH REVIEWS', en], ['ALL REVIEWS', all]]) {
    if (s?.review_score_desc && s.total_reviews) {
      rows.push({
        label,
        summary: s.review_score_desc,
        tone: toneOf(s.review_score_desc),
        count: Number(s.total_reviews).toLocaleString('en-US'),
      });
    }
  }
  return rows;
}

function reviewsFromItem(item) {
  const r = item?.reviews || {};
  const rows = [];
  for (const [label, sum] of [['ENGLISH REVIEWS', r.summary_language_specific], ['ALL REVIEWS', r.summary_filtered]]) {
    if (sum?.review_score_label && sum.review_count) {
      rows.push({
        label,
        summary: sum.review_score_label,
        tone: toneOf(sum.review_score_label),
        count: Number(sum.review_count).toLocaleString('en-US'),
      });
    }
  }
  return rows;
}

function toneOf(s = '') {
  s = s.toLowerCase();
  if (s.includes('negative')) return 'negative';
  if (s.includes('mixed')) return 'mixed';
  if (s.includes('positive')) return 'positive';
  return 'neutral';
}

// Steam store regions offered in the UI (prices and currency depend on this).
export const REGIONS = ['us', 'ca', 'gb', 'de', 'fr', 'au', 'br', 'jp'];

function getPrice(d) {
  const p = d.price_overview;
  if (p) {
    return {
      state: 'paid',
      currency: p.currency,
      discount: p.discount_percent || 0,
      initial: p.initial_formatted || p.final_formatted,
      final: p.final_formatted,
    };
  }
  if (d.is_free) return { state: 'free', label: 'Free' };
  if (d.release_date?.coming_soon) return { state: 'soon', label: 'Coming Soon' };
  return { state: 'none', label: 'Not for sale' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDate(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
}

const VIDEO_CDN = 'https://video.akamai.steamstatic.com/';
const join = (base, path) => base + String(path).replace(/^\/+/, '');
function videoUrl(path) {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : join(VIDEO_CDN, path);
}

// Does a URL exist? HEAD first, then a tiny ranged GET for servers that don't answer HEAD.
async function reachable(url) {
  if (await exists(url)) return true;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Range: 'bytes=0-0' }, signal: AbortSignal.timeout(8000) });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

// The Web API gives file paths without saying what they're relative to. Try each way of building the URL on
// the first file, then use whichever worked for all of them (they share a format).
async function resolvePaths(files, makeCandidates, check = exists) {
  const list = files.filter(Boolean);
  if (!list.length) return files.map(() => null);
  const options = makeCandidates(list[0]);
  const hits = await Promise.all(options.map(check));
  const k = Math.max(0, hits.indexOf(true));
  return files.map((f) => (f ? makeCandidates(f)[k] || null : null));
}

// Steam paths sometimes include "steam/apps/<id>/…" already and sometimes are just a file name.
function cdnCandidates(file, a, appid) {
  if (/^https?:\/\//.test(file)) return [file];
  const clean = String(file).replace(/^\/+/, '').replace(/^store_item_assets\//, '');
  const out = [];
  if (/^steam\//.test(clean)) out.push(join(CDN, clean));
  out.push(assetUrl(a, clean, appid));
  out.push(join(CDN, `steam/apps/${appid}/${clean.split('/').pop()}`));
  return [...new Set(out)];
}

// Build the same game object from a Web API store item (used when the store site blocks us).
async function gameFromItem(appid, item, cc) {
  const a = item.assets || {};
  const rel = item.release || {};
  const bp = item.best_purchase_option || item.purchase_options?.[0];
  let price;
  if (item.is_free || bp?.is_free_license) price = { state: 'free', label: 'Free' };
  else if (bp?.formatted_final_price) {
    price = {
      state: 'paid',
      currency: null,
      discount: bp.discount_pct || 0,
      initial: bp.formatted_original_price || bp.formatted_final_price,
      final: bp.formatted_final_price,
    };
  } else if (rel.is_coming_soon || item.is_coming_soon) price = { state: 'soon', label: 'Coming Soon' };
  else price = { state: 'none', label: 'Not for sale' };

  const releaseDate = rel.is_coming_soon
    ? `Coming soon${rel.custom_release_date_message ? ` (${rel.custom_release_date_message})` : rel.coming_soon_display ? ` (${rel.coming_soon_display})` : ''}`
    : rel.custom_release_date_message || formatDate(rel.steam_release_date || rel.original_release_date);

  const allTrailers = [...(item.trailers?.highlights || []).map((t) => ({ ...t, _hl: true })), ...(item.trailers?.other_trailers || [])];
  const picked = allTrailers.map((t) => {
    const adaptive = t.adaptive_trailers || [];
    const hls =
      adaptive.find((x) => /h264|264/i.test(x.encoding || '') && /m3u8/i.test(x.cdn_path || '')) ||
      adaptive.find((x) => /m3u8/i.test(x.cdn_path || ''));
    const mp4 = [...(t.trailer_max || []), ...(t.trailer_480p || [])].find((v) => /mp4/i.test(v.type || v.filename || ''));
    return { t, hlsPath: hls?.cdn_path || null, mp4File: mp4?.filename || null };
  });

  const hlsCandidates = (p) =>
    /^https?:\/\//.test(p)
      ? [p]
      : [...new Set([join(VIDEO_CDN, p), join(VIDEO_CDN, `store_trailers/${String(p).replace(/^\/+/, '').replace(/^store_trailers\//, '')}`), join(CDN, p)])];
  const mp4Candidates = (file, t) => {
    if (/^https?:\/\//.test(file)) return [file];
    const viaFormat = t.trailer_url_format ? t.trailer_url_format.replace('${FILENAME}', file) : file;
    return [...new Set([join(VIDEO_CDN, viaFormat), join(VIDEO_CDN, `store_trailers/${viaFormat}`), join(CDN, viaFormat)])];
  };
  const shots = (item.screenshots?.all_ages_screenshots || []).sort((x, y) => (x.ordinal || 0) - (y.ordinal || 0));

  const [hlsUrls, mp4Urls, thumbUrls, shotUrls] = await Promise.all([
    resolvePaths(picked.map((p) => p.hlsPath), hlsCandidates, reachable),
    resolvePaths(picked.map((p) => p.mp4File), (f) => mp4Candidates(f, picked.find((p) => p.mp4File === f)?.t || {}), reachable),
    resolvePaths(picked.map((p) => p.t.screenshot_medium), (f) => cdnCandidates(f, null, picked.find((p) => p.t.screenshot_medium === f)?.t.trailer_base_id || appid)),
    resolvePaths(shots.map((x) => x.filename), (f) => cdnCandidates(f, a, appid)),
  ]);

  const trailers = picked
    .map((p, i) => ({
      id: p.t.trailer_base_id || i,
      name: p.t.trailer_name || `Trailer ${i + 1}`,
      thumbnail: thumbUrls[i],
      highlight: !!p.t._hl,
      hls: hlsUrls[i],
      mp4: mp4Urls[i],
    }))
    .filter((t) => t.hls || t.mp4);

  return {
    name: item.name,
    type: 'game',
    description: decodeEntities(item.basic_info?.short_description || ''),
    releaseDate,
    developers: (item.basic_info?.developers || []).map((x) => x.name).filter(Boolean),
    publishers: (item.basic_info?.publishers || []).map((x) => x.name).filter(Boolean),
    price,
    header: assetUrl(a, a.header, appid),
    smallCapsule: assetUrl(a, a.small_capsule, appid),
    wideCapsule: assetUrl(a, a.small_capsule_2x, appid),
    background: assetUrl(a, a.raw_page_background || a.page_background, appid),
    screenshots: shotUrls,
    trailers,
  };
}

export async function getGame(appid, cc = 'us') {
  if (!REGIONS.includes(cc)) cc = 'us';

  const [detailsResult, item] = await Promise.all([
    get(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=${cc}&l=english`).then(
      (v) => ({ ok: true, v }),
      (e) => ({ ok: false, e })
    ),
    getStoreItem(appid, cc),
  ]);

  let base;
  if (detailsResult.ok) {
    const entry = detailsResult.v?.[appid];
    if (!entry?.success) {
      throw Object.assign(new Error('Steam has no store page for that app (it may be region-locked, delisted, or not a game).'), { status: 404 });
    }
    const d = entry.data;
    base = {
      name: d.name,
      type: d.type,
      description: decodeEntities(d.short_description),
      releaseDate: d.release_date?.coming_soon ? `Coming soon${d.release_date.date ? ` (${d.release_date.date})` : ''}` : d.release_date?.date || '',
      developers: d.developers || [],
      publishers: d.publishers || [],
      price: getPrice(d),
      header: d.header_image || null,
      smallCapsule: d.capsule_image || null,
      wideCapsule: null,
      background: d.background_raw || d.background || null,
      screenshots: (d.screenshots || []).map((x) => x.path_full),
      trailers: (d.movies || []).map((m) => ({
        id: m.id,
        name: m.name,
        thumbnail: m.thumbnail,
        highlight: !!m.highlight,
        // Newer Steam trailers are HLS/DASH only; older API responses still had direct MP4s.
        hls: m.hls_h264 || null,
        mp4: m.mp4?.max || m.mp4?.['480'] || null,
      })),
      source: 'store',
    };
  } else if (item && item.success !== 2 && item.name) {
    base = { ...(await gameFromItem(appid, item, cc)), source: 'webapi' };
  } else if (item && (item.success === 2 || item.visible === false)) {
    throw Object.assign(new Error('Steam has no store page for that app (it may be region-locked, delisted, or not a game).'), { status: 404 });
  } else {
    const status = detailsResult.e?.upstreamStatus;
    throw Object.assign(
      new Error(
        status === 403 || status === 429
          ? 'Steam is refusing requests from this server right now. Try again in a minute; if it keeps happening, open /api/steam-check on your site and send me what it shows.'
          : `Couldn’t reach Steam (${detailsResult.e?.message || 'unknown error'}).`
      ),
      { status: 502 }
    );
  }

  const [library, capsule, reviews] = await Promise.all([
    getLibraryAssets(appid, item),
    firstExisting([
      base.smallCapsule ? base.smallCapsule.replace(/capsule_231x87(\.\w+)/, 'capsule_467x181$1') : null,
      base.wideCapsule,
      `${CDN}steam/apps/${appid}/capsule_467x181.jpg`,
      base.smallCapsule,
    ]),
    getReviewsFromStorePage(appid)
      .then((r) => (r.length ? r : Promise.reject()))
      .catch(() => getReviewsFromApi(appid))
      .then((r) => (r.length ? r : reviewsFromItem(item)))
      .catch(() => reviewsFromItem(item)),
  ]);

  return {
    appid,
    name: base.name,
    type: base.type,
    storeUrl: `https://store.steampowered.com/app/${appid}/`,
    description: base.description,
    releaseDate: base.releaseDate,
    developers: base.developers,
    publishers: base.publishers,
    reviews,
    region: cc,
    price: base.price,
    source: base.source,
    images: {
      header: base.header,
      capsule: capsule || base.header,
      logo: library.logo,
      cover: library.cover,
      hero: library.hero,
      background: base.background,
    },
    screenshots: base.screenshots.filter(Boolean),
    trailers: base.trailers,
  };
}

// Only proxy files from Steam's own CDNs.
export function isSteamCdn(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return u.hostname.endsWith('.steamstatic.com') || u.hostname === 'steamcdn-a.akamaihd.net';
  } catch {
    return false;
  }
}

// Pixabay image hosts (search previews and full-size downloads).
export function isPixabayFile(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'pixabay.com' || u.hostname === 'cdn.pixabay.com');
  } catch {
    return false;
  }
}
