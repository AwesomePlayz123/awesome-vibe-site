import { buildTrailerMp4, trailerSize, mb } from './trailer.js';

const $ = (sel) => document.querySelector(sel);
const state = { game: null, caseStyle: 'front', images: {} };

const proxied = (src) => `/api/file?src=${encodeURIComponent(src)}`;
const proxiedDownload = (src, name) => `${proxied(src)}&download=${encodeURIComponent(name)}`;
const extOf = (url) => (new URL(url).pathname.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || 'jpg').toLowerCase();
// Filename-safe version of a game/trailer name: plain dashes and quotes, no ™/®, accents dropped.
const slug = (s) =>
  String(s || 'game')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[™®©“”]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'game';

function setStatus(msg, isErr = false) {
  const el = $('#status');
  el.textContent = msg || '';
  el.classList.toggle('err', isErr);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}

function saveCanvas(canvas, filename) {
  canvas.toBlob((blob) => saveBlob(blob, filename), 'image/png');
}

function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

function setDownloadLink(el, src, filename) {
  if (src) {
    el.href = proxiedDownload(src, filename);
    el.removeAttribute('aria-disabled');
  } else {
    el.removeAttribute('href');
    el.setAttribute('aria-disabled', 'true');
  }
}

function showImageOrEmpty(img, src, emptyText) {
  const preview = img.parentElement;
  preview.querySelector('.empty')?.remove();
  if (src) {
    img.hidden = false;
    img.src = proxied(src);
  } else {
    img.hidden = true;
    img.removeAttribute('src');
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = emptyText;
    preview.appendChild(p);
  }
}

/* ---------------- Lookup ---------------- */

// A Steam link or bare app id goes straight to the lookup; anything else is treated as a game name.
const looksLikeLink = (s) => /^\d+$/.test(s) || /\/app\/\d+/i.test(s) || /^https?:\/\//i.test(s);

$('#lookup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const typed = $('#url').value.trim();
  if (!typed) return;
  closeSuggestions();

  let url = typed;
  if (ac.pick && typed === ac.pick.name) {
    url = String(ac.pick.id);
  } else if (!looksLikeLink(typed)) {
    // Name typed but nothing picked: use the best match.
    $('#go').disabled = true;
    setStatus('Searching Steam…');
    const items = await fetchSuggestions(typed).catch(() => null);
    $('#go').disabled = false;
    if (!items) return setStatus('Couldn’t reach Steam search. Try pasting the store link instead.', true);
    if (!items.length) return setStatus(`No Steam game found for “${typed}”. Check the spelling or paste the store link.`, true);
    ac.pick = items[0];
    $('#url').value = items[0].name;
    url = String(items[0].id);
  }

  $('#go').disabled = true;
  setStatus('Asking Steam…');
  try {
    const cc = $('#region').value;
    const res = await fetch(`/api/game?url=${encodeURIComponent(url)}&cc=${cc}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    state.game = data;
    await render(data);
    setStatus('');
    history.replaceState(null, '', `?app=${data.appid}${data.region !== 'us' ? `&cc=${data.region}` : ''}`);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    $('#go').disabled = false;
  }
});

/* ---------------- Search-by-name suggestions ---------------- */

const ac = { items: [], active: -1, pick: null, timer: null, seq: 0, cache: new Map() };
const acInput = $('#url');
const acList = $('#suggestions');

async function fetchSuggestions(q) {
  const key = `${$('#region').value}:${q.toLowerCase()}`;
  if (ac.cache.has(key)) return ac.cache.get(key);
  const res = await fetch(`/api/steam-search?q=${encodeURIComponent(q)}&cc=${$('#region').value}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Search failed');
  ac.cache.set(key, data.items);
  return data.items;
}

function closeSuggestions() {
  acList.hidden = true;
  acList.innerHTML = '';
  ac.items = [];
  ac.active = -1;
  acInput.setAttribute('aria-expanded', 'false');
  acInput.removeAttribute('aria-activedescendant');
}

function setActive(i) {
  ac.active = i;
  [...acList.children].forEach((li, j) => li.classList.toggle('active', j === i));
  if (i >= 0) acInput.setAttribute('aria-activedescendant', `sugg-${i}`);
  else acInput.removeAttribute('aria-activedescendant');
  acList.children[i]?.scrollIntoView({ block: 'nearest' });
}

function showSuggestions(items) {
  ac.items = items;
  acList.innerHTML = '';
  if (!items.length) return closeSuggestions();
  items.forEach((item, i) => {
    const li = document.createElement('li');
    li.id = `sugg-${i}`;
    li.setAttribute('role', 'option');
    const img = document.createElement('img');
    img.alt = '';
    img.src = proxied(item.image);
    const name = document.createElement('span');
    name.className = 'sugg-name';
    name.textContent = item.name;
    const price = document.createElement('span');
    price.className = 'sugg-price';
    if (item.price) {
      if (item.price.discount) {
        const d = document.createElement('b');
        d.textContent = `-${item.price.discount}%`;
        price.appendChild(d);
      }
      price.append(item.price.final);
    }
    li.append(img, name, price);
    // mousedown (not click) so it fires before the input loses focus
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      choose(i);
    });
    acList.appendChild(li);
  });
  acList.hidden = false;
  acInput.setAttribute('aria-expanded', 'true');
  setActive(-1);
}

