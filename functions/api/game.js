// GET /api/game?url=<steam store link or app id>
import { getGame, parseAppId } from '../../lib/steam.js';
import { json } from '../../lib/http.js';

export async function onRequestGet({ request }) {
  const url = new URL(request.url).searchParams.get('url');
  const appid = parseAppId(url);
  if (!appid) {
    return json(400, {
      error: "That doesn't look like a Steam store link. Try something like https://store.steampowered.com/app/548430/",
    });
  }
  try {
    return json(200, await getGame(appid));
  } catch (e) {
    return json(e.status || 502, { error: e.message || 'Could not reach Steam.' });
  }
}
