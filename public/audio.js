// Audio Finder: Freesound sound effects (CC0) and Jamendo music (commercial use OK, credit needed).
const $ = (sel) => document.querySelector(sel);
const proxied = (src) => `/api/file?src=${encodeURIComponent(src)}`;
const state = { q: '', kind: 'sfx', offset: 0, playingId: null };
const player = $('#player');

const fileSafe = (s) =>
  String(s || 'audio')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'audio';

const fmtTime = (sec) => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>';

function setStatus(msg, isErr = false) {
  const el = $('#audioStatus');
  el.textContent = msg || '';
  el.classList.toggle('err', isErr);
}

const INTROS = {
  sfx: 'Preview right here, download what you like. Sound effects are public domain; music needs a one-line credit, which you can copy.',
  music: 'Preview right here, download what you like. Sound effects are public domain; music needs a one-line credit, which you can copy.',
  playlists: 'Keep your Spotify playlists handy: paste a link to listen, save it, and come back to it in one click.',
};

function setKind(kind) {
  state.kind = kind;
  const pl = kind === 'playlists';
  for (const b of document.querySelectorAll('#audioKind button')) b.classList.toggle('on', b.dataset.kind === kind);
  $('#musicNote').hidden = kind !== 'music';
  $('#audioSearch').hidden = pl;
  $('#plForm').hidden = !pl;
  $('#plPane').hidden = !pl;
  $('#audioResults').hidden = pl || !$('#audioList').children.length;
  $('#audioIntro').textContent = INTROS[kind];
  if (pl) {
    stop();
    setStatus('');
  }
  $('#audioQ').placeholder = kind === 'music' ? 'e.g. chill lofi, epic orchestral, retro synth' : 'e.g. explosion, coin pickup, door creak';
  try {
    localStorage.setItem('audio.kind', kind);
  } catch {}
}

try {
  const saved = localStorage.getItem('audio.kind');
  if (saved === 'music' || saved === 'sfx' || saved === 'playlists') setKind(saved);
} catch {}

