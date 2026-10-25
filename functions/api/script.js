// POST /api/script  { provider: 'builtin'|'anthropic'|'openai', model?, context, style, notes, seconds }
// Your own API key (if any) comes in the X-AI-Key header and is passed straight to that provider.
import { json } from '../../lib/http.js';
import { writeScript } from '../../lib/script.js';

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
    seconds: Math.min(600, Math.max(5, Math.round(Number(body.seconds) || 30))),
  };
  if (!input.context && !input.notes) return json(400, { error: 'Say what the video is about first.' });

  const opts = {
    provider: ['builtin', 'anthropic', 'openai'].includes(body.provider) ? body.provider : 'builtin',
    model: clip(body.model, 100),
    key: clip(request.headers.get('x-ai-key'), 400),
    env,
  };
  try {
    return json(200, await writeScript(opts, input));
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
