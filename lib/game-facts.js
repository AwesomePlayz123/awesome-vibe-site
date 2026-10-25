// Research for the Script Writer: real facts about a Steam game, so scripts don't have to guess.
// Store details (description, genres, features, developer, release, price), the store page's popular
// tags, the review score, and the most helpful English player reviews. Every part is best-effort:
// the store site sometimes blocks cloud servers, so Valve's Web API fills in what it can.
import { cachedJson } from './http.js';
import { getStoreItem } from './steam.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'birthtime=0; lastagecheckage=1-0-1900; wants_mature_content=1; Steam_Language=english',
};

async function get(url, text = false) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Steam ${res.status}`);
  return text ? res.text() : res.json();
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (s) =>
  String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const stripHtml = (html) =>
  decode(String(html || '').replace(/<(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '\n• ').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);
// Review text: drop BBCode tags, squash whitespace.
const cleanReview = (s) => decode(String(s || '').replace(/\[\/?[a-z0-9*]+(?:=[^\]]*)?\]/gi, '')).replace(/\s+/g, ' ').trim();

async function fromAppDetails(appid) {
  const j = await get(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=english`);
  const e = j?.[appid];
  if (!e?.success) throw new Error('no store page');
  const d = e.data;
  return {
    name: d.name,
    description: decode(d.short_description || ''),
    about: clip(stripHtml(d.about_the_game || d.detailed_description || ''), 1800),
    genres: (d.genres || []).map((g) => g.description),
    features: (d.categories || []).map((c) => c.description).filter((c) => !/Steam (Trading|Cloud|Achievements|Leaderboards)|Family Sharing|Stats|Remote Play|Captions|Commentary|Valve Anti-Cheat|Steam Workshop|In-App|Includes level editor|Steam Timeline/i.test(c)).slice(0, 8),
    developers: d.developers || [],
    publishers: d.publishers || [],
    released: d.release_date?.coming_soon ? `coming soon${d.release_date.date ? ` (${d.release_date.date})` : ''}` : d.release_date?.date || '',
    price: d.is_free ? 'Free to play' : d.price_overview?.final_formatted || '',
    discount: d.price_overview?.discount_percent || 0,
    metacritic: d.metacritic?.score || null,
  };
}

async function fromWebApi(appid) {
  const item = await getStoreItem(appid, 'us');
  if (!item?.name) throw new Error('no item');
  const bp = item.best_purchase_option;
  const rel = item.release?.steam_release_date;
  return {
    name: item.name,
    description: decode(item.basic_info?.short_description || ''),
    about: '',
    genres: [],
    features: [],
    developers: (item.basic_info?.developers || []).map((x) => x.name).filter(Boolean),
    publishers: (item.basic_info?.publishers || []).map((x) => x.name).filter(Boolean),
    released: rel ? new Date(rel * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
    price: item.is_free ? 'Free to play' : bp?.formatted_final_price || '',
    discount: bp?.discount_pct || 0,
    metacritic: null,
  };
}

// "Popular user-defined tags" only exist on the store page.
async function tagsFromStorePage(appid) {
  const html = await get(`https://store.steampowered.com/app/${appid}/?l=english`, true);
  return [...html.matchAll(/class="app_tag"[^>]*>\s*([^<]+?)\s*</g)].map((m) => decode(m[1])).filter((t) => t !== '+').slice(0, 12);
}

async function reviews(appid) {
  const j = await get(
    `https://store.steampowered.com/appreviews/${appid}?json=1&filter=all&language=english&purchase_type=all&num_per_page=20&review_type=all`
  );
  const s = j.query_summary || {};
  const pct = s.total_reviews ? Math.round((s.total_positive / s.total_reviews) * 100) : null;
  // Most helpful first (filter=all). Keep substantial ones, mostly positive with a critical one if there is one.
  const usable = (j.reviews || [])
    .map((r) => ({ up: r.voted_up, text: cleanReview(r.review), hours: Math.round((r.author?.playtime_at_review || r.author?.playtime_forever || 0) / 60), votes: r.votes_up || 0 }))
    .filter((r) => r.text.length >= 60 && !/^(.)\1+$/.test(r.text));
  const pos = usable.filter((r) => r.up).slice(0, 5);
  const neg = usable.filter((r) => !r.up).slice(0, 1);
  return {
    score: s.review_score_desc && s.total_reviews ? `${s.review_score_desc} (${pct}% of ${Number(s.total_reviews).toLocaleString('en-US')} reviews positive)` : '',
    picks: [...pos, ...neg].map((r) => ({ ...r, text: clip(r.text, 450) })),
  };
}

export async function getGameFacts(appid) {
  appid = String(appid).replace(/\D/g, '');
  if (!appid) throw new Error('bad app id');
  return cachedJson(`facts:v1:${appid}`, async () => {
    const [base, tags, rev] = await Promise.all([
      fromAppDetails(appid).catch(() => fromWebApi(appid)),
      tagsFromStorePage(appid).catch(() => []),
      reviews(appid).catch(() => ({ score: '', picks: [] })),
    ]);
    return { appid, ...base, tags, reviewScore: rev.score, reviews: rev.picks };
  }, (f) => f.reviews.length > 0 && f.tags.length > 0 && !!f.about); // only keep complete research for the day
}

// The facts as a block of text for the prompt.
export function factsToText(f) {
  const line = (label, v) => (v && (!Array.isArray(v) || v.length) ? `${label}: ${Array.isArray(v) ? v.join(', ') : v}` : null);
  const out = [
    line('Game', f.name),
    line('Steam description', f.description),
    line('Genres', f.genres),
    line('Popular player tags', f.tags),
    line('Modes and features', f.features),
    line('Developer', f.developers),
    f.publishers?.length && f.publishers.join() !== f.developers?.join() ? line('Publisher', f.publishers) : null,
    line('Released', f.released),
    line('Price', f.price ? `${f.price}${f.discount ? ` (${f.discount}% off right now)` : ''}` : ''),
    line('Steam reviews', f.reviewScore),
    f.metacritic ? `Metacritic: ${f.metacritic}` : null,
    f.about ? `About the game (from the store page):\n${f.about}` : null,
  ].filter(Boolean);
  if (f.reviews?.length) {
    out.push(
      'What players say (most helpful Steam reviews; paraphrase, never quote or name reviewers):\n' +
        f.reviews.map((r) => `- ${r.up ? '👍' : '👎'}${r.hours ? ` ${r.hours}h played` : ''}: ${r.text}`).join('\n')
    );
  }
  return out.join('\n');
}
