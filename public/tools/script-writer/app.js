// Script writer: form → /api/script → editable script with a live word count and read time.
const $ = (id) => document.getElementById(id);
const WPS = 2.6; // ~155 words a minute, a natural Shorts voiceover pace (same as the server)
const countWords = (s) => (String(s).match(/[\p{L}\p{N}'’-]+/gu) || []).length;
const targetWords = (sec) => Math.max(15, Math.round(sec * WPS));

const DEFAULT_MODELS = { anthropic: 'claude-haiku-5-5', openai: 'gpt-5.4-mini', gemini: 'gemini-3.8-flash' };
const NAMES = { anthropic: 'Claude', openai: 'ChatGPT', gemini: 'Gemini' };
const KEY_HELP = {
  anthropic: 'Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> → API keys. Usage is billed to your Anthropic account (a script costs a fraction of a cent).',
  gemini: 'Free: get one at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> with your Google account, no card needed. On the free tier, Google may use what you send to improve its products.',
  openai: 'Get one at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com</a> → API keys. Usage is billed to your OpenAI account (a script costs a fraction of a cent).',
};

/* ---------------- Saved settings (this browser only) ---------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('script.' + k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { v === null ? localStorage.removeItem('script.' + k) : localStorage.setItem('script.' + k, v); } catch {} },
};

let mode = store.get('mode', 'builtin');
let seconds = Number(store.get('seconds', 30)) || 30;
for (const id of ['context', 'notes', 'style']) {
  $(id).value = store.get('in.' + id, '');
  $(id).addEventListener('input', () => store.set('in.' + id, $(id).value));
}
$('provider').value = store.get('provider', 'anthropic');
$('rememberKey').checked = store.get('remember', '1') === '1';

function loadProvider() {
  const p = $('provider').value;
  $('model').value = store.get('model.' + p, DEFAULT_MODELS[p]);
  $('apiKey').value = store.get('key.' + p, '');
  $('keyHelp').innerHTML = KEY_HELP[p];
}
loadProvider();

function renderMode() {
  document.querySelectorAll('#aiMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === mode)));
  $('ownFields').hidden = mode !== 'own';
  $('builtinNote').hidden = mode !== 'builtin';
  $('aiNow').textContent = mode === 'builtin' ? 'Built-in AI' : NAMES[$('provider').value];
}
renderMode();

document.querySelectorAll('#aiMode button').forEach((b) =>
  b.addEventListener('click', () => {
    mode = b.dataset.v;
    store.set('mode', mode);
    renderMode();
    if (mode === 'own' && !$('apiKey').value) $('apiKey').focus();
  })
);
$('provider').addEventListener('change', () => {
  store.set('provider', $('provider').value);
  loadProvider();
  renderMode();
});
$('model').addEventListener('input', () => store.set('model.' + $('provider').value, $('model').value.trim() || null));
function saveKey() {
  const p = $('provider').value;
  store.set('key.' + p, $('rememberKey').checked && $('apiKey').value.trim() ? $('apiKey').value.trim() : null);
}
$('apiKey').addEventListener('input', saveKey);
$('rememberKey').addEventListener('change', () => {
  store.set('remember', $('rememberKey').checked ? '1' : '0');
  if (!$('rememberKey').checked) for (const p of Object.keys(DEFAULT_MODELS)) store.set('key.' + p, null);
  else saveKey();
});
$('showKey').addEventListener('click', () => {
  const show = $('apiKey').type === 'password';
  $('apiKey').type = show ? 'text' : 'password';
  $('showKey').textContent = show ? 'Hide' : 'Show';
});
// Open the settings automatically the first time someone picks their own AI without a key.
if (mode === 'own' && !$('apiKey').value) $('aiSettings').open = true;

/* ---------------- Game (researched on Steam) ---------------- */
let game = null; // { id, name, image }
try { game = JSON.parse(store.get('game', 'null')); } catch { game = null; }
const parseAppId = (s) => { s = String(s || '').trim(); if (/^\d{2,10}$/.test(s)) return s; const m = s.match(/\/app\/(\d+)/i); return m ? m[1] : null; };
const capsule = (id) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/capsule_231x87.jpg`;

const gi = $('game'), gr = $('gameResults');
let searchTimer = 0, searchSeq = 0, active = -1, results = [];
function closeResults() { gr.hidden = true; gi.setAttribute('aria-expanded', 'false'); active = -1; }
function showResults(items, note) {
  results = items;
  gr.innerHTML = '';
  if (note) { const li = document.createElement('li'); li.className = 'gr-note'; li.textContent = note; gr.appendChild(li); }
  items.forEach((it, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.id = 'gr' + i;
    li.innerHTML = '<img alt=""><span class="gr-name"></span>';
    li.querySelector('img').src = it.image || capsule(it.id);
    li.querySelector('img').onerror = function () { this.style.visibility = 'hidden'; };
    li.querySelector('.gr-name').textContent = it.name;
    li.addEventListener('mousedown', (e) => { e.preventDefault(); pickGame(it); });
    gr.appendChild(li);
  });
  gr.hidden = !items.length && !note;
  gi.setAttribute('aria-expanded', String(!gr.hidden));
}
function highlight(i) {
  active = i;
  [...gr.querySelectorAll('li[role=option]')].forEach((li, k) => li.classList.toggle('active', k === i));
  gi.setAttribute('aria-activedescendant', i >= 0 ? 'gr' + i : '');
}
gi.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = gi.value.trim();
  const id = parseAppId(q);
  if (id && /\/app\//i.test(q)) { pickGame({ id, name: '', image: '' }); return; }
  if (q.length < 2) { closeResults(); return; }
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    try {
      const res = await fetch('/api/steam-search?q=' + encodeURIComponent(q) + '&cc=us');
      const d = await res.json();
      if (seq !== searchSeq) return;
      if (!res.ok) throw new Error(d.error);
      showResults(d.items || [], d.items?.length ? '' : 'No games found. You can also paste a Steam store link.');
      highlight(-1);
    } catch (e) {
      if (seq === searchSeq) showResults([], e.message || 'Steam search isn’t reachable right now. You can paste a Steam store link.');
    }
  }, 250);
});
gi.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); highlight(Math.min(results.length - 1, active + 1)); }
  else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); highlight(Math.max(0, active - 1)); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (active >= 0 && results[active]) pickGame(results[active]);
    else if (results.length === 1) pickGame(results[0]);
    else if (parseAppId(gi.value)) pickGame({ id: parseAppId(gi.value), name: '', image: '' });
  } else if (e.key === 'Escape') closeResults();
});
gi.addEventListener('blur', () => setTimeout(closeResults, 120));

let factsSeq = 0;
async function loadFacts() {
  const seq = ++factsSeq;
  $('gameInfo').textContent = 'Researching on Steam…';
  $('gameInfo').className = '';
  $('factsBox').hidden = true;
  try {
    const res = await fetch('/api/game-facts?app=' + game.id);
    const d = await res.json();
    if (seq !== factsSeq) return;
    if (!res.ok) throw new Error(d.error);
    if (d.name && d.name !== game.name) { game.name = d.name; $('gameName').textContent = d.name; store.set('game', JSON.stringify(game)); }
    const bits = [d.reviewScore ? d.reviewScore.replace(/\s*\(.*\)$/, '') : '', d.reviews?.length ? `${d.reviews.length} player reviews` : '', d.tags?.length ? `${d.tags.length} tags` : ''].filter(Boolean);
    $('gameInfo').textContent = 'Researched' + (bits.length ? ': ' + bits.join(' · ') : '');
    $('gameInfo').className = 'ok';
    $('factsText').textContent = d.text;
    $('factsBox').hidden = false;
  } catch (e) {
    if (seq !== factsSeq) return;
    $('gameInfo').textContent = e.message || 'Couldn’t research this game right now. It will try again when you write.';
    $('gameInfo').className = 'err';
  }
}
function renderGame() {
  $('gameCard').hidden = !game;
  gi.parentElement.hidden = !!game;
  $('factsBox').hidden = true;
  if (!game) return;
  $('gameName').textContent = game.name || `Steam app ${game.id}`;
  $('gameImg').src = game.image || capsule(game.id);
  $('gameImg').onerror = function () { this.style.visibility = 'hidden'; };
  loadFacts();
}
function pickGame(it) {
  game = { id: String(it.id), name: it.name || '', image: it.image || '' };
  store.set('game', JSON.stringify(game));
  gi.value = '';
  closeResults();
  renderGame();
}
$('gameClear').addEventListener('click', () => {
  game = null;
  store.set('game', null);
  renderGame();
  gi.focus();
});
renderGame();

/* ---------------- Saved styles (popup) ---------------- */
let presets = [];
try { presets = JSON.parse(store.get('presets', '[]')) || []; } catch { presets = []; }
const savePresets = () => store.set('presets', JSON.stringify(presets));
const presetById = (id) => presets.find((p) => p.id === id);

function fillPresetSelect() {
  const sel = $('preset');
  const keep = store.get('preset', '');
  sel.innerHTML = '<option value="">None</option>';
  for (const p of presets) sel.add(new Option(p.name, p.id));
  sel.value = presetById(keep) ? keep : '';
  presetHint();
}
function presetHint() {
  const p = presetById($('preset').value);
  $('presetHint').textContent = p
    ? `The AI follows “${p.name}” first. Style notes and details add to it.`
    : presets.length ? 'Pick a saved style, or leave it on None.' : 'Save your own script format and voice once, then pick it here.';
}
$('preset').addEventListener('change', () => { store.set('preset', $('preset').value); presetHint(); });

const dlg = $('presetDialog');
let editing = null; // id of the style open in the editor, or null for a new one
const pmsg = (t, k) => { $('presetMsg').textContent = t || ''; $('presetMsg').className = 'pd-msg' + (k ? ' ' + k : ''); };
function renderPresetList() {
  const ul = $('presetList');
  ul.innerHTML = '';
  if (!presets.length) { ul.innerHTML = '<li class="empty-note">No saved styles yet.</li>'; }
  for (const p of presets) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.name;
    b.setAttribute('aria-current', String(p.id === editing));
    b.addEventListener('click', () => openEditor(p.id));
    li.appendChild(b);
    ul.appendChild(li);
  }
  $('presetDelete').hidden = !editing;
}
function openEditor(id) {
  editing = id && presetById(id) ? id : null;
  const p = presetById(editing);
  $('presetName').value = p ? p.name : '';
  $('presetText').value = p ? p.text : '';
  pmsg('');
  renderPresetList();
  (p ? $('presetText') : $('presetName')).focus();
}
$('editPresets').addEventListener('click', () => {
  dlg.showModal();
  openEditor($('preset').value || presets[0]?.id || null);
});
$('presetNew').addEventListener('click', () => openEditor(null));
$('presetSave').addEventListener('click', () => {
  const name = $('presetName').value.trim();
  const text = $('presetText').value.trim();
  if (!name) { pmsg('Give the style a name.', 'err'); $('presetName').focus(); return; }
  if (!text) { pmsg('Paste the instructions for the AI.', 'err'); $('presetText').focus(); return; }
  let p = presetById(editing);
  if (p) Object.assign(p, { name, text });
  else { p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, text }; presets.push(p); editing = p.id; }
  savePresets();
  store.set('preset', p.id); // pick the style you just saved
  fillPresetSelect();
  renderPresetList();
  pmsg('Saved. It’s selected for your next script.', 'ok');
});
$('presetDelete').addEventListener('click', () => {
  const p = presetById(editing);
  if (!p) return;
  presets = presets.filter((x) => x.id !== p.id);
  savePresets();
  if (store.get('preset', '') === p.id) store.set('preset', presets[0]?.id || null); // fall back to another saved style
  fillPresetSelect();
  openEditor(presets[0]?.id || null);
  pmsg(`Deleted “${p.name}”.`);
});
for (const id of ['presetClose', 'presetCancel']) $(id).addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // click outside to close
fillPresetSelect();

/* ---------------- Length ---------------- */
function setSeconds(s, fromInput) {
  seconds = Math.min(600, Math.max(5, Math.round(Number(s) || 30)));
  if (!fromInput) $('seconds').value = seconds;
  document.querySelectorAll('#lengths button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.s) === seconds)));
  $('target').textContent = `Aim: about ${targetWords(seconds)} words, read at a natural Shorts pace.`;
  store.set('seconds', String(seconds));
  updateMeter();
}
document.querySelectorAll('#lengths button').forEach((b) => b.addEventListener('click', () => setSeconds(b.dataset.s)));
$('seconds').addEventListener('input', () => { if ($('seconds').value) setSeconds($('seconds').value, true); });
$('seconds').addEventListener('change', () => setSeconds($('seconds').value));

/* ---------------- Output ---------------- */
const takes = [];
let current = -1;

function fmtTime(sec) {
  sec = Math.round(sec);
  return sec < 60 ? `~${sec}s` : `~${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function updateMeter() {
  const text = $('script').value;
  if ($('script').hidden || !text.trim()) { $('meter').hidden = true; return; }
  const n = countWords(text);
  const t = n / WPS;
  $('meter').hidden = false;
  $('wordCount').textContent = `${n} word${n === 1 ? '' : 's'}`;
  $('readTime').textContent = fmtTime(t);
  const diff = t - seconds;
  const fit = $('fit');
  if (Math.abs(diff) <= Math.max(3, seconds * 0.1)) { fit.textContent = `fits ${seconds}s`; fit.className = 'fit good'; }
  else { fit.textContent = diff > 0 ? `${Math.round(diff)}s too long` : `${Math.round(-diff)}s short`; fit.className = 'fit off'; }
}
function renderTakes() {
  $('takesWrap').hidden = takes.length < 2;
  $('takes').innerHTML = '';
  takes.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `Take ${i + 1}`;
    b.title = `${t.seconds}s · ${t.by}`;
    b.setAttribute('aria-pressed', String(i === current));
    b.addEventListener('click', () => showTake(i));
    $('takes').appendChild(b);
  });
}
function showTake(i) {
  current = i;
  $('empty').hidden = true;
  $('script').hidden = false;
  $('script').value = takes[i].text;
  $('copy').disabled = false;
  $('regen').disabled = false;
  renderTakes();
  updateMeter();
}
$('script').addEventListener('input', () => {
  if (current >= 0) takes[current].text = $('script').value;
  updateMeter();
});

const status = (html, isError) => {
  $('status').innerHTML = html || '';
  $('status').className = 'status' + (isError ? ' error' : '');
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const SETUP_BUILTIN = `The built-in AI isn’t switched on for this site yet. To turn it on (free, one time):
<ol class="setup">
  <li>In the Cloudflare dashboard, open <b>Workers &amp; Pages</b> → your site → <b>Settings</b> → <b>Bindings</b>.</li>
  <li><b>Add</b> → <b>Workers AI</b>, set the variable name to <b>AI</b>, and save.</li>
  <li>Go to <b>Deployments</b> and <b>Retry deployment</b> on the latest one.</li>
</ol>
Or open <b>AI settings</b> below the form and use your own AI key.`;

let busy = false;
async function generate() {
  if (busy) return;
  const context = $('context').value.trim();
  const notes = $('notes').value.trim();
  if (!context && !notes && !game) { status('Say what the video is first.', true); $('context').focus(); return; }
  const own = mode === 'own';
  const provider = own ? $('provider').value : 'builtin';
  const key = own ? $('apiKey').value.trim() : '';
  if (own && !key) { $('aiSettings').open = true; $('apiKey').focus(); status('Paste your API key in AI settings first, or switch to Built-in AI.', true); return; }

  busy = true;
  $('generate').disabled = $('regen').disabled = true;
  $('generate').textContent = 'Writing…';
  document.querySelector('.out').classList.add('busy');
  status('Writing your script…');
  try {
    const headers = { 'content-type': 'application/json' };
    if (key) headers['x-ai-key'] = key;
    const res = await fetch('/api/script', {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider, model: own ? $('model').value.trim() : '', context, notes, style: $('style').value.trim(), seconds, guide: presetById($('preset').value)?.text || '', appid: game?.id || '' }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (d.code === 'builtin_off') { status(SETUP_BUILTIN, true); return; }
      throw new Error(d.error || `Something went wrong (${res.status}).`);
    }
    takes.push({ text: d.script, seconds, by: own ? NAMES[provider] : 'Built-in AI' });
    showTake(takes.length - 1);
    status(d.research && !d.research.ok ? esc(d.research.error) : '', !!(d.research && !d.research.ok));
  } catch (e) {
    status(esc(e.message === 'Failed to fetch' ? 'Couldn’t reach the site. Check your connection and try again.' : e.message), true);
  } finally {
    busy = false;
    $('generate').disabled = false;
    $('regen').disabled = current < 0;
    $('generate').textContent = takes.length ? 'Write another' : 'Write script';
    document.querySelector('.out').classList.remove('busy');
  }
}
$('generate').addEventListener('click', generate);
$('regen').addEventListener('click', generate);
for (const id of ['context', 'style']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); generate(); } });

$('copy').addEventListener('click', async () => {
  const btn = $('copy');
  try { await navigator.clipboard.writeText($('script').value); btn.textContent = 'Copied!'; }
  catch { $('script').select(); btn.textContent = 'Press Ctrl+C'; }
  setTimeout(() => (btn.textContent = 'Copy'), 1500);
});

setSeconds(seconds);
