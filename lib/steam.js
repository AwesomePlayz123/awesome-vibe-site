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
  if (!res.ok) throw new Error(`Steam returned ${res.status} for ${url}`);
  return asText ? res.text() : res.json();
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

// Library art (logo, 600x900 cover, hero) isn't in appdetails. The store browse API knows
// the real (sometimes hashed) filenames, so ask it first and fall back to the classic paths.
async function getLibraryAssets(appid) {
  let a = {};
  try {
    const input = {
      ids: [{ appid: Number(appid) }],
      context: { language: 'english', country_code: 'US' },
      data_request: { include_assets: true },
    };
    const url = `https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=${encodeURIComponent(
      JSON.stringify(input)
    )}`;
    const json = await get(url);
    a = json?.response?.store_items?.[0]?.assets || {};
  } catch {
    /* fall through to legacy paths */
  }
  const fmt = (file) => (file && a.asset_url_format ? CDN + a.asset_url_format.replace('${FILENAME}', file) : null);
  const legacy = (file) => `${CDN}steam/apps/${appid}/${file}`;

  const [logo, cover, hero] = await Promise.all([
    firstExisting([fmt(a.library_logo_2x), fmt(a.library_logo), legacy('logo_2x.png'), legacy('logo.png')]),
    firstExisting([
      fmt(a.library_capsule_2x),
      fmt(a.library_capsule),
      legacy('library_600x900_2x.jpg'),
      legacy('library_600x900.jpg'),
    ]),
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

function toneOf(s = '') {
  s = s.toLowerCase();
  if (s.includes('negative')) return 'negative';
  if (s.includes('mixed')) return 'mixed';
  if (s.includes('positive')) return 'positive';
  return 'neutral';
}

// Steam store regions offered in the UI (prices and currency depend on this).
export const REGIONS = ['us', 'ca', 'gb', 'de', 'fr', 'au', 'br', 'jp'];

// The wide 467×181 capsule is crisper for exports; fall back to the 231×87 one.
async function getCapsule(appid, small) {
  const big = small ? small.replace(/capsule_231x87(\.\w+)/, 'capsule_467x181$1') : null;
  return firstExisting([big, `${CDN}steam/apps/${appid}/capsule_467x181.jpg`, small]);
}

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

export async function getGame(appid, cc = 'us') {
  if (!REGIONS.includes(cc)) cc = 'us';
  const details = await get(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=${cc}&l=english`);
  const entry = details?.[appid];
  if (!entry?.success) {
    const err = new Error('Steam has no store page for that app (it may be region-locked, delisted, or not a game).');
    err.status = 404;
    throw err;
  }
  const d = entry.data;

  const [library, capsule, reviews] = await Promise.all([
    getLibraryAssets(appid),
    getCapsule(appid, d.capsule_image),
    getReviewsFromStorePage(appid)
      .then((r) => (r.length ? r : getReviewsFromApi(appid)))
      .catch(() => getReviewsFromApi(appid)),
  ]);

  const trailers = (d.movies || []).map((m) => ({
    id: m.id,
    name: m.name,
    thumbnail: m.thumbnail,
    highlight: !!m.highlight,
    // Newer Steam trailers are HLS/DASH only; older API responses still had direct MP4s.
    hls: m.hls_h264 || null,
    mp4: m.mp4?.max || m.mp4?.['480'] || null,
  }));

  return {
    appid,
    name: d.name,
    type: d.type,
    storeUrl: `https://store.steampowered.com/app/${appid}/`,
    description: decodeEntities(d.short_description),
    releaseDate: d.release_date?.coming_soon ? `Coming soon${d.release_date.date ? ` (${d.release_date.date})` : ''}` : d.release_date?.date || '',
    developers: d.developers || [],
    publishers: d.publishers || [],
    reviews,
    region: cc,
    price: getPrice(d),
    images: {
      header: d.header_image || null,
      capsule: capsule || d.header_image || null,
      logo: library.logo,
      cover: library.cover,
      hero: library.hero,
      background: d.background_raw || d.background || null,
    },
    screenshots: (d.screenshots || []).map((s) => s.path_full),
    trailers,
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
