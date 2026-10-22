import { buildTrailerMp4 } from './trailer.js';

const $ = (sel) => document.querySelector(sel);
const state = { game: null, caseStyle: 'front', images: {} };

const proxied = (src) => `/api/file?src=${encodeURIComponent(src)}`;
const proxiedDownload = (src, name) => `${proxied(src)}&download=${encodeURIComponent(name)}`;
const extOf = (url) => (new URL(url).pathname.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || 'jpg').toLowerCase();
const slug = (s) => String(s || 'game').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();

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

$('#lookup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('#url').value.trim();
  if (!url) return;
  $('#go').disabled = true;
  setStatus('Asking Steam…');
  try {
    const res = await fetch(`/api/game?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    state.game = data;
    await render(data);
    setStatus('');
    history.replaceState(null, '', `?app=${data.appid}`);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    $('#go').disabled = false;
  }
});

async function render(g) {
  $('#results').hidden = false;
  $('#gameName').textContent = g.name;
  $('#storeLink').href = g.storeUrl;
  const base = slug(g.name);

  // Logo
  showImageOrEmpty($('#logoImg'), g.images.logo, 'This game has no library logo on Steam.');
  setDownloadLink($('#logoDl'), g.images.logo, `${base} - Logo.png`);

  // Cover
  showImageOrEmpty($('#coverImg'), g.images.cover, 'No 600×900 library cover — using the header for the case.');
  setDownloadLink($('#coverDl'), g.images.cover, `${base} - Cover.${g.images.cover ? extOf(g.images.cover) : 'jpg'}`);

  // Images needed for canvases
  state.images = {};
  const [header, cover] = await Promise.all([
    g.images.header ? loadImage(proxied(g.images.header)).catch(() => null) : null,
    g.images.cover ? loadImage(proxied(g.images.cover)).catch(() => null) : null,
  ]);
  state.images = { header, cover: cover || header };

  drawInfoCard();
  drawCase();
  renderTrailers(g);
  renderExtras(g);
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

function drawCase() {
  const out = $('#caseCanvas');
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

document.querySelectorAll('.seg button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
    state.caseStyle = b.dataset.style;
    if (state.game) drawCase();
  })
);

$('#caseDl').addEventListener('click', () => {
  if (state.game) saveCanvas($('#caseCanvas'), `${slug(state.game.name)} - Case ${state.caseStyle === 'front' ? 'Front' : 'Angled'}.png`);
});

/* ---------------- Trailers ---------------- */

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
    meta.textContent = t.hls ? 'HLS stream → MP4 (no re-encode)' : 'Direct MP4';
    info.append(name, meta);

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
    meta.textContent = `Saved ${filename}.mp4`;
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
    img.src = proxied(src);
    const cap = document.createElement('span');
    cap.innerHTML = `<b></b><em>Download ↓</em>`;
    cap.querySelector('b').textContent = label;
    a.append(img, cap);
    wrap.appendChild(a);
  }
}

/* ---------------- Deep link: ?app=548430 ---------------- */

const preset = new URLSearchParams(location.search).get('app');
if (preset) {
  $('#url').value = `https://store.steampowered.com/app/${preset}/`;
  $('#lookup').requestSubmit();
}
