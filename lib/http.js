// Small helpers shared by the Pages Functions (and the local dev server, which runs the same functions).

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function safeName(s, fallback = 'file') {
  return (
    String(s || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || fallback
  ).slice(0, 150);
}

// Cache an upstream JSON result for a day at Cloudflare's edge (no-op when running locally).
// keep(data) can say no, e.g. for a partial result that's worth retrying sooner.
export async function cachedJson(cacheId, load, keep = () => true) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(`https://api-cache.local/${encodeURIComponent(cacheId)}`);
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit.json();
  }
  const data = await load();
  if (cache && keep(data)) {
    await cache.put(
      key,
      new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } })
    );
  }
  return data;
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function attachment(name) {
  const ascii = name.replace(/[^\w.\- ]+/g, '_').trim() || 'download';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
