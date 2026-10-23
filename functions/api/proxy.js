// GET /api/proxy?url=<allowed url>
// Same-origin pass-through used by the Steam Case, Price and Review tools for Steam and SteamGridDB.
// Only the hosts below are allowed. An Authorization header (the user's SteamGridDB key) is forwarded
// to SteamGridDB only, never anywhere else.
import { json } from '../../lib/http.js';

const ALLOWED = [
  'https://store.steampowered.com/api/',
  'https://store.steampowered.com/appreviews/',
  'https://api.steampowered.com/',
  'https://www.steamgriddb.com/api/',
  'https://cdn2.steamgriddb.com/',
];
const ALLOWED_HOST = (h) => h.endsWith('.steamstatic.com');
const PASS = ['content-type', 'content-length', 'last-modified', 'etag'];

export async function onRequestGet({ request }) {
  const target = new URL(request.url).searchParams.get('url') || '';
  let u;
  try {
    u = new URL(target);
  } catch {
    return json(400, { error: 'Missing or invalid url.' });
  }
  if (u.protocol !== 'https:' || !(ALLOWED.some((p) => target.startsWith(p)) || ALLOWED_HOST(u.hostname))) {
    return json(400, { error: 'That address isn’t allowed through this proxy.' });
  }

  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
  const auth = request.headers.get('authorization');
  if (auth && u.hostname === 'www.steamgriddb.com') headers.Authorization = auth;

  let res;
  try {
    res = await fetch(u.href, { headers, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    return json(502, { error: `Couldn’t reach ${u.hostname}.` });
  }
  const out = new Headers();
  for (const h of PASS) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  // Images can be cached for a day; API answers briefly (prices change).
  out.set('Cache-Control', /^image\//.test(res.headers.get('content-type') || '') ? 'public, max-age=86400' : 'public, max-age=300');
  return new Response(res.body, { status: res.status, headers: out });
}
