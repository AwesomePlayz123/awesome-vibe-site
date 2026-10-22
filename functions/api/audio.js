// GET /api/audio?q=<keywords>&kind=sfx|music&offset=0
//   sfx   → Freesound, public-domain (CC0) sounds only: free for commercial use, no credit needed.
//   music → Jamendo, only tracks whose Creative Commons license allows commercial use AND use in a video
//           (no "NC" and no "ND" — syncing music to video counts as an adaptation). These need a credit line.
// Secrets: FREESOUND_API_KEY ("Client secret/Api key" from freesound.org/apiv2/apply) and JAMENDO_CLIENT_ID.
import { json, cachedJson, httpError } from '../../lib/http.js';

const PAGE = 10;

async function searchFreesound(q, key) {
  const params = new URLSearchParams({
    query: q,
    filter: 'license:"Creative Commons 0"',
    sort: 'score',
    fields: 'id,name,duration,previews,images,username,url,tags,license',
    page_size: '150',
  });
  const data = await cachedJson(`freesound:${params}`, async () => {
    // Freesound's current search endpoint, with the older text-search path as a fallback.
    let res;
    for (const path of ['search/', 'search/text/']) {
      res = await fetch(`https://freesound.org/apiv2/${path}?${params}`, { headers: { Authorization: `Token ${key}` } });
      if (res.status !== 404) break;
    }
    if (res.status === 401 || res.status === 403) throw httpError(503, 'Freesound rejected the API key. Check the FREESOUND_API_KEY secret in Cloudflare.');
    if (res.status === 429) throw httpError(429, 'Freesound rate limit hit — wait a minute and try again.');
    if (!res.ok) throw httpError(502, `Freesound returned ${res.status}`);
    return res.json();
  });

  return (data.results || [])
    .filter((s) => s.previews?.['preview-hq-mp3'])
    .map((s) => ({
      id: `fs-${s.id}`,
      title: s.name.replace(/\.(wav|mp3|ogg|flac|aiff?)$/i, ''),
      author: s.username,
      duration: s.duration,
      preview: s.previews['preview-hq-mp3'],
      download: s.previews['preview-hq-mp3'],
      ext: 'mp3',
      waveform: s.images?.waveform_m || null,
      image: null,
      pageURL: s.url,
      license: 'CC0 (public domain)',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      credit: null,
      source: 'Freesound',
    }));
}

function ccName(url = '') {
  const m = url.match(/licenses\/([a-z-]+)\/(\d\.\d)/i);
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`;
  if (/publicdomain\/zero/i.test(url)) return 'CC0';
  return 'Creative Commons';
}

async function searchJamendo(q, clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    limit: '200',
    search: q,
    order: 'relevance',
    include: 'licenses',
    audioformat: 'mp32',
    audiodlformat: 'mp32',
  });
  const data = await cachedJson(`jamendo:${params}`, async () => {
    const res = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`);
    if (!res.ok) throw httpError(502, `Jamendo returned ${res.status}`);
    const body = await res.json();
    if (body.headers?.status === 'failed') {
      const msg = body.headers.error_message || 'Jamendo search failed.';
      throw httpError(/client|credential|auth/i.test(msg) ? 503 : 502, /client|credential|auth/i.test(msg)
        ? 'Jamendo rejected the client ID. Check the JAMENDO_CLIENT_ID secret in Cloudflare.'
        : msg);
    }
    return body;
  });

  return (data.results || [])
    .filter((t) => {
      const lic = t.license_ccurl || '';
      return t.audiodownload_allowed && t.audiodownload && /creativecommons\.org/i.test(lic) && !/-nc|-nd|\/nc|\/nd/i.test(lic);
    })
    .map((t) => {
      const license = ccName(t.license_ccurl);
      return {
        id: `jm-${t.id}`,
        title: t.name,
        author: t.artist_name,
        duration: t.duration,
        preview: t.audio,
        download: t.audiodownload,
        ext: 'mp3',
        waveform: null,
        image: t.album_image || t.image || null,
        pageURL: t.shareurl,
        license,
        licenseUrl: t.license_ccurl,
        credit: `Music: "${t.name}" by ${t.artist_name} (${t.shareurl}), licensed under ${license} (${t.license_ccurl})`,
        source: 'Jamendo',
      };
    });
}

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const q = (p.get('q') || '').trim().slice(0, 100);
  const kind = p.get('kind') === 'music' ? 'music' : 'sfx';
  const offset = Math.max(0, Math.min(190, Number(p.get('offset')) || 0));
  if (!q) return json(400, { error: 'Type a keyword to search for.' });

  const keyName = kind === 'sfx' ? 'FREESOUND_API_KEY' : 'JAMENDO_CLIENT_ID';
  const key = env?.[keyName];
  if (!key) {
    return json(503, {
      error: `The ${kind === 'sfx' ? 'Freesound API key' : 'Jamendo client ID'} isn’t set up yet. Add a secret named ${keyName} in Cloudflare (project → Settings → Variables and Secrets), then redeploy.`,
      code: 'NO_KEY',
    });
  }

  let items;
  try {
    items = kind === 'sfx' ? await searchFreesound(q, key) : await searchJamendo(q, key);
  } catch (e) {
    return json(e.status || 502, { error: e.message || 'Search failed.' });
  }
  return json(200, {
    query: q,
    kind,
    total: items.length,
    offset,
    results: items.slice(offset, offset + PAGE),
    hasMore: offset + PAGE < items.length,
  });
}