function choose(i) {
  const item = ac.items[i];
  if (!item) return;
  ac.pick = item;
  acInput.value = item.name;
  closeSuggestions();
  $('#lookup').requestSubmit();
}

acInput.addEventListener('input', () => {
  const q = acInput.value.trim();
  ac.pick = null;
  clearTimeout(ac.timer);
  if (q.length < 2 || looksLikeLink(q)) return closeSuggestions();
  ac.timer = setTimeout(async () => {
    const seq = ++ac.seq;
    try {
      const items = await fetchSuggestions(q);
      if (seq === ac.seq && acInput.value.trim() === q) showSuggestions(items);
    } catch {
      /* suggestions are best-effort; Enter still searches */
    }
  }, 220);
});

acInput.addEventListener('keydown', (e) => {
  if (acList.hidden) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setActive((ac.active + 1) % ac.items.length);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setActive(ac.active <= 0 ? ac.items.length - 1 : ac.active - 1);
  } else if (e.key === 'Enter' && ac.active >= 0) {
    e.preventDefault();
    choose(ac.active);
  } else if (e.key === 'Escape') {
    closeSuggestions();
  }
});
acInput.addEventListener('blur', () => setTimeout(closeSuggestions, 100));

async function render(g) {
  $('#results').hidden = false;
  $('#gameName').textContent = g.name;
  $('#storeLink').href = g.storeUrl;
  const base = slug(g.name);

  // Logo (on newer games it may still be on its way; see fillMissingArt)
  const missing = g.artMissing || [];
  showImageOrEmpty($('#logoImg'), g.images.logo, missing.includes('logo') ? 'Looking for the logo…' : NO_LOGO);
  setDownloadLink($('#logoDl'), g.images.logo, `${base} - Logo.png`);

  // Cover
  showImageOrEmpty($('#coverImg'), g.images.cover, 'No 600×900 library cover — using the header for the case.');
  setDownloadLink($('#coverDl'), g.images.cover, `${base} - Cover.${g.images.cover ? extOf(g.images.cover) : 'jpg'}`);

  // Images needed for canvases
  state.images = {};
  const load = (src) => (src ? loadImage(proxied(src)).catch(() => null) : null);
  const [header, cover, capsule] = await Promise.all([load(g.images.header), load(g.images.cover), load(g.images.capsule)]);
  state.images = { header, cover: cover || header, capsule: capsule || header };

  drawInfoCard();
  drawPriceTag();
  drawCase();
  renderTrailers(g);
  renderExtras(g);
  if (missing.length) fillMissingArt(g, missing);
}

const NO_LOGO = 'Couldn’t find a library logo for this game. Try again in a bit, or grab it from SteamGridDB.';

