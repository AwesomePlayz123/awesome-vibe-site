// Reads a public Steam Community review page (steamcommunity.com/id/<name>/recommended/<appid>)
// into the fields the Steam review generator uses. Steam has no keyless API for one person's review,
// so this parses the page HTML. It leans on the visible wording ("hrs on record", "found this review
// helpful") more than on class names, so small layout changes on Steam's side don't break it.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function parseReviewUrl(input) {
  let u;
  try {
    u = new URL(String(input || '').trim().replace(/^(?!https?:\/\/)/i, 'https://'));
  } catch {
    return null;
  }
  if (!/(^|\.)steamcommunity\.com$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/(id|profiles)\/([^/]+)\/recommended\/(\d+)/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const who = decodeURIComponent(m[2]);
  if (kind === 'profiles' && !/^\d{17}$/.test(who)) return null;
  return {
    kind,
    who,
    appid: m[3],
    profileUrl: `https://steamcommunity.com/${kind}/${encodeURIComponent(who)}/`,
    reviewUrl: `https://steamcommunity.com/${kind}/${encodeURIComponent(who)}/recommended/${m[3]}/`,
  };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decode(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

const plain = (html) => decode(String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t ]+/g, ' ');

// Inner HTML of the element that starts at `start` (an index pointing at its opening tag), matching nested tags.
function innerOf(html, start) {
  const open = html.slice(start).match(/^<([a-z0-9]+)\b[^>]*>/i);
  if (!open) return '';
  const tag = open[1].toLowerCase();
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start + open[0].length;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].endsWith('/>')) continue;
    depth += m[1] ? -1 : 1;
    if (!depth) return html.slice(start + open[0].length, m.index);
  }
  return html.slice(start + open[0].length);
}
function byId(html, id) {
  const i = html.search(new RegExp(`<[a-z0-9]+\\b[^>]*\\bid=["']${id}["']`, 'i'));
  return i < 0 ? null : innerOf(html, i);
}
function byClass(html, cls, from = 0) {
  const re = new RegExp(`<[a-z0-9]+\\b[^>]*\\bclass=["'][^"']*\\b${cls}\\b[^"']*["']`, 'gi');
  re.lastIndex = from;
  const m = re.exec(html);
  return m ? innerOf(html, m.index) : null;
}

