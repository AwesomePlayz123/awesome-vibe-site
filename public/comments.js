// Comment Cards: YouTube / Instagram / TikTok comments rendered on a canvas, in two styles:
//   • Compact – our recreation, sized close to the real apps
//   • Bold    – the larger layouts from the vibe-tools Comment Generator (comment-bold.js)
// Both use the same form. Original, simplified layouts (no platform logos), exported at 3×.
import { renderBold, silhouette } from './comment-bold.js';

const $ = (sel) => document.querySelector(sel);
const S = 3; // export scale

const ICONS = {
  thumb:
    'M7.5 10.5V20H4.8A1.3 1.3 0 0 1 3.5 18.7v-6.9A1.3 1.3 0 0 1 4.8 10.5h2.7zm0 0 3.9-6.6a1.9 1.9 0 0 1 3.4 1.4l-.8 4.4h4.6a2 2 0 0 1 2 2.4l-1.3 6.6a2 2 0 0 1-2 1.8H7.5',
  heart:
    'M12 20.3s-7.3-4.4-9-8.9C1.7 8.1 3.7 4.8 7.1 4.8c2 0 3.4 1 4.9 2.9 1.5-1.9 2.9-2.9 4.9-2.9 3.4 0 5.4 3.3 4.1 6.6-1.7 4.5-9 8.9-9 8.9z',
  check: 'M7.4 12.3l3 3 6.3-6.6',
  pin: 'M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z',
};

// Labels in each language (shared with the Bold style).
const TR = {
  en: { replying: 'Replying to', reply: 'Reply', pinnedBy: 'Pinned by', creator: 'Creator', pinned: 'Pinned', liked: 'Liked by creator', byCreator: 'by creator' },
  es: { replying: 'Respondiendo a', reply: 'Responder', pinnedBy: 'Fijado por', creator: 'Creador', pinned: 'Fijado', liked: 'Le gusta al creador', byCreator: 'del creador' },
  fr: { replying: 'En réponse à', reply: 'Répondre', pinnedBy: 'Épinglé par', creator: 'Créateur', pinned: 'Épinglé', liked: 'Aimé par le créateur', byCreator: 'par le créateur' },
  de: { replying: 'Antwort an', reply: 'Antworten', pinnedBy: 'Angeheftet von', creator: 'Creator', pinned: 'Angeheftet', liked: 'Vom Creator geliked', byCreator: 'vom Creator' },
  pt: { replying: 'Respondendo a', reply: 'Responder', pinnedBy: 'Fixado por', creator: 'Criador', pinned: 'Fixado', liked: 'Curtido pelo criador', byCreator: 'do criador' },
  it: { replying: 'In risposta a', reply: 'Rispondi', pinnedBy: 'Fissato da', creator: 'Creator', pinned: 'Fissato', liked: 'Piace al creator', byCreator: 'dal creator' },
};

const SYSTEM = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const FAMILIES = { inter: `"Inter", ${SYSTEM}`, roboto: 'Roboto, Arial, sans-serif', figtree: `"Figtree", ${SYSTEM}`, system: SYSTEM };
const BOLD_DEFAULT_FONT = { instagram: 'inter', youtube: 'roboto', tiktok: 'figtree' };

const BADGES = {
  youtube: [['none', 'No badge'], ['verified', 'Verified'], ['creator', 'Channel owner'], ['pinned', 'Pinned']],
  instagram: [['none', 'No badge'], ['verified', 'Verified'], ['creator', 'Creator'], ['pinned', 'Pinned']],
  tiktok: [['none', 'No badge'], ['verified', 'Verified'], ['creator', 'Creator'], ['pinned', 'Pinned']],
};
const THEMES = {
  youtube: [['light', 'Light'], ['dark', 'Dark']],
  instagram: [['white', 'White'], ['black', 'Black'], ['blue', 'Blue']],
  tiktok: [['light', 'Light'], ['dark', 'Dark']],
};

