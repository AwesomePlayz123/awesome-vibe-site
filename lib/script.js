// Script writer: builds the prompt and talks to whichever AI is chosen.
//   builtin   → Cloudflare Workers AI (the "AI" binding on the Pages project; free daily allowance, no key)
//   anthropic → Claude, with the user's own API key
//   openai    → ChatGPT, with the user's own API key
// Keys arrive with each request and are passed straight to the provider. They're never stored or logged here.
import { httpError } from './http.js';

// Natural Shorts voiceover pace: ~155 words a minute.
export const WORDS_PER_SECOND = 2.6;
export const targetWords = (seconds) => Math.max(15, Math.round(seconds * WORDS_PER_SECOND));
export const countWords = (s) => (String(s).match(/[\p{L}\p{N}'’-]+/gu) || []).length;

export const DEFAULT_MODELS = {
  builtin: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct-fp8'],
  anthropic: 'claude-haiku-5-5',
  openai: 'gpt-5.4-mini',
};

export function buildPrompt({ context, style, notes, seconds, guide }) {
  const words = targetWords(seconds);
  const lengthRule = `Length: about ${words} words in total (it has to fit ${seconds} seconds read aloud). Stay within 10% of that.`;
  const outputRule =
    'Output only the words that will be spoken: no title, no headings or section labels, no stage directions, no [brackets], no emojis, no hashtags, no quotation marks around the script. Separate parts with a blank line.';

  let system;
  if (guide) {
    // The creator's saved style is the main brief. Length and clean output still apply on top of it.
    system = [
      'You write voiceover scripts for short vertical videos. Follow the creator’s instructions below exactly: their structure, voice and rules come first.',
      '',
      '=== Creator’s instructions ===',
      guide,
      '=== End of instructions ===',
      '',
      'Also:',
      `- ${lengthRule} Size each part of their structure to fit that total.`,
      `- ${outputRule} (If the instructions explicitly ask for labels, use them.)`,
      '- Sound like a real person talking, never like an AI. Avoid clichés such as "dive in", "delve", "game-changer", "buckle up".',
      '- Use only facts from the details given; if a detail is missing, keep it general instead of inventing specifics.',
    ].join('\n');
  } else {
    system = [
      'You write voiceover scripts for YouTube Shorts and other short vertical videos.',
      'Write exactly what the creator will say out loud, as one continuous script.',
      'Rules:',
      '- Open with a hook in the first sentence that makes people stop scrolling. No greetings, no "Hey guys", no "In this video".',
      '- Sound like a real person talking: contractions, short punchy sentences, natural rhythm. Avoid stiff or corporate phrasing and AI clichés ("dive in", "delve", "game-changer", "buckle up", "whether you\'re", "in today\'s world").',
      '- Match the requested style closely.',
      `- ${lengthRule}`,
      `- ${outputRule}`,
      '- Use only facts from the details given; if a detail is missing, keep it general instead of inventing specifics.',
    ].join('\n');
  }
  const user = [
    `What the video is: ${context || 'a short video'}`,
    style ? `Style: ${style}` : null,
    notes ? `Details to work with:\n${notes}` : null,
    `Length: ${seconds} seconds (about ${words} words).`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { system, user, words };
}

// Strip things models add despite instructions: wrapping quotes, "Script:" labels, markdown, stage directions.
export function cleanScript(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```[a-z]*\n?|\n?```$/g, '');
  s = s.replace(/^(?:\*\*)?(?:here(?:'|’)s|here is)[^\n]*:\s*\n+/i, '');
  s = s.replace(/^(?:\*\*)?(?:script|voiceover|title)(?:\*\*)?\s*:\s*/i, '');
  s = s.replace(/^\s*\[[^\]\n]*\]\s*$/gm, '').replace(/^\s*\([^)\n]*\)\s*$/gm, '');
  s = s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$)/g, '$1$2');
  s = s.trim().replace(/^["“](.*)["”]$/s, '$1');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

async function readError(res, who) {
  let msg = '';
  try {
    const j = await res.json();
    msg = j?.error?.message || j?.error || j?.message || '';
  } catch {}
  if (res.status === 401 || res.status === 403) return httpError(401, `${who} rejected the API key. Check it in AI settings.`);
  if (res.status === 404) return httpError(400, `${who} doesn't know that model${msg ? `: ${msg}` : ''}. Check the model name in AI settings.`);
  if (res.status === 429) return httpError(429, `${who} says you've hit a rate or spending limit. Try again in a minute, or check your plan.`);
  return httpError(502, `${who} returned an error (${res.status})${msg ? `: ${msg}` : ''}`);
}

async function callBuiltin(env, system, user) {
  if (!env.AI || typeof env.AI.run !== 'function') {
    throw httpError(503, 'BUILTIN_OFF');
  }
  let lastErr;
  for (const model of DEFAULT_MODELS.builtin) {
    try {
      const out = await env.AI.run(model, {
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: 900,
        temperature: 0.85,
      });
      const text = typeof out === 'string' ? out : out?.response ?? out?.result?.response;
      if (text) return { text, model };
    } catch (e) {
      lastErr = e;
    }
  }
  const msg = String(lastErr?.message || lastErr || '');
  if (/daily|limit|neuron|quota|429/i.test(msg)) throw httpError(429, 'The built-in AI has used up today’s free allowance. Try again tomorrow, or switch to your own AI key in AI settings.');
  throw httpError(502, `The built-in AI didn't answer${msg ? `: ${msg}` : ''}`);
}

async function callAnthropic(key, model, system, user) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 1024, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw await readError(res, 'Claude');
  const j = await res.json();
  return { text: (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n'), model };
}

async function callOpenAI(key, model, system, user) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_completion_tokens: 4000, // newer models spend some of this thinking before they write
    }),
  });
  if (!res.ok) throw await readError(res, 'ChatGPT');
  const j = await res.json();
  return { text: j.choices?.[0]?.message?.content || '', model };
}

export async function askAI({ provider, model, key, env }, system, user) {
  if (provider === 'builtin') return callBuiltin(env, system, user);
  if (!key) throw httpError(400, 'Add your API key in AI settings, or switch to Built-in AI.');
  if (provider === 'anthropic') return callAnthropic(key, model || DEFAULT_MODELS.anthropic, system, user);
  if (provider === 'openai') return callOpenAI(key, model || DEFAULT_MODELS.openai, system, user);
  throw httpError(400, 'Unknown AI choice.');
}

export async function writeScript(opts, input) {
  const { system, user, words } = buildPrompt(input);
  let { text, model } = await askAI(opts, system, user);
  let script = cleanScript(text);
  if (!script) throw httpError(502, 'The AI sent back an empty script. Try again.');

  // Models are loose with length. One correction pass if it's well off the target.
  const n = countWords(script);
  if (Math.abs(n - words) / words > 0.25) {
    const fix = `${user}\n\nHere is a draft that's ${n} words, but it needs to be about ${words} words to fit ${input.seconds} seconds. ${
      n > words ? 'Cut it down' : 'Expand it'
    } to about ${words} words. Keep the voice, the hook and the best lines. Output only the revised script.\n\nDraft:\n${script}`;
    try {
      const again = cleanScript((await askAI(opts, system, fix)).text);
      if (again && Math.abs(countWords(again) - words) < Math.abs(n - words)) script = again;
    } catch {
      /* keep the first draft */
    }
  }
  return { script, words: countWords(script), target: words, model };
}