// Second pass for art the quick lookup missed (usually the logo on newer games). Runs after the game is shown,
// so the rest of Steam Kit doesn't wait for it.
async function fillMissingArt(g, missing) {
  let found = {};
  try {
    const res = await fetch(`/api/steam-art?app=${g.appid}&need=${missing.join(',')}`);
    if (res.ok) found = await res.json();
  } catch {}
  if (state.game !== g) return; // a different game was loaded meanwhile
  const base = slug(g.name);

  if (missing.includes('logo')) {
    g.images.logo = found.logo || null;
    showImageOrEmpty($('#logoImg'), g.images.logo, NO_LOGO);
    setDownloadLink($('#logoDl'), g.images.logo, `${base} - Logo.png`);
  }
  if (found.cover) {
    g.images.cover = found.cover;
    showImageOrEmpty($('#coverImg'), g.images.cover, '');
    setDownloadLink($('#coverDl'), g.images.cover, `${base} - Cover.${extOf(g.images.cover)}`);
    const img = await loadImage(proxied(found.cover)).catch(() => null);
    if (img && state.game === g) {
      state.images.cover = img;
      drawCase();
    }
  }
  if (found.hero) {
    g.images.hero = found.hero;
    renderExtras(g);
  }
}

/* ---------------- Store info card ---------------- */

const STEAM = {
  bgTop: '#1e2c3a',
  bgBottom: '#16202c',
  desc: '#c6d4df',
  label: '#556772',
  link: '#66c0f4',
  count: '#8f98a0',
  tone: { positive: '#66c0f4', mixed: '#b9a074', negative: '#c35c2c', neutral: '#8f98a0' },
  font: 'Arial, Helvetica, sans-serif',
};

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawInfoCard() {
  const g = state.game;
  const canvas = $('#infoCanvas');
  const S = 3; // export scale
  const W = 376;
  const PAD = 8;
  const VALUE_X = 140;
  const header = state.images.header;
  const headerH = header ? Math.round((W * header.height) / header.width) : 0;

  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `13px ${STEAM.font}`;
  const descLines = wrapText(measure, g.description || '', W - PAD * 2);

  const rows = [];
  for (const r of g.reviews) rows.push({ type: 'review', ...r });
  if (rows.length) rows.push({ type: 'gap' });
  if (g.releaseDate) rows.push({ type: 'plain', label: 'RELEASE DATE:', value: g.releaseDate });
  rows.push({ type: 'gap' });
  if (g.developers.length) rows.push({ type: 'link', label: 'DEVELOPER:', value: g.developers.join(', ') });
  if (g.publishers.length) rows.push({ type: 'link', label: 'PUBLISHER:', value: g.publishers.join(', ') });

  const LINE = 18;
  const ROW = 21;
  let H = headerH + 14 + descLines.length * LINE + 14;
  for (const r of rows) H += r.type === 'gap' ? 10 : ROW;
  H += 8;

  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, STEAM.bgTop);
  bg.addColorStop(1, STEAM.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (header) ctx.drawImage(header, 0, 0, W, headerH);

  let y = headerH + 14;
  ctx.textBaseline = 'top';
  ctx.font = `13px ${STEAM.font}`;
  ctx.fillStyle = STEAM.desc;
  for (const line of descLines) {
    ctx.fillText(line, PAD, y);
    y += LINE;
  }
  y += 14;

  for (const r of rows) {
    if (r.type === 'gap') { y += 10; continue; }
    ctx.font = `10px ${STEAM.font}`;
    ctx.fillStyle = STEAM.label;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.3px';
    const label = r.type === 'review' ? `${r.label}:` : r.label;
    ctx.fillText(label, PAD, y + 2);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    ctx.font = `13px ${STEAM.font}`;
    if (r.type === 'review') {
      ctx.fillStyle = STEAM.tone[r.tone] || STEAM.tone.neutral;
      ctx.fillText(r.summary, VALUE_X, y);
      if (r.count) {
        const x = VALUE_X + ctx.measureText(r.summary + ' ').width;
        ctx.fillStyle = STEAM.count;
        ctx.fillText(`(${r.count})`, x, y);
      }
    } else {
      ctx.fillStyle = r.type === 'link' ? STEAM.link : STEAM.desc;
      ctx.fillText(r.value, VALUE_X, y, W - VALUE_X - PAD);
    }
    y += ROW;
  }
}