const PLATFORMS = {
  youtube: {
    width: 520,
    font: 'Roboto, Arial, sans-serif',
    defaults: { time: '14 hours ago' },
    light: { bg: '#ffffff', text: '#0f0f0f', muted: '#606060', badge: '#606060', chip: 'rgba(0,0,0,.07)' },
    dark: { bg: '#0f0f0f', text: '#f1f1f1', muted: '#aaaaaa', badge: '#aaaaaa', chip: 'rgba(255,255,255,.14)' },
  },
  instagram: {
    width: 460,
    font: SYSTEM,
    defaults: { time: '14h' },
    white: { bg: '#ffffff', text: '#000000', muted: '#737373', badge: '#0095f6', chip: 'rgba(128,128,138,.18)' },
    black: { bg: '#000000', text: '#f5f5f5', muted: '#a8a8a8', badge: '#0095f6', chip: 'rgba(128,128,138,.3)' },
    blue: { bg: '#0095f6', text: '#ffffff', muted: 'rgba(255,255,255,.78)', badge: '#ffffff', chip: 'rgba(255,255,255,.22)' },
  },
  tiktok: {
    width: 460,
    font: SYSTEM,
    defaults: { time: '14h' },
    light: { bg: '#ffffff', text: '#161823', muted: '#8a8b91', badge: '#20d5ec' },
    dark: { bg: '#121212', text: '#ffffff', muted: '#8a8b91', badge: '#20d5ec' },
  },
};

const state = {
  platform: 'youtube',
  themes: { youtube: 'light', instagram: 'white', tiktok: 'light' },
  avatar: null,
  creator: null,
};

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

// The avatar as an image the Bold renderer can draw (uses the coloured initial when none is uploaded).
function avatarImage(img, name) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  drawAvatar(c.getContext('2d'), img, name, 0, 0, 256);
  return c;
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

function verifiedBadge(ctx, x, y, size, color, checkColor) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  icon(ctx, 'check', x, y, size, { stroke: checkColor, lineWidth: 2.6 });
}

// Small rounded label (Instagram "Creator" / "Pinned"). Returns its width.
function pill(ctx, text, x, y, c, F, draw) {
  ctx.font = `600 10px ${F}`;
  const w = ctx.measureText(text).width + 12;
  if (draw) {
    ctx.fillStyle = c.chip;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 16, 8);
    ctx.fill();
    ctx.fillStyle = c.muted;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 6, y + 8.5);
    ctx.textBaseline = 'alphabetic';
  }
  return w;
}

/* ---------------- form ---------------- */

function fontFor(style) {
  const f = $('#cmFont').value;
  if (f !== 'default') return FAMILIES[f];
  return style === 'bold' ? FAMILIES[BOLD_DEFAULT_FONT[state.platform]] : PLATFORMS[state.platform].font;
}

function read() {
  const p = state.platform;
  const raw = $('#cmName').value.trim();
  let name = raw || 'username';
  if (p === 'youtube') name = name.startsWith('@') ? name : `@${name}`;
  else name = name.replace(/^@/, '');
  return {
    raw,
    name,
    text: $('#cmText').value.replace(/\r/g, '').trim() || 'Your comment here',
    time: $('#cmTime').value.trim(),
    likes: $('#cmLikes').value.trim(),
    replyTo: $('#cmReplyTo').value.trim().replace(/^@/, ''),
    channel: $('#cmChannel').value.trim(),
    badge: $('#cmBadge').value || 'none',
    theme: $('#cmTheme').value,
    tr: TR[$('#cmLang').value] || TR.en,
    heart: $('#cmHeart').checked,
    bg: $('#cmBg').checked,
    shadow: $('#cmShadow').checked,
  };
}

/* ---------------- Compact renderers (logical px; caller scales) ---------------- */

