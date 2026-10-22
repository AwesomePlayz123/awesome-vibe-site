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

export function attachment(name) {
  const ascii = name.replace(/[^\w.\- ]+/g, '_').trim() || 'download';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
