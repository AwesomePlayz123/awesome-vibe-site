// GET /api/steam-art?app=<appid>&need=logo,cover,hero
// Second, slower pass for library art the quick lookup in /api/game couldn't find. The page calls this after
// showing the game, so everything else appears straight away.
import { json } from '../../lib/http.js';
import { getMissingArt } from '../../lib/steam.js';

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  const appid = (q.get('app') || '').replace(/\D/g, '');
  if (!appid) return json(400, { error: 'Missing app id.' });
  const need = (q.get('need') || 'logo').split(',').map((s) => s.trim()).filter(Boolean);
  try {
    return json(200, await getMissingArt(appid, need));
  } catch (e) {
    return json(502, { error: e.message || 'Lookup failed.' });
  }
}