function layoutYouTube(ctx, d, c, W, draw, F) {
  const PAD = 16, AV = 40, X = PAD + AV + 16, MAXW = W - X - PAD;
  const pinH = d.badge === 'pinned' ? 24 : 0;
  ctx.font = `400 14px ${F}`;
  const lines = wrap(ctx, d.text, MAXW);
  const top = PAD + pinH;
  const textTop = top + 22;
  const actionsTop = textTop + lines.length * 20 + 6;
  const H = actionsTop + 32 + PAD - 4;
  if (!draw) return H;

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (pinH) {
    icon(ctx, 'pin', X - 2, PAD - 1, 14, { fill: c.muted });
    ctx.font = `400 12px ${F}`;
    ctx.fillStyle = c.muted;
    const who = d.channel ? (d.channel.startsWith('@') ? d.channel : `@${d.channel}`) : 'creator';
    ctx.fillText(`${d.tr.pinnedBy} ${who}`, X + 16, PAD + 10);
  }
  drawAvatar(ctx, state.avatar, d.name, PAD, top, AV);
  let x = X;
  ctx.font = `500 13px ${F}`;
  const nameW = ctx.measureText(d.name).width;
  if (d.badge === 'creator') {
    ctx.fillStyle = c.chip;
    ctx.beginPath();
    ctx.roundRect(x - 1, top + 1, nameW + 14, 19, 10);
    ctx.fill();
    ctx.fillStyle = c.text;
    ctx.fillText(d.name, x + 6, top + 14);
    x += nameW + 18;
  } else {
    ctx.fillStyle = c.text;
    ctx.fillText(d.name, x, top + 14);
    x += nameW + 4;
  }
  if (d.badge === 'verified') {
    verifiedBadge(ctx, x, top + 3, 12, c.badge, c.bg);
    x += 16;
  }
  if (d.time) {
    ctx.font = `400 12px ${F}`;
    ctx.fillStyle = c.muted;
    ctx.fillText(d.time, x + 2, top + 14);
  }
  ctx.font = `400 14px ${F}`;
  ctx.fillStyle = c.text;
  lines.forEach((l, i) => ctx.fillText(l, X, textTop + 14 + i * 20));

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
  ctx.fillText(d.tr.reply, ax + 6, ay + 14);
  return H;
}

