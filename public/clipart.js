// Clipart Finder: keyword search over Pixabay via /api/clipart.
const $ = (sel) => document.querySelector(sel);
const proxied = (src) => `/api/file?src=${encodeURIComponent(src)}`;
const state = { q: '', type: 'vector', transparent: true, offset: 0 };

const fileSafe = (s) =>
  String(s || 'clipart')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'clipart';

function setStatus(msg, isErr = false) {
  const el = $('#clipStatus');
  el.textContent = msg || '';
  el.classList.toggle('err', isErr);
}

// Remember the last-used options.
try {
  const saved = JSON.parse(localStorage.getItem('clipart.opts') || '{}');
  if (saved.type) $('#clipType').value = saved.type;
  if (typeof saved.transparent === 'boolean') $('#clipTransparent').checked = saved.transparent;
} catch {}
function saveOpts() {
  try {
    localStorage.setItem('clipart.opts', JSON.stringify({ type: $('#clipType').value, transparent: $('#clipTransparent').checked }));
  } catch {}
}

async function search(append = false) {
  if (!append) {
    state.q = $('#clipQ').value.trim();
    state.type = $('#clipType').value;
    state.transparent = $('#clipTransparent').checked;
    state.offset = 0;
  }
  if (!state.q) return;
  saveOpts();
  $('#clipGo').disabled = true;
  $('#clipMore').disabled = true;
  setStatus(append ? 'Loading more…' : 'Searching…');
  try {
    const qs = new URLSearchParams({ q: state.q, type: state.type, offset: String(state.offset) });
    if (state.transparent) qs.set('transparent', '1');
    const res = await fetch(`/api/clipart?${qs}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed.');

    const grid = $('#clipGrid');
    if (!append) grid.innerHTML = '';
    $('#clipResults').hidden = false;
    for (const item of data.results) grid.appendChild(renderItem(item));

    if (!data.total) {
      setStatus(
        state.transparent
          ? 'No transparent results. Try other keywords, or untick "Transparent background only".'
          : 'No results. Try other keywords or a different image kind.'
      );
    } else {
      const shown = grid.children.length;
      setStatus(`Showing ${shown} of ${data.total} result${data.total === 1 ? '' : 's'} for “${data.query}”.`);
    }
    state.offset = data.offset + data.results.length;
    $('#clipMore').hidden = !data.hasMore;
  } catch (e) {
    setStatus(e.message, true);
  } finally {
    $('#clipGo').disabled = false;
    $('#clipMore').disabled = false;
  }
}

function renderItem(item) {
  const card = document.createElement('article');
  card.className = 'clip';

  const box = document.createElement('div');
  box.className = 'clip-img checker';
  const img = document.createElement('img');
  img.alt = item.tags;
  img.loading = 'lazy';
  img.src = proxied(item.preview);
  img.addEventListener('load', () => markTransparency(img, card), { once: true });
  box.appendChild(img);

  const meta = document.createElement('div');
  meta.className = 'clip-meta';
  const tags = document.createElement('div');
  tags.className = 'clip-tags';
  tags.textContent = item.tags;
  const info = document.createElement('div');
  info.className = 'clip-info';
  info.textContent = `${item.width}×${item.height} ${item.ext.toUpperCase()} · by ${item.user}`;
  meta.append(tags, info);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const dl = document.createElement('a');
  dl.className = 'btn';
  const name = `${fileSafe(item.tags.split(',').slice(0, 3).join(' '))} - Pixabay ${item.id}.${item.ext}`;
  dl.href = `${proxied(item.download)}&download=${encodeURIComponent(name)}`;
  dl.textContent = 'Download';
  const src = document.createElement('a');
  src.className = 'btn ghost';
  src.href = item.pageURL;
  src.target = '_blank';
  src.rel = 'noopener';
  src.textContent = 'Pixabay ↗';
  actions.append(dl, src);

  card.append(box, meta, actions);
  return card;
}

// Badge images that really have see-through pixels (checks the edges of the preview).
function markTransparency(img, card) {
  try {
    const c = document.createElement('canvas');
    const w = (c.width = Math.min(160, img.naturalWidth));
    const h = (c.height = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth)));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let clear = 0;
    for (let i = 3; i < data.length; i += 4 * 7) if (data[i] < 250) clear++;
    if (clear > 0) {
      const badge = document.createElement('span');
      badge.className = 'clip-badge';
      badge.textContent = 'Transparent';
      card.querySelector('.clip-img').appendChild(badge);
    }
  } catch {
    /* ignore — badge is just a nice-to-have */
  }
}

$('#clipSearch').addEventListener('submit', (e) => {
  e.preventDefault();
  search(false);
});
$('#clipMore').addEventListener('click', () => search(true));
for (const id of ['#clipType', '#clipTransparent']) {
  $(id).addEventListener('change', () => {
    saveOpts();
    if (state.q) search(false);
  });
}