$('#infoDl').addEventListener('click', () => {
  if (state.game) saveCanvas($('#infoCanvas'), `${slug(state.game.name)} - Info Card.png`);
});

$('#infoCopy').addEventListener('click', async () => {
  const g = state.game;
  if (!g) return;
  const lines = [
    g.name,
    '',
    g.description,
    '',
    ...g.reviews.map((r) => `${r.label}: ${r.summary}${r.count ? ` (${r.count})` : ''}`),
    g.releaseDate && `RELEASE DATE: ${g.releaseDate}`,
    g.developers.length && `DEVELOPER: ${g.developers.join(', ')}`,
    g.publishers.length && `PUBLISHER: ${g.publishers.join(', ')}`,
  ].filter((l) => l !== false && l !== undefined);
  await navigator.clipboard.writeText(lines.join('\n'));
  const btn = $('#infoCopy');
  btn.textContent = 'Copied!';
  setTimeout(() => (btn.textContent = 'Copy text'), 1500);
});

/* ---------------- Game case mockup ---------------- */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draws the flat case (no shadow) onto its own canvas.
function buildFlatCase(art) {
  const SPINE = 64, M = 22, CW = 840, CH = 1260;
  const W = SPINE + M + CW + M;
  const H = CH + M * 2;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // Case shell
  const shell = ctx.createLinearGradient(0, 0, W, 0);
  shell.addColorStop(0, '#0b0c0e');
  shell.addColorStop(0.08, '#1a1c20');
  shell.addColorStop(1, '#121317');
  roundRect(ctx, 0, 0, W, H, 26);
  ctx.fillStyle = shell;
  ctx.fill();

  // Spine hinge ridges
  ctx.save();
  roundRect(ctx, 0, 0, W, H, 26);
  ctx.clip();
  for (let x = 10; x < SPINE - 6; x += 7) {
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(x, 14, 2, H - 28);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(SPINE - 2, 0, 3, H);
  ctx.restore();

  // Cover art (cover-fit into the insert area)
  const ax = SPINE + M, ay = M;
  ctx.save();
  roundRect(ctx, ax, ay, CW, CH, 6);
  ctx.clip();
  ctx.fillStyle = '#000';
  ctx.fillRect(ax, ay, CW, CH);
  if (art) {
    const scale = Math.max(CW / art.width, CH / art.height);
    const dw = art.width * scale, dh = art.height * scale;
    ctx.drawImage(art, ax + (CW - dw) / 2, ay + (CH - dh) / 2, dw, dh);
  }
  ctx.restore();

  // Plastic sleeve: gloss + edge highlights
  ctx.save();
  roundRect(ctx, 0, 0, W, H, 26);
  ctx.clip();
  const gloss = ctx.createLinearGradient(0, 0, W * 0.9, H * 0.6);
  gloss.addColorStop(0, 'rgba(255,255,255,0.16)');
  gloss.addColorStop(0.35, 'rgba(255,255,255,0.04)');
  gloss.addColorStop(0.36, 'rgba(255,255,255,0)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  roundRect(ctx, ax - 1, ay - 1, CW + 2, CH + 2, 7);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  roundRect(ctx, 1, 1, W - 2, H - 2, 25);
  ctx.stroke();
  return c;
}

// The Steam case from the Case Generator tool: a 611×1048 template with a 600×900 cover window at (0, 119).
const STEAM_CASE = { W: 611, H: 1048, X: 0, Y: 119, CW: 600, CH: 900 };
let steamCaseTpl = null;
function loadSteamCaseTemplate() {
  if (!steamCaseTpl) steamCaseTpl = loadImage('/tools/steam-case/case.png').catch((e) => { steamCaseTpl = null; throw e; });
  return steamCaseTpl;
}

async function drawSteamCase(out) {
  const art = state.images.cover;
  let tpl;
  try {
    tpl = await loadSteamCaseTemplate();
  } catch {
    return;
  }
  if (state.caseStyle !== 'steam') return; // switched style while loading
  const { W, H, X, Y, CW, CH } = STEAM_CASE;
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (art) {
    // cover-fit the art into the window, same as the Case Generator
    ctx.save();
    ctx.beginPath();
    ctx.rect(X, Y, CW, CH);
    ctx.clip();
    ctx.imageSmoothingQuality = 'high';
    const sc = Math.max(CW / art.width, CH / art.height);
    const dw = art.width * sc, dh = art.height * sc;
    ctx.drawImage(art, X + (CW - dw) / 2, Y + (CH - dh) / 2, dw, dh);
    ctx.restore();
  }
  ctx.drawImage(tpl, 0, 0);
}

function drawCase() {
  const out = $('#caseCanvas');
  if (state.caseStyle === 'steam') return drawSteamCase(out);
  const flat = buildFlatCase(state.images.cover);
  const W = flat.width, H = flat.height;
  const PAD = 90;

  if (state.caseStyle === 'front') {
    out.width = W + PAD * 2;
    out.height = H + PAD * 2;
    const ctx = out.getContext('2d');
    ctx.clearRect(0, 0, out.width, out.height);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 30;
    ctx.drawImage(flat, PAD, PAD);
    ctx.restore();
    return;
  }

  // Angled: perspective-correct column slicing (right edge recedes).
  const h0 = H, h1 = H * 0.84, DW = Math.round(W * 0.82);
  out.width = DW + PAD * 2;
  out.height = H + PAD * 2;
  const ctx = out.getContext('2d');
  ctx.clearRect(0, 0, out.width, out.height);
  const top = (t) => PAD + (H - (h0 + (h1 - h0) * t)) / 2;

  // Soft shadow: draw the silhouette off-canvas and let only its shadow land in frame.
  const OFF = 20000;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetX = OFF + 18;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(PAD - OFF, top(0));
  ctx.lineTo(PAD + DW - OFF, top(1));
  ctx.lineTo(PAD + DW - OFF, top(1) + h1);
  ctx.lineTo(PAD - OFF, top(0) + h0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Warp the flat case on its own layer, then shade it and composite over the shadow.
  const layer = document.createElement('canvas');
  layer.width = out.width;
  layer.height = out.height;
  const lc = layer.getContext('2d');
  for (let x = 0; x < DW; x++) {
    const t = x / DW;
    const u = (t * h1) / ((1 - t) * h0 + t * h1); // perspective-correct texture coordinate
    const h = h0 + (h1 - h0) * t;
    lc.drawImage(flat, Math.min(W - 1, u * W), 0, Math.max(1, W / DW), H, PAD + x, top(t), 1.5, h);
  }
  lc.globalCompositeOperation = 'source-atop';
  const shade = lc.createLinearGradient(PAD, 0, PAD + DW, 0);
  shade.addColorStop(0, 'rgba(255,255,255,0.04)');
  shade.addColorStop(1, 'rgba(0,0,0,0.28)');
  lc.fillStyle = shade;
  lc.fillRect(PAD, 0, DW, out.height);

  ctx.drawImage(layer, 0, 0);
}

document.querySelectorAll('#coverCard .seg button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('#coverCard .seg button').forEach((x) => x.classList.toggle('on', x === b));
    state.caseStyle = b.dataset.style;
    if (state.game) drawCase();
  })
);

$('#caseDl').addEventListener('click', () => {
  const label = { front: 'Front', angled: 'Angled', steam: 'Steam' }[state.caseStyle] || 'Front';
  if (state.game) saveCanvas($('#caseCanvas'), `${slug(state.game.name)} - Case ${label}.png`);
});

/* ---------------- Trailers ---------------- */

// Trailer sizes are checked one trailer at a time so they don't crowd out everything else loading.
let sizeQueue = Promise.resolve();

function renderTrailers(g) {
  const ul = $('#trailers');
  ul.innerHTML = '';
  const list = g.trailers.filter((t) => t.hls || t.mp4);
  if (!list.length) {
    ul.innerHTML = '<p class="empty-note">This game has no trailers on its store page.</p>';
    return;
  }
  for (const t of list) {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => (img.style.visibility = 'hidden');
    if (t.thumbnail) img.src = proxied(t.thumbnail);

    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 't-name';
    name.textContent = t.name;
    if (t.highlight) {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = 'Featured';
      name.appendChild(b);
    }
    const meta = document.createElement('div');
    meta.className = 't-meta';
    meta.textContent = 'MP4';
    info.append(name, meta);
    sizeQueue = sizeQueue.then(() =>
      trailerSize(t)
        .then((n) => {
          t.size = n;
          if (meta.textContent === 'MP4') meta.textContent = `MP4 · ${mb(n)}`;
        })
        .catch(() => {}),
    );

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Download MP4';
    btn.addEventListener('click', () => downloadTrailer(t, btn, meta));

    li.append(img, info, btn);
    ul.appendChild(li);
  }
}

async function downloadTrailer(t, btn, meta) {
  const filename = `${slug(state.game.name)} - ${slug(t.name)}`;
  btn.disabled = true;
  meta.className = 't-meta';
  meta.textContent = 'Starting…';
  try {
    const blob = await buildTrailerMp4(t, (msg) => (meta.textContent = msg));
    saveBlob(blob, `${filename}.mp4`);
    meta.className = 't-meta ok';
    meta.textContent = `Saved ${filename}.mp4 · ${mb(blob.size)}`;
  } catch (e) {
    meta.className = 't-meta err';
    meta.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- Extra art ---------------- */

function renderExtras(g) {
  const wrap = $('#extras');
  wrap.innerHTML = '';
  const base = slug(g.name);
  const items = [
    ['Library hero', g.images.hero],
    ['Store header', g.images.header],
    ['Page background', g.images.background],
    ...g.screenshots.map((s, i) => [`Screenshot ${i + 1}`, s]),
  ].filter(([, src]) => src);

  for (const [label, src] of items) {
    const a = document.createElement('a');
    a.className = 'extra';
    a.href = proxiedDownload(src, `${base} - ${label}.${extOf(src)}`);
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = label;
    img.onerror = () => {
      img.replaceWith(Object.assign(document.createElement('div'), { className: 'extra-missing', textContent: 'Preview unavailable' }));
    };
    img.src = proxied(src);
    const cap = document.createElement('span');
    cap.innerHTML = `<b></b><em>Download ↓</em>`;
    cap.querySelector('b').textContent = label;
    a.append(img, cap);
    wrap.appendChild(a);
  }
}

/* ---------------- Price tag (Steam search / wishlist row) ---------------- */

const PRICE = {
  bgLeft: '#1b2838',
  bgRight: '#213245',
  name: '#ffffff',
  badgeBg: '#4c6b22',
  badgeText: '#beee11',
  priceBg: 'rgba(0, 0, 0, 0.25)',
  original: '#738895',
  final: '#ffffff',
  muted: '#c6d4df',
};

function drawPriceTag() {
  const g = state.game;
  const canvas = $('#priceCanvas');
  const cap = state.images.capsule;
  const withBg = $('#priceBg').checked;
  const S = 3;
  const PAD = 10;
  const CAP_H = 60;
  const CAP_W = cap ? Math.round((CAP_H * cap.width) / cap.height) : 0;
  const TEXT_X = PAD + CAP_W + (cap ? 16 : 0);
  const NAME_MAX = 260;
  const ROW_H = 28;

  const m = document.createElement('canvas').getContext('2d');
  m.font = `600 17px ${STEAM.font}`;
  let nameLines = wrapText(m, g.name, NAME_MAX);
  if (nameLines.length > 2) {
    let second = nameLines.slice(1).join(' ');
    while (m.measureText(second + '…').width > NAME_MAX && second.length) second = second.slice(0, -1);
    nameLines = [nameLines[0], second.trimEnd() + '…'];
  }
  const nameW = Math.max(...nameLines.map((l) => m.measureText(l).width));

  // Measure the price row.
  const p = g.price;
  const discounted = p.state === 'paid' && p.discount > 0;
  m.font = `700 18px ${STEAM.font}`;
  const badgeText = discounted ? `-${p.discount}%` : '';
  const badgeW = discounted ? m.measureText(badgeText).width + 16 : 0;
  m.font = `12px ${STEAM.font}`;
  const origW = discounted ? m.measureText(p.initial).width : 0;
  m.font = `16px ${STEAM.font}`;
  const finalText = p.state === 'paid' ? p.final : p.label;
  const finalW = m.measureText(finalText).width;
  const priceBoxW = (discounted ? origW + 8 : 0) + finalW + 20;
  const rowW = badgeW + priceBoxW;

  const NAME_LH = 21;
  const blockH = nameLines.length * NAME_LH + 8 + ROW_H;
  const H = Math.max(CAP_H, blockH) + PAD * 2;
  const W = Math.ceil(TEXT_X + Math.max(nameW, rowW) + PAD + 8);

  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);
  ctx.clearRect(0, 0, W, H);

  if (withBg) {
    const bg = ctx.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, PRICE.bgLeft);
    bg.addColorStop(1, PRICE.bgRight);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  if (cap) ctx.drawImage(cap, PAD, (H - CAP_H) / 2, CAP_W, CAP_H);

  let y = (H - blockH) / 2;
  ctx.textBaseline = 'top';
  ctx.font = `600 17px ${STEAM.font}`;
  ctx.fillStyle = PRICE.name;
  for (const line of nameLines) {
    ctx.fillText(line, TEXT_X, y + 1);
    y += NAME_LH;
  }
  y += 8;

  let x = TEXT_X;
  ctx.textBaseline = 'middle';
  const mid = y + ROW_H / 2;
  if (discounted) {
    ctx.fillStyle = PRICE.badgeBg;
    ctx.fillRect(x, y, badgeW, ROW_H);
    ctx.font = `700 18px ${STEAM.font}`;
    ctx.fillStyle = PRICE.badgeText;
    ctx.fillText(badgeText, x + 8, mid + 1);
    x += badgeW;
  }
  ctx.fillStyle = PRICE.priceBg;
  ctx.fillRect(x, y, priceBoxW, ROW_H);
  x += 10;
  if (discounted) {
    ctx.font = `12px ${STEAM.font}`;
    ctx.fillStyle = PRICE.original;
    ctx.fillText(p.initial, x, mid);
    ctx.fillRect(x - 1, Math.round(mid) - 0.5, origW + 2, 1); // strikethrough
    x += origW + 8;
  }
  ctx.font = `16px ${STEAM.font}`;
  ctx.fillStyle = p.state === 'paid' ? PRICE.final : PRICE.muted;
  ctx.fillText(finalText, x, mid + 1);

  $('#priceTag').textContent = discounted ? `-${p.discount}% · 3× PNG` : '3× PNG';
}

$('#priceBg').addEventListener('change', () => state.game && drawPriceTag());

$('#priceDl').addEventListener('click', () => {
  if (!state.game) return;
  const p = state.game.price;
  const suffix = p.state === 'paid' && p.discount ? ` (-${p.discount}%)` : '';
  saveCanvas($('#priceCanvas'), `${slug(state.game.name)} - Price${suffix}.png`);
});

/* ---------------- Region (currency) ---------------- */

const regionSel = $('#region');
try {
  const saved = localStorage.getItem('steamkit.region');
  if (saved && [...regionSel.options].some((o) => o.value === saved)) regionSel.value = saved;
} catch {}
regionSel.addEventListener('change', () => {
  try {
    localStorage.setItem('steamkit.region', regionSel.value);
  } catch {}
  if (state.game && $('#url').value.trim()) $('#lookup').requestSubmit();
});

/* ---------------- Deep link: ?app=548430[&cc=ca] ---------------- */

const params = new URLSearchParams(location.search);
const preset = params.get('app');
const presetCc = params.get('cc');
if (presetCc && [...regionSel.options].some((o) => o.value === presetCc)) regionSel.value = presetCc;
if (preset) {
  $('#url').value = `https://store.steampowered.com/app/${preset}/`;
  $('#lookup').requestSubmit();
}
