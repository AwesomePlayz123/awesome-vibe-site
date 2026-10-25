// POST /api/script  { provider: 'builtin'|'anthropic'|'openai', model?, context, style, notes, seconds, guide?, appid? }
// guide = a saved style (the creator's own instructions), used as the AI's main brief.
// appid = a Steam game to research first (store details, tags, review score, top player reviews).
// Your own API key (if any) comes in the X-AI-Key header and is passed straight to that provider.
import { json } from '../../lib/http.js';
import { writeScript } from '../../lib/script.js';
import { getGameFacts, factsToText } from '../../lib/game-facts.js';

const clip = (s, n) => String(s || '').trim().slice(0, n);

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Bad request.' });
  }
  const input = {
    context: clip(body.context, 200),
    style: clip(body.style, 300),
    notes: clip(body.notes, 3000),
    guide: clip(body.guide, 8000),
    seconds: Math.min(600, Math.max(5, Math.round(Number(body.seconds) || 30))),
  };
  const appid = String(body.appid || '').replace(/\D/g, '').slice(0, 10);
  if (!input.context && !input.notes && !appid) return json(400, { error: 'Say what the video is about first.' });

  // Research the game. If Steam can't be reached, still write the script and say so.
  let research = null;
  if (appid) {
    try {
      const f = await getGameFacts(appid);
      input.facts = factsToText(f);
      research = { ok: true, appid, name: f.name, reviews: f.reviews.length, tags: f.tags.length, score: f.reviewScore };
    } catch (e) {
      research = { ok: false, appid, error: 'Couldn’t reach Steam to research the game, so this script only uses what you typed.' };
    }
  }

  const opts = {
    provider: ['builtin', 'anthropic', 'openai'].includes(body.provider) ? body.provider : 'builtin',
    model: clip(body.model, 100),
    key: clip(request.headers.get('x-ai-key'), 400),
    env,
  };
  try {
    return json(200, { ...(await writeScript(opts, input)), research });
  } catch (e) {
    if (e.message === 'BUILTIN_OFF') {
      return json(503, {
        error: 'The built-in AI isn’t switched on for this site yet.',
        code: 'builtin_off',
      });
    }
    return json(e.status || 500, { error: e.message || 'Something went wrong.' });
  }
}
