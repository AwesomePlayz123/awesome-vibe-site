// Audio Finder → Playlists: Spotify's official embed player plus a saved list kept in this browser.
const $ = (sel) => document.querySelector(sel);
const KEY = 'audio.playlists';
let current = null; // { type, id, name, thumb }

// open.spotify.com/playlist/ID, /intl-xx/playlist/ID, /album/ID, or spotify:playlist:ID
function parseSpotify(input) {
  const s = String(input || '').trim();
  let m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album)\/([A-Za-z0-9]{10,40})/i);
  if (!m) m = s.match(/^spotify:(playlist|album):([A-Za-z0-9]{10,40})$/i);
  return m ? { type: m[1].toLowerCase(), id: m[2] } : null;
}

const linkFor = (p) => `https://open.spotify.com/${p.type}/${p.id}`;

function loadSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((p) => p && p.id && p.type) : [];
  } catch {
    return [];
  }
}

function storeSaved(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

function setStatus(msg, isErr = false) {
  const el = $('#audioStatus');
  el.textContent = msg || '';
  el.classList.toggle('err', isErr);
}

async function lookupInfo(p) {
  try {
    const res = await fetch(`/api/spotify?url=${encodeURIComponent(linkFor(p))}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ---------------- Spotify player (official iFrame API) ---------------- */
// The iFrame API tells us which song is playing, so we can build a "Played so far" list.
// If the API script can't load, we fall back to the plain embed (player works, no list).
let controller = null;
let apiPromise = null;

function loadIframeApi() {
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 6000);
      window.onSpotifyIframeApiReady = (api) => {
        clearTimeout(timer);
        resolve(api);
      };
      const s = document.createElement('script');
      s.src = 'https://open.spotify.com/embed/iframe-api/v1';
      s.async = true;
      s.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

function plainEmbed(p) {
  const box = $('#plEmbed');
  box.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = `https://open.spotify.com/embed/${p.type}/${p.id}?utm_source=generator&theme=0`;
  iframe.title = p.name || 'Spotify player';
  iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  box.appendChild(iframe);
}

async function mountPlayer(p) {
  const uri = `spotify:${p.type}:${p.id}`;
  if (controller) {
    controller.loadUri(uri);
    return;
  }
  const api = await loadIframeApi();
  if (current !== p) return; // user switched playlists while the API loaded
  if (!api) {
    plainEmbed(p);
    $('#playedNote').textContent = 'Spotify’s player API didn’t load, so songs can’t be listed here right now.';
    return;
  }
  const box = $('#plEmbed');
  box.innerHTML = '';
  const el = document.createElement('div');
  box.appendChild(el);
  api.createController(el, { uri, width: '100%', height: window.innerWidth < 820 ? 460 : 560 }, (ctrl) => {
    controller = ctrl;
    ctrl.addListener('playback_update', (e) => onPlayback(e.data));
  });
}

/* ---------------- Played so far (this session only, not saved) ---------------- */

const played = []; // { id, title, artist, thumb }
let nowPlaying = null;

function onPlayback(data) {
  const m = String(data?.playingURI || '').match(/^spotify:track:([A-Za-z0-9]+)$/);
  if (!m) return;
  const id = m[1];
  if (id !== nowPlaying) {
    nowPlaying = id;
    if (!played.some((t) => t.id === id)) {
      const t = { id, title: null, artist: null, thumb: null };
      played.unshift(t);
      lookupTrack(t);
    }
    renderPlayed();
  }
}

async function lookupTrack(t) {
  try {
    const res = await fetch(`/api/spotify?url=${encodeURIComponent(`https://open.spotify.com/track/${t.id}`)}`);
    if (res.ok) {
      const info = await res.json();
      t.title = info.title;
      t.artist = info.artist || null;
      t.thumb = info.thumbnail;
    }
  } catch {}
  if (!t.title) t.title = 'Unknown song';
  renderPlayed();
}

function renderPlayed() {
  const ul = $('#playedList');
  ul.innerHTML = '';
  $('#playedNote').hidden = played.length > 0;
  $('#playedClear').hidden = played.length === 0;
  for (const t of played) {
    const li = document.createElement('li');
    li.className = 'played-item' + (t.id === nowPlaying ? ' now' : '');
    const ph = document.createElement('span');
    ph.className = 'pl-thumb-ph';
    ph.textContent = '♪';
    if (t.thumb) {
      const img = document.createElement('img');
      img.src = t.thumb;
      img.alt = '';
      img.onerror = () => img.replaceWith(ph);
      li.appendChild(img);
    } else {
      li.appendChild(ph);
    }
    const info = document.createElement('div');
    info.className = 'played-info';
    const title = document.createElement('div');
    title.className = 'played-title';
    title.textContent = t.title || 'Loading…';
    info.appendChild(title);
    if (t.artist) {
      const artist = document.createElement('div');
      artist.className = 'played-artist';
      artist.textContent = t.artist;
      info.appendChild(artist);
    }
    if (t.id === nowPlaying) {
      const tag = document.createElement('div');
      tag.className = 'played-now';
      tag.textContent = 'Now playing';
      info.appendChild(tag);
    }
    const links = document.createElement('div');
    links.className = 'played-links';
    const sp = document.createElement('a');
    sp.className = 'chip chip-spotify';
    sp.href = `https://open.spotify.com/track/${t.id}`;
    sp.target = '_blank';
    sp.rel = 'noopener';
    sp.textContent = 'Spotify';
    const yt = document.createElement('a');
    yt.className = 'chip chip-yt';
    yt.href = `https://www.youtube.com/results?search_query=${encodeURIComponent([t.title, t.artist].filter(Boolean).join(' '))}`;
    yt.target = '_blank';
    yt.rel = 'noopener';
    yt.textContent = 'YouTube';
    if (!t.title) yt.setAttribute('aria-disabled', 'true');
    links.append(sp, yt);
    info.appendChild(links);
    li.appendChild(info);
    ul.appendChild(li);
  }
}

$('#playedClear').addEventListener('click', () => {
  played.length = 0;
  renderPlayed();
});

function showPlayer(p) {
  current = p;
  mountPlayer(p);
  $('#plTitle').textContent = p.name || (p.type === 'album' ? 'Album' : 'Playlist');
  $('#plOpen').href = linkFor(p);
  $('#plOpen').hidden = false;
  refreshSaveButton();
  renderList();
}

function refreshSaveButton() {
  const btn = $('#plSave');
  if (!current) return (btn.hidden = true);
  const saved = loadSaved().some((s) => s.id === current.id);
  btn.hidden = false;
  btn.textContent = saved ? 'Saved ✓' : 'Save';
  btn.disabled = saved;
}

function renderList() {
  const list = loadSaved();
  const ul = $('#plList');
  ul.innerHTML = '';
  $('#plEmpty').hidden = list.length > 0;
  for (const p of list) {
    const li = document.createElement('li');
    li.className = 'pl-item' + (current && current.id === p.id ? ' on' : '');

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'pl-open';
    open.title = 'Load this playlist';
    if (p.thumb) {
      const img = document.createElement('img');
      img.src = p.thumb;
      img.alt = '';
      img.loading = 'lazy';
      open.appendChild(img);
    } else {
      const ph = document.createElement('span');
      ph.className = 'pl-thumb-ph';
      ph.textContent = '♪';
      open.appendChild(ph);
    }
    const name = document.createElement('span');
    name.className = 'pl-name';
    name.textContent = p.name || 'Untitled playlist';
    open.appendChild(name);
    open.addEventListener('click', () => {
      $('#plUrl').value = linkFor(p);
      showPlayer(p);
      setStatus('');
    });

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'icon-btn';
    rename.title = 'Rename';
    rename.setAttribute('aria-label', `Rename ${p.name}`);
    rename.textContent = '✎';
    rename.addEventListener('click', () => {
      const next = prompt('Name this playlist:', p.name || '');
      if (next === null) return;
      const all = loadSaved();
      const item = all.find((x) => x.id === p.id);
      if (item) item.name = next.trim().slice(0, 80) || item.name;
      storeSaved(all);
      if (current && current.id === p.id) {
        current.name = item.name;
        $('#plTitle').textContent = item.name;
      }
      renderList();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.title = 'Remove';
    remove.setAttribute('aria-label', `Remove ${p.name}`);
    remove.textContent = '✕';
    remove.addEventListener('click', () => {
      if (!confirm(`Remove “${p.name || 'this playlist'}” from your saved list?`)) return;
      storeSaved(loadSaved().filter((x) => x.id !== p.id));
      renderList();
      refreshSaveButton();
    });

    li.append(open, rename, remove);
    ul.appendChild(li);
  }
}

$('#plForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const parsed = parseSpotify($('#plUrl').value);
  if (!parsed) return setStatus('That doesn’t look like a Spotify playlist or album link. Copy it from Spotify via Share → Copy link.', true);
  const saved = loadSaved().find((s) => s.id === parsed.id);
  const p = saved ? { ...saved } : { ...parsed, name: null, thumb: null };
  setStatus('');
  showPlayer(p);
  if (!saved) {
    const info = await lookupInfo(p);
    if (current && current.id === p.id) {
      current.name = info?.title || (p.type === 'album' ? 'Spotify album' : 'Spotify playlist');
      current.thumb = info?.thumbnail || null;
      $('#plTitle').textContent = current.name;
      if (!info) setStatus('Couldn’t get this playlist’s details. If the player stays empty, the playlist is probably private; make it public in Spotify first.', true);
    }
  }
});

$('#plSave').addEventListener('click', () => {
  if (!current) return;
  const list = loadSaved();
  if (!list.some((s) => s.id === current.id)) {
    list.unshift({ type: current.type, id: current.id, name: current.name || 'Spotify playlist', thumb: current.thumb || null, savedAt: Date.now() });
    if (!storeSaved(list)) return setStatus('Your browser blocked saving (private window?).', true);
  }
  refreshSaveButton();
  renderList();
});

renderList();