function layoutInstagram(ctx, d, c, W, draw, F) {
  const PAD = 16, AV = 34, X = PAD + AV + 12, RIGHT = 34, MAXW = W - X - PAD - RIGHT;
  ctx.font = `400 14px ${F}`;
  const lines = wrap(ctx, d.text, MAXW);
  const textTop = PAD + 20;
  const replyH = d.replyTo ? 19 : 0;
  const metaTop = textTop + lines.length * 19 + replyH + 6;
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
  if (d.badge === 'verified') {
    verifiedBadge(ctx, x, PAD + 2, 12, c.badge, state.themes.instagram === 'blue' ? '#0095f6' : '#fff');
    x += 16;
  } else if (d.badge === 'creator' || d.badge === 'pinned') {
    x += pill(ctx, d.badge === 'creator' ? d.tr.creator : d.tr.pinned, x + 2, PAD + 1, c, F, true) + 6;
  }
  if (d.time) {
    ctx.font = `400 13px ${F}`;
    ctx.fillStyle = c.muted;
    ctx.fillText(d.time, x + 3, PAD + 13);
  }
  ctx.font = `400 14px ${F}`;
  ctx.fillStyle = c.text;
  lines.forEach((l, i) => ctx.fillText(l, X, textTop + 14 + i * 19));
  if (d.replyTo) {
    ctx.font = `400 13px ${F}`;
    ctx.fillStyle = c.muted;
    ctx.fillText(`${d.tr.replying} @${d.replyTo}`, X, textTop + lines.length * 19 + 15);
  }

  ctx.font = `600 12px ${F}`;
  ctx.fillStyle = c.muted;
  let mx = X;
  ctx.fillText(d.tr.reply, mx, metaTop + 12);
  mx += ctx.measureText(d.tr.reply).width + 16;
  if (d.heart) {
    ctx.font = `400 12px ${F}`;
    drawAvatar(ctx, state.creator, 'You', mx, metaTop, 14);
    icon(ctx, 'heart', mx + 8, metaTop + 6, 10, { fill: '#ff3040', stroke: c.bg, lineWidth: 3 });
    icon(ctx, 'heart', mx + 8, metaTop + 6, 10, { fill: '#ff3040' });
    ctx.fillStyle = c.muted;
    ctx.fillText(d.tr.byCreator, mx + 22, metaTop + 12);
  }

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

function layoutTikTok(ctx, d, c, W, draw, F) {
  const PAD = 16, AV = 40, X = PAD + AV + 12, RIGHT = 38, MAXW = W - X - PAD - RIGHT;
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
  if (d.badge === 'verified') verifiedBadge(ctx, x, PAD + 2, 12, c.badge, '#fff');
  else if (d.badge === 'creator' || d.badge === 'pinned') {
    ctx.font = `600 13px ${F}`;
    ctx.fillStyle = '#fe2c55';
    ctx.fillText(`· ${d.badge === 'creator' ? d.tr.creator : d.tr.pinned}`, x + 2, PAD + 13);
  }

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
  ctx.fillText(d.tr.reply, mx, metaTop + 13);

  if (d.heart) {
    const hy = metaTop + 22;
    icon(ctx, 'heart', X, hy, 13, { fill: '#fe2c55' });
    ctx.font = `400 12px ${F}`;
    ctx.fillStyle = c.muted;
    ctx.fillText(d.tr.liked, X + 18, hy + 11);
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

function renderCompact(d) {
  const canvas = $('#cmCanvas');
  const P = PLATFORMS[state.platform];
  const c = P[d.theme] || P[THEMES[state.platform][0][0]];
  const W = P.width;
  const F = fontFor('compact');
  const m = document.createElement('canvas').getContext('2d');
  const H = Math.ceil(LAYOUTS[state.platform](m, d, c, W, false, F));
  const pad = d.shadow && d.bg ? 32 : 0;

  canvas.width = (W + pad * 2) * S;
  canvas.height = (H + pad * 2) * S;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(S, 0, 0, S, pad * S, pad * S);
  if (d.bg) {
    ctx.save();
    if (pad) {
      ctx.shadowColor = 'rgba(0,0,0,.22)';
      ctx.shadowBlur = 24 * S;
      ctx.shadowOffsetY = 8 * S;
    }
    ctx.fillStyle = c.bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 14);
    ctx.fill();
    ctx.restore();
  }
  LAYOUTS[state.platform](ctx, d, c, W, true, F);
}

function render() {
  const d = read();
  renderCompact(d);
  renderBold($('#cmCanvasB'), {
    platform: state.platform,
    fam: fontFor('bold'),
    tr: d.tr,
    avatar: state.avatar ? avatarImage(state.avatar, d.name) : silhouette(),
    heartAvatar: avatarImage(state.creator, 'You'),
    // Passed as typed, like his: a blank name on Instagram drops the name row (comment + "Replying to" only)
    name: d.raw,
    comment: d.text,
    replyTo: $('#cmReplyTo').value.trim(),
    channel: d.channel,
    time: d.time,
    likes: d.likes,
    badge: d.badge,
    theme: d.theme,
    hearted: d.heart && state.platform !== 'instagram',
    bg: d.bg,
    shadow: d.shadow,
  });

  for (const [id, img, nm] of [['#cmAvatarThumb', state.avatar, d.name], ['#cmCreatorThumb', state.creator, 'You']]) {
    const t = $(id).getContext('2d');
    t.clearRect(0, 0, 80, 80);
    drawAvatar(t, img, nm, 0, 0, 80);
  }
  $('#cmAvatarClear').hidden = !state.avatar;
  $('#cmCreatorClear').hidden = !state.creator;
  $('#cmCreatorField').hidden = !d.heart || state.platform === 'tiktok';
}

// Re-render once the chosen font has loaded, so the canvas uses it.
let fontSeq = 0;
async function renderWhenFontsReady() {
  render();
  const seq = ++fontSeq;
  const fams = [fontFor('compact'), fontFor('bold')];
  try {
    await Promise.all(fams.flatMap((f) => [400, 500, 600, 700].map((w) => document.fonts.load(`${w} 16px ${f}`))));
  } catch {}
  if (seq === fontSeq) render();
}

/* ---------------- images ---------------- */

function fileToImage(file, max = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
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

function avatarStatus(msg) {
  $('#cmAvatarStatus').textContent = msg || '';
}

$('#cmAvatar').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    state.avatar = (await fileToImage(f)).img;
    avatarStatus('');
  } catch (err) {
    avatarStatus(err.message);
  }
  e.target.value = '';
  render();
});
$('#cmAvatarClear').addEventListener('click', () => {
  state.avatar = null;
  avatarStatus('');
  render();
});

