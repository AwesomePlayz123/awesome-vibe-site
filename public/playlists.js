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

function showPlayer(p) {
  current = p;
  const box = $('#plEmbed');
  box.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = `https://open.spotify.com/embed/${p.type}/${p.id}?utm_source=generator&theme=0`;
  iframe.title = p.name || 'Spotify player';
  iframe.loading = 'lazy';
  iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  box.appendChild(iframe);
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
