// Comment card generator: YouTube / Instagram / TikTok-style comments rendered on a canvas.
// Original, simplified recreations of each layout (no platform logos), exported at 3×.
const $ = (sel) => document.querySelector(sel);
const S = 3; // export scale

const ICONS = {
  thumb:
    'M7.5 10.5V20H4.8A1.3 1.3 0 0 1 3.5 18.7v-6.9A1.3 1.3 0 0 1 4.8 10.5h2.7zm0 0 3.9-6.6a1.9 1.9 0 0 1 3.4 1.4l-.8 4.4h4.6a2 2 0 0 1 2 2.4l-1.3 6.6a2 2 0 0 1-2 1.8H7.5',
  heart:
    'M12 20.3s-7.3-4.4-9-8.9C1.7 8.1 3.7 4.8 7.1 4.8c2 0 3.4 1 4.9 2.9 1.5-1.9 2.9-2.9 4.9-2.9 3.4 0 5.4 3.3 4.1 6.6-1.7 4.5-9 8.9-9 8.9z',
  check: 'M7.4 12.3l3 3 6.3-6.6',
};

const PLATFORMS = {
  youtube: {
    width: 520,
    font: 'Roboto, Arial, sans-serif',
    defaults: { time: '14 hours ago' },
    light: { bg: '#ffffff', text: '#0f0f0f', muted: '#606060', badge: '#606060' },
    dark: { bg: '#0f0f0f', text: '#f1f1f1', muted: '#aaaaaa', badge: '#aaaaaa' },
  },
  instagram: {
    width: 460,
    font: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    defaults: { time: '14h' },
    light: { bg: '#ffffff', text: '#000000', muted: '#737373', badge: '#0095f6' },
    dark: { bg: '#000000', text: '#f5f5f5', muted: '#a8a8a8', badge: '#0095f6' },
  },
  tiktok: {
    width: 460,
    font: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    defaults: { time: '14h' },
    light: { bg: '#ffffff', text: '#161823', muted: '#8a8b91', badge: '#20d5ec' },
    dark: { bg: '#121212', text: '#ffffff', muted: '#8a8b91', badge: '#20d5ec' },
  },
};

const state = { platform: 'youtube', theme: 'light', avatar: null, creator: null };

/* ---------------- helpers ---------------- */

function hashColor(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const hues = [4, 24, 45, 140, 170, 200, 220, 262, 290, 330];
  return `hsl(${hues[h % hues.length]} 62% 52%)`;
}

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      const test = line + word;
      if (ctx.measureText(test).width > maxW && line.trim()) {
        out.push(line.trimEnd());
        line = word.trimStart();
        // Break very long words (URLs etc.)
        while (ctx.measureText(line).width > maxW) {
          let i = line.length;
          while (i > 1 && ctx.measureText(line.slice(0, i)).width > maxW) i--;
          out.push(line.slice(0, i));
          line = line.slice(i);
        }
      } else line = test;
    }
    out.push(line.trimEnd());
  }
  return out;
}

