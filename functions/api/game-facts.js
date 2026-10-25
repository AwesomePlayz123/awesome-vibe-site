// GET /api/game-facts?app=548430
// What the Script Writer knows about a game (shown on the page so you can check it before writing).
import { json } from '../../lib/http.js';
import { parseAppId } from '../../lib/steam.js';
import { getGameFacts, factsToText } from '../../lib/game-facts.js';

export async function onRequestGet({ request }) {
  const appid = parseAppId(new URL(request.url).searchParams.get('app'));
  if (!appid) return json(400, { error: 'Pick a game or paste a Steam store link.' });
  try {
    const facts = await getGameFacts(appid);
    return json(200, { ...facts, text: factsToText(facts) });
  } catch (e) {
    return json(502, { error: 'Couldn’t reach Steam to research that game. Try again in a moment.' });
  }
}