async function search(append = false) {
  if (!append) {
    state.q = $('#audioQ').value.trim();
    state.offset = 0;
    stop();
  }
  if (!state.q) return;
  $('#audioGo').disabled = true;
  $('#audioMore').disabled = true;
  setStatus(append ? 'Loading more…' : 'Searching…');
  try {
    const qs = new URLSearchParams({ q: state.q, kind: state.kind, offset: String(state.offset) });
    const res = await fetch(`/api/audio?${qs}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed.');

    const list = $('#audioList');
    if (!append) list.innerHTML = '';
    $('#audioResults').hidden = false;
    for (const item of data.results) list.appendChild(renderItem(item));

    if (!data.total) {
      setStatus(data.kind === 'music' ? 'No usable tracks for that. Try a genre or mood (e.g. "lofi", "epic").' : 'No public-domain sounds for that. Try simpler words.');
    } else {
      setStatus(`Showing ${list.children.length} of ${data.total} ${data.kind === 'music' ? 'tracks' : 'sounds'} for “${data.query}”.`);
    }
    $('#audioCredit').innerHTML =
      data.kind === 'music'
        ? 'Music from <a href="https://www.jamendo.com/" target="_blank" rel="noopener">Jamendo</a>. Only tracks whose Creative Commons license allows commercial use in videos are shown. Paste the credit line into your video description.'
        : 'Sounds from <a href="https://freesound.org/" target="_blank" rel="noopener">Freesound</a>. Only public-domain (CC0) sounds are shown — free for commercial use, no credit needed. Downloads are Freesound’s high-quality MP3 previews.';
    state.offset = data.offset + data.results.length;
    $('#audioMore').hidden = !data.hasMore;
  } catch (e) {
    setStatus(e.message, true);
  } finally {
    $('#audioGo').disabled = false;
    $('#audioMore').disabled = false;
  }
}

function renderItem(item) {
  const li = document.createElement('li');
  li.className = 'track';
  li.dataset.id = item.id;

  const play = document.createElement('button');
  play.className = 'play';
  play.type = 'button';
  play.setAttribute('aria-label', `Play ${item.title}`);
  play.innerHTML = ICON_PLAY;
  play.addEventListener('click', () => toggle(item, li));

  const main = document.createElement('div');
  main.className = 'track-main';
  const title = document.createElement('div');
  title.className = 'track-title';
  title.textContent = item.title;
  const meta = document.createElement('div');
  meta.className = 'track-meta';
  meta.textContent = `${fmtTime(item.duration)} · ${item.author} · ${item.license}`;
  const bar = document.createElement('div');
  bar.className = 'track-bar';
  if (item.waveform) {
    const wf = document.createElement('img');
    wf.className = 'wave';
    wf.alt = '';
    wf.loading = 'lazy';
    wf.src = proxied(item.waveform);
    bar.appendChild(wf);
  }
  const fill = document.createElement('div');
  fill.className = 'track-fill';
  bar.appendChild(fill);
  bar.addEventListener('click', (e) => {
    if (state.playingId !== item.id || !player.duration) return;
    const r = bar.getBoundingClientRect();
    player.currentTime = ((e.clientX - r.left) / r.width) * player.duration;
  });
  main.append(title, meta, bar);

  if (item.image) {
    const art = document.createElement('img');
    art.className = 'track-art';
    art.alt = '';
    art.loading = 'lazy';
    art.src = proxied(item.image);
    li.append(play, art, main);
  } else {
    li.append(play, main);
  }

  const actions = document.createElement('div');
  actions.className = 'actions track-actions';
  const dl = document.createElement('a');
  dl.className = 'btn';
  dl.textContent = 'Download';
  const name = `${fileSafe(item.title)} - ${fileSafe(item.author)} (${item.source}).${item.ext}`;
  dl.href = `${proxied(item.download)}&download=${encodeURIComponent(name)}`;
  actions.appendChild(dl);

  if (item.credit) {
    const copy = document.createElement('button');
    copy.className = 'btn ghost';
    copy.type = 'button';
    copy.textContent = 'Copy credit';
    copy.title = item.credit;
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(item.credit);
        copy.textContent = 'Copied!';
      } catch {
        prompt('Copy this credit line:', item.credit);
      }
      setTimeout(() => (copy.textContent = 'Copy credit'), 1500);
    });
    actions.appendChild(copy);
  }

  const src = document.createElement('a');
  src.className = 'btn ghost';
  src.href = item.pageURL;
  src.target = '_blank';
  src.rel = 'noopener';
  src.textContent = '↗';
  src.title = `Open on ${item.source}`;
  src.setAttribute('aria-label', `Open on ${item.source}`);
  actions.appendChild(src);

  li.appendChild(actions);
  return li;
}

/* ---------------- Playback ---------------- */

function rowFor(id) {
  return id ? document.querySelector(`.track[data-id="${CSS.escape(id)}"]`) : null;
}

function setRowPlaying(id, playing) {
  const row = rowFor(id);
  if (!row) return;
  row.classList.toggle('playing', playing);
  const btn = row.querySelector('.play');
  btn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
}

function stop() {
  player.pause();
  setRowPlaying(state.playingId, false);
  const row = rowFor(state.playingId);
  if (row) row.querySelector('.track-fill').style.width = '0';
  state.playingId = null;
}

function toggle(item, li) {
  if (state.playingId === item.id) {
    if (player.paused) {
      player.play();
      setRowPlaying(item.id, true);
    } else {
      player.pause();
      setRowPlaying(item.id, false);
    }
    return;
  }
  stop();
  state.playingId = item.id;
  player.src = item.preview;
  player.play().catch(() => {
    setRowPlaying(item.id, false);
    setStatus('Couldn’t play that preview.', true);
  });
  setRowPlaying(item.id, true);
}

player.addEventListener('timeupdate', () => {
  const row = rowFor(state.playingId);
  if (row && player.duration) row.querySelector('.track-fill').style.width = `${(player.currentTime / player.duration) * 100}%`;
});
player.addEventListener('ended', () => {
  setRowPlaying(state.playingId, false);
  const row = rowFor(state.playingId);
  if (row) row.querySelector('.track-fill').style.width = '0';
  state.playingId = null;
});

// Stop playback when leaving the Audio tab.
document.addEventListener('viewchange', (e) => {
  if (e.detail !== 'audio') stop();
});

/* ---------------- Events ---------------- */

$('#audioSearch').addEventListener('submit', (e) => {
  e.preventDefault();
  search(false);
});
$('#audioMore').addEventListener('click', () => search(true));
for (const b of document.querySelectorAll('#audioKind button')) {
  b.addEventListener('click', () => {
    if (state.kind === b.dataset.kind) return;
    setKind(b.dataset.kind);
    if (b.dataset.kind !== 'playlists' && $('#audioQ').value.trim()) search(false);
  });
}