// Random face from randomuser.me; falls back to a generated avatar if that's unreachable.
$('#cmRandom').addEventListener('click', async () => {
  const btn = $('#cmRandom');
  btn.disabled = true;
  avatarStatus('');
  try {
    const group = Math.random() < 0.5 ? 'men' : 'women';
    const res = await fetch(`https://randomuser.me/api/portraits/${group}/${Math.floor(Math.random() * 100)}.jpg`);
    if (!res.ok) throw new Error('bad response');
    state.avatar = (await fileToImage(await res.blob())).img;
  } catch {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const h = Math.floor(Math.random() * 360);
    const grad = g.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, `hsl(${h} 80% 62%)`);
    grad.addColorStop(1, `hsl(${(h + 50) % 360} 80% 48%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const letter = ($('#cmName').value.trim().replace(/^@/, '')[0] || String.fromCharCode(65 + Math.floor(Math.random() * 26))).toUpperCase();
    g.fillStyle = '#fff';
    g.font = `700 120px ${FAMILIES.inter}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, 128, 136);
    state.avatar = await loadDataUrl(c.toDataURL('image/png'));
    avatarStatus('Couldn’t reach the photo service, so a generated avatar was used.');
  }
  btn.disabled = false;
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
    avatarStatus(err.message);
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

function fillSelect(sel, opts, value) {
  sel.replaceChildren(...opts.map(([v, l]) => new Option(l, v)));
  if (value && opts.some(([v]) => v === value)) sel.value = value;
}

function applyPlatform() {
  const p = state.platform;
  for (const b of document.querySelectorAll('#cmPlatform button')) b.classList.toggle('on', b.dataset.v === p);
  for (const n of document.querySelectorAll('#cmForm [data-for]')) n.hidden = !n.dataset.for.split(' ').includes(p);
  fillSelect($('#cmBadge'), BADGES[p], $('#cmBadge').value);
  fillSelect($('#cmTheme'), THEMES[p], state.themes[p]);
}

for (const b of document.querySelectorAll('#cmPlatform button')) {
  b.addEventListener('click', () => {
    const prev = state.platform;
    state.platform = b.dataset.v;
    const t = $('#cmTime');
    if (!t.value.trim() || t.value === PLATFORMS[prev].defaults.time) t.value = PLATFORMS[state.platform].defaults.time;
    applyPlatform();
    save();
    renderWhenFontsReady();
  });
}
$('#cmTheme').addEventListener('change', () => {
  state.themes[state.platform] = $('#cmTheme').value;
  save();
});
for (const id of ['#cmFont', '#cmLang']) $(id).addEventListener('change', () => (save(), renderWhenFontsReady()));
$('#cmForm').addEventListener('input', render);
$('#cmForm').addEventListener('change', render);
$('#cmForm').addEventListener('submit', (e) => e.preventDefault());

/* ---------------- download / copy ---------------- */

function fileBase() {
  const d = read();
  const who = d.name.replace(/^@/, '').replace(/[\\/:*?"<>|]+/g, '').slice(0, 40) || 'comment';
  const plat = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' }[state.platform];
  return `${who} - ${plat} comment`;
}

function wireExport(canvasSel, dlSel, copySel, suffix) {
  $(dlSel).addEventListener('click', () => {
    $(canvasSel).toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${fileBase()}${suffix}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    }, 'image/png');
  });
  $(copySel).addEventListener('click', async () => {
    const btn = $(copySel);
    try {
      const blob = await new Promise((r) => $(canvasSel).toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      btn.textContent = 'Copied!';
    } catch {
      btn.textContent = 'Copy not supported — use Download';
    }
    setTimeout(() => (btn.textContent = 'Copy image'), 1800);
  });
}
wireExport('#cmCanvas', '#cmDl', '#cmCopy', '');
wireExport('#cmCanvasB', '#cmDlB', '#cmCopyB', ' (bold)');

/* ---------------- persistence ---------------- */

function save() {
  try {
    localStorage.setItem(
      'comments.opts',
      JSON.stringify({ platform: state.platform, themes: state.themes, lang: $('#cmLang').value, font: $('#cmFont').value })
    );
  } catch {}
}

(async () => {
  try {
    const o = JSON.parse(localStorage.getItem('comments.opts') || '{}');
    if (o.platform in PLATFORMS) {
      state.platform = o.platform;
      $('#cmTime').value = PLATFORMS[o.platform].defaults.time;
    }
    if (o.themes) for (const p of Object.keys(THEMES)) if (THEMES[p].some(([v]) => v === o.themes[p])) state.themes[p] = o.themes[p];
    if (o.theme === 'dark') state.themes = { youtube: 'dark', instagram: 'black', tiktok: 'dark' }; // older saved setting
    if (o.lang && TR[o.lang]) $('#cmLang').value = o.lang;
    if (o.font && [...$('#cmFont').options].some((x) => x.value === o.font)) $('#cmFont').value = o.font;
    const cr = localStorage.getItem('comments.creator');
    if (cr) state.creator = await loadDataUrl(cr);
  } catch {}
  applyPlatform();
  renderWhenFontsReady();
})();