function drawAvatar(ctx, img, name, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    const s = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, x, y, size, size);
  } else {
    const clean = String(name || '?').replace(/^@/, '');
    ctx.fillStyle = hashColor(clean);
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#fff';
    ctx.font = `500 ${Math.round(size * 0.48)}px Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText([...clean][0]?.toUpperCase() || '?', x + size / 2, y + size / 2 + size * 0.03);
  }
  ctx.restore();
}

function icon(ctx, name, x, y, size, { stroke, fill, lineWidth = 1.7, rotate = 0 } = {}) {
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  if (rotate) ctx.rotate(rotate);
  ctx.scale(size / 24, size / 24);
  ctx.translate(-12, -12);
  const p = new Path2D(ICONS[name]);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill(p);
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(p);
  }
  ctx.restore();
}

function badge(ctx, x, y, size, color, style) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  icon(ctx, 'check', x, y, size, { stroke: style === 'youtube' ? (color === '#606060' ? '#fff' : '#0f0f0f') : '#fff', lineWidth: 2.6 });
}

/* ---------------- readers ---------------- */

function read() {
  const p = state.platform;
  let name = $('#cmName').value.trim() || 'username';
  if (p === 'youtube') name = name.startsWith('@') ? name : `@${name}`;
  else name = name.replace(/^@/, '');
  return {
    name,
    text: $('#cmText').value.replace(/\r/g, '') || 'Your comment here',
    time: $('#cmTime').value.trim(),
    likes: $('#cmLikes').value.trim(),
    heart: $('#cmHeart').checked,
    verified: $('#cmVerified').checked,
    bg: $('#cmBg').checked,
  };
}

/* ---------------- renderers (logical px; caller scales) ---------------- */

function layoutYouTube(ctx, d, c, W, draw) {
  const PAD = 16, AV = 40, X = PAD + AV + 16, MAXW = W - X - PAD;
  const F = PLATFORMS.youtube.font;
  ctx.font = `400 14px ${F}`;
  const lines = wrap(ctx, d.text, MAXW);
  const textTop = PAD + 22;
  const actionsTop = textTop + lines.length * 20 + 6;
  const H = actionsTop + 32 + PAD - 4;
  if (!draw) return H;

  drawAvatar(ctx, state.avatar, d.name, PAD, PAD, AV);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  let x = X;
  ctx.font = `500 13px ${F}`;
  ctx.fillStyle = c.text;
  ctx.fillText(d.name, x, PAD + 14);
  x += ctx.measureText(d.name).width + 4;
  if (d.verified) {
    badge(ctx, x, PAD + 3, 12, c.badge, 'youtube');
    x += 16;
  }
  if (d.time) {
    ctx.font = `400 12px ${F}`;
    ctx.fillStyle = c.muted;
    ctx.fillText(d.time, x + 2, PAD + 14);
  }
  ctx.font = `400 14px ${F}`;
  ctx.fillStyle = c.text;
  lines.forEach((l, i) => ctx.fillText(l, X, textTop + 14 + i * 20));

  // actions
  const ay = actionsTop + 6;
  icon(ctx, 'thumb', X - 2, ay, 20, { stroke: c.text, lineWidth: 1.6 });
  let ax = X + 26;
  if (d.likes && d.likes !== '0') {
    ctx.font = `400 12px ${F}`;
    ctx.fillStyle = c.muted;
    ctx.fillText(d.likes, ax, ay + 14);
    ax += ctx.measureText(d.likes).width + 14;
  } else ax += 6;
  icon(ctx, 'thumb', ax, ay, 20, { stroke: c.text, lineWidth: 1.6, rotate: Math.PI });
  ax += 36;
  if (d.heart) {
    drawAvatar(ctx, state.creator, 'You', ax, ay, 18);
    icon(ctx, 'heart', ax + 9, ay + 7, 13, { fill: '#ff0033', stroke: c.bg, lineWidth: 3.2 });
    icon(ctx, 'heart', ax + 9, ay + 7, 13, { fill: '#ff0033' });
    ax += 38;
  }
  ctx.font = `500 12px ${F}`;
  ctx.fillStyle = c.text;
  ctx.fillText('Reply', ax + 6, ay + 14);
  return H;
}

function layoutInstagram(ctx, d, c, W, draw) {
  const PAD = 16, AV = 34, X = PAD + AV + 12, RIGHT = 34, MAXW = W - X - PAD - RIGHT;
  const F = PLATFORMS.instagram.font;
  ctx.font = `400 14px ${F}`;
  const lines = wrap(ctx, d.text, MAXW);
  const textTop = PAD + 20;
  const metaTop = textTop + lines.length * 19 + 6;
  const H = metaTop + 18 + PAD;
  if (!draw) return H;

  drawAvatar(ctx, state.avatar, d.name, PAD, PAD, AV);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  let x = X;
  ctx.font = `600 13px ${F}`;
  ctx.fillStyle = c.text;
  ctx.fillText(d.name, x, PAD + 13);
  x += ctx.measureText(d.name).width + 4;
  if (d.verified) {
    badge(ctx, x, PAD + 2, 12, c.badge);
    x += 16;
  }
  if (d.time) {
    ctx.font = `400 13px ${F}`;
    ctx.fillStyle = c.muted;
    ctx.fillText(d.time, x + 3, PAD + 13);
  }
  ctx.font = `400 14px ${F}`;
  ctx.fillStyle = c.text;
  lines.forEach((l, i) => ctx.fillText(l, X, textTop + 14 + i * 19));

  ctx.font = `600 12px ${F}`;
  ctx.fillStyle = c.muted;
  let mx = X;
  ctx.fillText('Reply', mx, metaTop + 12);
  mx += ctx.measureText('Reply').width + 16;
  if (d.heart) {
    ctx.font = `400 12px ${F}`;
    drawAvatar(ctx, state.creator, 'You', mx, metaTop, 14);
    icon(ctx, 'heart', mx + 8, metaTop + 6, 10, { fill: '#ff3040', stroke: c.bg, lineWidth: 3 });
    icon(ctx, 'heart', mx + 8, metaTop + 6, 10, { fill: '#ff3040' });
    ctx.fillText('by creator', mx + 22, metaTop + 12);
  }

  // like column
  const hx = W - PAD - 22;
  icon(ctx, 'heart', hx + 3, PAD + 10, 16, { stroke: c.muted, lineWidth: 1.8 });
  if (d.likes && d.likes !== '0') {
    ctx.font = `400 12px ${F}`;
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'center';
    ctx.fillText(d.likes, hx + 11, PAD + 42);
    ctx.textAlign = 'left';
  }
  return H;
}

function layoutTikTok(ctx, d, c, W, draw) {
  const PAD = 16, AV = 40, X = PAD + AV + 12, RIGHT = 38, MAXW = W - X - PAD - RIGHT;
  const F = PLATFORMS.tiktok.font;
  ctx.font = `400 15px ${F}`;
  const lines = wrap(ctx, d.text, MAXW);
  const textTop = PAD + 21;
  const metaTop = textTop + lines.length * 21 + 6;
  const heartRow = d.heart ? 22 : 0;
  const H = metaTop + 18 + heartRow + PAD;
  if (!draw) return H;

  drawAvatar(ctx, state.avatar, d.name, PAD, PAD, AV);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  let x = X;
  ctx.font = `500 13px ${F}`;
  ctx.fillStyle = c.muted;
  ctx.fillText(d.name, x, PAD + 13);
  x += ctx.measureText(d.name).width + 4;
  if (d.verified) badge(ctx, x, PAD + 2, 12, c.badge);

  ctx.font = `400 15px ${F}`;
  ctx.fillStyle = c.text;
  lines.forEach((l, i) => ctx.fillText(l, X, textTop + 15 + i * 21));

  ctx.font = `400 13px ${F}`;
  ctx.fillStyle = c.muted;
  let mx = X;
  if (d.time) {
    ctx.fillText(d.time, mx, metaTop + 13);
    mx += ctx.measureText(d.time).width + 18;
  }
  ctx.font = `600 13px ${F}`;
  ctx.fillText('Reply', mx, metaTop + 13);

  if (d.heart) {
    const hy = metaTop + 22;
    icon(ctx, 'heart', X, hy, 13, { fill: '#fe2c55' });
    ctx.font = `400 12px ${F}`;
    ctx.fillStyle = c.muted;
    ctx.fillText('Liked by creator', X + 18, hy + 11);
  }

  const hx = W - PAD - 24;
  icon(ctx, 'heart', hx + 2, PAD + 14, 20, { stroke: c.muted, lineWidth: 1.7 });
  if (d.likes && d.likes !== '0') {
    ctx.font = `400 12px ${F}`;
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'center';
    ctx.fillText(d.likes, hx + 12, PAD + 50);
    ctx.textAlign = 'left';
  }
  return H;
}

const LAYOUTS = { youtube: layoutYouTube, instagram: layoutInstagram, tiktok: layoutTikTok };

function render() {
  const canvas = $('#cmCanvas');
  const d = read();
  const P = PLATFORMS[state.platform];
  const c = P[state.theme];
  const W = P.width;
  const m = document.createElement('canvas').getContext('2d');
  const H = Math.ceil(LAYOUTS[state.platform](m, d, c, W, false));

  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);
  ctx.clearRect(0, 0, W, H);
  if (d.bg) {
    ctx.fillStyle = c.bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 14);
    ctx.fill();
  }
  LAYOUTS[state.platform](ctx, d, c, W, true);

  // Avatar thumbnails in the form
  for (const [id, img, nm] of [['#cmAvatarThumb', state.avatar, d.name], ['#cmCreatorThumb', state.creator, 'You']]) {
    const t = $(id).getContext('2d');
    t.clearRect(0, 0, 80, 80);
    drawAvatar(t, img, nm, 0, 0, 80);
  }
  $('#cmAvatarClear').hidden = !state.avatar;
  $('#cmCreatorClear').hidden = !state.creator;
  $('#cmCreatorField').hidden = !d.heart || state.platform === 'tiktok';
}

/* ---------------- images ---------------- */

function fileToImage(file, max = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Downscale to a square so it's light to keep around.
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = Math.min(max, s);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const out = new Image();
      out.onload = () => resolve({ img: out, dataUrl: c.toDataURL('image/png') });
      out.src = c.toDataURL('image/png');
    };
    img.onerror = () => reject(new Error('That file isn’t an image.'));
    img.src = url;
  });
}

function loadDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

$('#cmAvatar').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    state.avatar = (await fileToImage(f)).img;
  } catch (err) {
    alert(err.message);
  }
  e.target.value = '';
  render();
});
$('#cmAvatarClear').addEventListener('click', () => {
  state.avatar = null;
  render();
});
$('#cmCreator').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const { img, dataUrl } = await fileToImage(f, 128);
    state.creator = img;
    try {
      localStorage.setItem('comments.creator', dataUrl);
    } catch {}
  } catch (err) {
    alert(err.message);
  }
  e.target.value = '';
  render();
});
$('#cmCreatorClear').addEventListener('click', () => {
  state.creator = null;
  try {
    localStorage.removeItem('comments.creator');
  } catch {}
  render();
});

/* ---------------- controls ---------------- */

function setSeg(groupId, value) {
  for (const b of document.querySelectorAll(`${groupId} button`)) b.classList.toggle('on', b.dataset.v === value);
}

for (const b of document.querySelectorAll('#cmPlatform button')) {
  b.addEventListener('click', () => {
    const prev = state.platform;
    state.platform = b.dataset.v;
    setSeg('#cmPlatform', state.platform);
    // Swap the default time style if the user hasn't changed it.
    const t = $('#cmTime');
    if (t.value === PLATFORMS[prev].defaults.time) t.value = PLATFORMS[state.platform].defaults.time;
    save();
    render();
  });
}
for (const b of document.querySelectorAll('#cmTheme button')) {
  b.addEventListener('click', () => {
    state.theme = b.dataset.v;
    setSeg('#cmTheme', state.theme);
    save();
    render();
  });
}
$('#cmForm').addEventListener('input', render);
$('#cmForm').addEventListener('submit', (e) => e.preventDefault());

function fileBase() {
  const d = read();
  const who = d.name.replace(/^@/, '').replace(/[\\/:*?"<>|]+/g, '').slice(0, 40) || 'comment';
  const plat = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' }[state.platform];
  return `${who} - ${plat} comment`;
}

$('#cmDl').addEventListener('click', () => {
  $('#cmCanvas').toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileBase()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }, 'image/png');
});

$('#cmCopy').addEventListener('click', async () => {
  const btn = $('#cmCopy');
  try {
    const blob = await new Promise((r) => $('#cmCanvas').toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    btn.textContent = 'Copied!';
  } catch {
    btn.textContent = 'Copy not supported — use Download';
  }
  setTimeout(() => (btn.textContent = 'Copy image'), 1800);
});

/* ---------------- persistence ---------------- */

function save() {
  try {
    localStorage.setItem('comments.opts', JSON.stringify({ platform: state.platform, theme: state.theme }));
  } catch {}
}

(async () => {
  try {
    const o = JSON.parse(localStorage.getItem('comments.opts') || '{}');
    if (o.platform in PLATFORMS) {
      state.platform = o.platform;
      $('#cmTime').value = PLATFORMS[o.platform].defaults.time;
    }
    if (o.theme === 'dark' || o.theme === 'light') state.theme = o.theme;
    const cr = localStorage.getItem('comments.creator');
    if (cr) state.creator = await loadDataUrl(cr);
  } catch {}
  setSeg('#cmPlatform', state.platform);
  setSeg('#cmTheme', state.theme);
  render();
  // Re-render once Roboto has loaded so the canvas uses it.
  try {
    await document.fonts.load('400 14px Roboto');
    await document.fonts.load('500 13px Roboto');
  } catch {}
  render();
})();
