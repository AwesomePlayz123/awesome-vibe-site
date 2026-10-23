// GET /api/youtube?links=<YouTube video and/or channel links, newline separated>
// Keyless data for the Thumbnail Viewer:
//   • videos   → YouTube's public oEmbed (title, channel), plus views/date when the video is in its channel's feed
//   • channels → the channel's public RSS feed (latest uploads with views and dates), Shorts left out
// Channel names/avatars come from the channel page's link-preview tags (the same info chat apps show).
import { json, cachedJson } from '../../lib/http.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1; SOCS=CAI' };
const MAX_LINKS = 20;

const decode = (s = '') =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

/** Work out what a pasted line points at. */
export function parseLink(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let m = s.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/)([\w-]{11})(?![\w-])/);
  if (m) return { kind: 'video', id: m[1] };
  m = s.match(/\/channel\/(UC[\w-]{22})/) || s.match(/^(UC[\w-]{22})$/);
  if (m) return { kind: 'channel', path: `channel/${m[1]}`, channelId: m[1] };
  m = s.match(/(?:youtube\.com\/|^)(@[\w.\-·]+)/i);
  if (m) return { kind: 'channel', path: m[1] };
  m = s.match(/youtube\.com\/(c|user)\/([\w.\-]+)/i);
  if (m) return { kind: 'channel', path: `${m[1]}/${m[2]}` };
  if (/^[\w-]{11}$/.test(s)) return { kind: 'video', id: s };
  return null;
}

async function getText(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw Object.assign(new Error(`YouTube returned ${res.status}`), { status: res.status });
  return res.text();
}

function meta(html, key) {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const k = tag.match(/\b(?:property|name|itemprop)\s*=\s*"([^"]+)"/i)?.[1];
    if (k && k.toLowerCase() === key) return decode(tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] || '');
  }
  return null;
}

/** Channel id, name and avatar from a channel page's link-preview tags. Cached for a day. */
function channelInfo(path) {
  return cachedJson(`yt-channel:${path.toLowerCase()}`, async () => {
    const html = (await getText(`https://www.youtube.com/${path}`)).slice(0, 800000);
    const id =
      html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ||
      meta(html, 'og:url')?.match(/channel\/(UC[\w-]{22})/)?.[1] ||
      html.match(/"(?:externalId|browseId|channelId)":"(UC[\w-]{22})"/)?.[1] ||
      null;
    if (!id) throw new Error('couldn’t find that channel');
    return { id, name: meta(html, 'og:title'), avatar: meta(html, 'og:image') };
  });
}

/** A channel's latest uploads from its public RSS feed. Cached for an hour by the edge. */
function channelFeed(channelId) {
  return cachedJson(`yt-feed:${channelId}`, async () => {
    const xml = await getText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    const author = decode(xml.match(/<author>\s*<name>([^<]*)<\/name>/)?.[1] || '');
    const entries = xml.split('<entry>').slice(1);
    return {
      author,
      videos: entries.map((e) => {
        const id = e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
        const link = e.match(/<link rel="alternate" href="([^"]+)"/)?.[1] || '';
        return {
          id,
          title: decode(e.match(/<title>([^<]*)<\/title>/)?.[1] || ''),
          published: e.match(/<published>([^<]+)<\/published>/)?.[1] || null,
          views: Number(e.match(/<media:statistics views="(\d+)"/)?.[1] ?? NaN),
          short: /\/shorts\//.test(link),
        };
      }).filter((v) => v.id),
    };
  });
}

const thumbs = (id) => ({ thumb: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, fallback: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` });

async function fromChannel(link) {
  const info = link.channelId
    ? await channelInfo(link.path).catch(() => ({ id: link.channelId, name: null, avatar: null }))
    : await channelInfo(link.path);
  const feed = await channelFeed(info.id);
  return feed.videos
    .filter((v) => !v.short)
    .map((v) => ({
      id: v.id,
      title: v.title,
      channel: info.name || feed.author,
      avatar: info.avatar,
      views: Number.isFinite(v.views) ? v.views : null,
      published: v.published,
      from: 'channel',
      ...thumbs(v.id),
    }));
}

async function fromVideo(link) {
  const o = await cachedJson(`yt-oembed:${link.id}`, async () => {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${link.id}`)}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401 || res.status === 403) throw new Error('that video can’t be embedded or is private');
    if (!res.ok) throw new Error(res.status === 404 || res.status === 400 ? 'video not found' : `YouTube returned ${res.status}`);
    return res.json();
  });
  const item = {
    id: link.id,
    title: o.title,
    channel: o.author_name,
    avatar: null,
    views: null,
    published: null,
    from: 'video',
    ...thumbs(link.id),
  };
  // Views and upload date: available if the video is among its channel's latest uploads.
  const path = (o.author_url || '').match(/youtube\.com\/((?:@|channel\/|c\/|user\/)[^/?#]+)/)?.[1];
  if (path) {
    try {
      const info = await channelInfo(path);
      item.avatar = info.avatar;
      const hit = (await channelFeed(info.id)).videos.find((v) => v.id === link.id);
      if (hit) {
        item.views = Number.isFinite(hit.views) ? hit.views : null;
        item.published = hit.published;
      }
    } catch {
      /* the extra details are optional */
    }
  }
  return [item];
}

export async function onRequestGet({ request }) {
  const raw = new URL(request.url).searchParams.get('links') || '';
  const lines = [...new Set(raw.split(/[\n,\s]+/).map((l) => l.trim()).filter(Boolean))].slice(0, MAX_LINKS);
  if (!lines.length) return json(400, { error: 'Paste at least one YouTube video or channel link.' });

  const results = await Promise.all(
    lines.map(async (line) => {
      const link = parseLink(line);
      if (!link) return { line, error: 'not a YouTube video or channel link' };
      try {
        return { line, kind: link.kind, items: link.kind === 'video' ? await fromVideo(link) : await fromChannel(link) };
      } catch (e) {
        return { line, error: e.message || 'couldn’t load' };
      }
    })
  );

  return json(200, {
    sources: results.map(({ line, kind, items, error }) => ({ line, kind: kind || null, count: items ? items.length : 0, error: error || null })),
    items: results.flatMap((r) => r.items || []),
  });
}