// Review HTML (Steam renders the author's BBCode to HTML) → Steam BBCode, which the generator draws.
export function htmlToBB(html) {
  let s = String(html).replace(/\r?\n/g, '');
  const swaps = [
    [/<br\s*\/?>/gi, '\n'],
    [/<(?:b|strong)\b[^>]*>/gi, '[b]'], [/<\/(?:b|strong)>/gi, '[/b]'],
    [/<(?:i|em)\b[^>]*>/gi, '[i]'], [/<\/(?:i|em)>/gi, '[/i]'],
    [/<u\b[^>]*>/gi, '[u]'], [/<\/u>/gi, '[/u]'],
    [/<hr\b[^>]*>(?:<\/hr>)?/gi, '\n[hr][/hr]\n'],
    [/<ul\b[^>]*>/gi, '\n[list]'], [/<\/ul>/gi, '\n[/list]\n'],
    [/<ol\b[^>]*>/gi, '\n[olist]'], [/<\/ol>/gi, '\n[/olist]\n'],
    [/<li\b[^>]*>/gi, '\n[*]'], [/<\/li>/gi, ''],
    [/<h([123])\b[^>]*>/gi, '\n[h$1]'], [/<\/h([123])>/gi, '[/h$1]\n'],
  ];
  // Spans/divs carry BBCode via class names (bb_h1, bb_strike, bb_spoiler…); rewrite them with a stack.
  s = s.replace(/<(\/?)(span|div|blockquote|p)\b([^>]*)>/gi, (m, close, tag, attrs) => `\u0001${close}${tag}\u0002${attrs}\u0003`);
  const stack = [];
  s = s.replace(/\u0001(\/?)(\w+)\u0002([^\u0003]*)\u0003/g, (m, close, tag, attrs) => {
    if (close) return stack.pop() || '';
    const cls = (attrs.match(/class=["']([^"']*)["']/i) || [])[1] || '';
    let open = '', end = '';
    const h = cls.match(/\bbb_h([123])\b/);
    if (h) { open = `\n[h${h[1]}]`; end = `[/h${h[1]}]\n`; }
    else if (/\bbb_strike\b/.test(cls)) { open = '[strike]'; end = '[/strike]'; }
    else if (/\bbb_spoiler\b/.test(cls)) { open = '[spoiler]'; end = '[/spoiler]'; }
    else if (/\bbb_u\b/.test(cls)) { open = '[u]'; end = '[/u]'; }
    else if (/\bbb_(?:paragraph|blockquote|quotecontent)\b/.test(cls) || /^(?:div|p|blockquote)$/i.test(tag)) { end = '\n'; }
    stack.push(end);
    return open;
  });
  for (const [re, to] of swaps) s = s.replace(re, to);
  s = decode(s.replace(/<[^>]+>/g, ''));
  return s
    .replace(/[ \t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\[(h[123])\]\s*\n/g, '[$1]')
    .replace(/\n\s*\n(?=\[\*\]|\[\/o?list\])/g, '\n')
    .trim();
}

// "Oct 22 @ 12:32am", "22 Oct, 2023 @ 4:01pm", "October 22, 2023" → "22 October" / "22 October, 2023" (how store reviews show it)
export function storeDate(s) {
  if (!s) return '';
  const t = s.replace(/@.*$/, '').replace(/\s+/g, ' ').trim();
  const mon = (w) => MONTHS.findIndex((m) => m.slice(0, 3).toLowerCase() === w.slice(0, 3).toLowerCase());
  let d, mi, y;
  let m = t.match(/^([A-Za-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?,? ?(\d{4})?/);
  if (m) [mi, d, y] = [mon(m[1]), m[2], m[3]];
  else if ((m = t.match(/^(\d{1,2}) ([A-Za-z]+)\.?,? ?(\d{4})?/))) [d, mi, y] = [m[1], mon(m[2]), m[3]];
  if (!m || mi < 0) return t;
  return `${Number(d)} ${MONTHS[mi]}${y ? `, ${y}` : ''}`;
}

const numText = (s) => (s || '').replace(/[^\d.]/g, '');

export function parseReviewPage(html) {
  const text = plain(html);
  const out = {};

  const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1];
  const t = title ? decode(title).match(/::\s*(.+?)\s*::\s*Review for\s+(.+)$/i) : null;
  out.name = decode((html.match(/class=["'][^"']*persona_name_text_content[^"']*["'][^>]*>([^<]+)</i) || [])[1] || (t && t[1]) || '').trim();
  out.game = t ? t[2].trim() : '';

  // Header avatar (comes before any commenter avatars); ask for the full-size one.
  const av = html.match(/class=["'][^"']*playerAvatar([^"']*)["'][^>]*>\s*(?:<a[^>]*>\s*)?<img[^>]*src=["']([^"']+)["']/i);
  if (av) {
    out.avatar = av[2].replace(/(_medium|_full)?\.(jpg|png)$/i, '_full.$2');
    out.status = /in-game/i.test(av[1]) ? 'ingame' : /online/i.test(av[1]) ? 'online' : 'default';
  }

  const summary = plain(byClass(html, 'ratingSummary') || '');
  if (/not recommended/i.test(summary) || /icon_thumbsDown/i.test(html)) out.recommended = false;
  else if (/recommended/i.test(summary) || /icon_thumbsUp/i.test(html)) out.recommended = true;

  const onRecord = text.match(/([\d,.]+)\s*hrs? on record/i);
  if (onRecord) out.hours = numText(onRecord[1].replace(/,/g, ''));
  const atReview = text.match(/([\d,.]+)\s*hrs? at review time/i);
  if (atReview) out.atReview = numText(atReview[1].replace(/,/g, ''));

  const dates = plain(byClass(html, 'recommendation_date') || '') || text;
  const posted = dates.match(/Posted:?\s*(.+?)(?:\.\s|\.$|\n|Last edited|$)/i);
  if (posted) out.posted = storeDate(posted[1]);
  const edited = dates.match(/(?:Last edited|Updated):?\s*(.+?)(?:\.\s|\.$|\n|$)/i);
  if (edited) out.edited = storeDate(edited[1]);

  out.free = /Product received for free/i.test(text);
  out.earlyAccess = /Early Access Review/i.test(text);
  out.refunded = /Product refunded/i.test(text);

  const helpful = text.match(/([\d,]+)\s+(?:people|person)\s+found this review helpful/i);
  out.helpful = helpful ? helpful[1].replace(/,/g, '') : '0';
  const funny = text.match(/([\d,]+)\s+(?:people|person)\s+found this review funny/i);
  out.funny = funny ? funny[1].replace(/,/g, '') : '0';

  const body = byId(html, 'ReviewText');
  out.text = body != null ? htmlToBB(body) : '';
  return out;
}

// Profile page counts: "Games 123" and "Reviews 45" (hidden when the profile/game details are private).
export function parseProfileCounts(html) {
  const count = (label) => {
    const re = new RegExp(`>\\s*${label}\\s*</span>\\s*(?:&nbsp;|\\s)*<span[^>]*profile_count_link_total[^>]*>\\s*([\\d,]+)`, 'i');
    const m = html.match(re);
    return m ? m[1].replace(/,/g, '') : '';
  };
  const avatar = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1] || '';
  return { products: count('Games'), reviews: count('Reviews'), avatar };
}
