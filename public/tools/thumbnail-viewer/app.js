(function () {
  const $ = (id) => document.getElementById(id);
  const API = 'https://www.googleapis.com/youtube/v3/';
  const DAYS = 30;                 // "most viewed" = most viewed in the last 30 days
  const CACHE_MS = 6 * 3600 * 1000; // reuse results for 6 hours to save API quota
  const NICHES = [
    ['Gaming', 'gaming'], ['Cooking', 'cooking recipe'], ['Fitness', 'workout fitness'], ['Tech reviews', 'tech review'],
    ['Vlogs', 'daily vlog'], ['Education', 'explained educational'], ['Music', 'official music video'], ['Comedy', 'comedy sketch'],
    ['Travel', 'travel vlog'], ['Beauty', 'makeup tutorial'], ['DIY & how-to', 'diy how to'], ['Finance', 'personal finance investing'],
    ['Sports', 'sports highlights'], ['Custom keyword…', ''],
  ];

  const mine = { img: null, url: null };
  let comps = [];
  let loadState = 'nokey';  // nokey | loading | ready | error
  let reqId = 0;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function msg(text, isError) { const m = $('msg'); m.textContent = text || ''; m.classList.toggle('error', !!isError); }
  function getKey() { try { return localStorage.getItem('yt-key') || ''; } catch (e) { return ''; } }

  // ---- formatting ----
  function fmtViews(n) {
    const f = (v, d) => (v < d * 10 ? v.toFixed(1) : Math.round(v).toString()).replace(/\.0$/, '');
    if (n >= 1e9) return f(n / 1e9, 1) + 'B views';
    if (n >= 1e6) return f(n / 1e6, 1) + 'M views';
    if (n >= 1e3) return f(n / 1e3, 1) + 'K views';
    return n + ' views';
  }
  function fmtAgo(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    const u = [[2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
    for (const [sec, name] of u) {
      if (s >= sec) { const n = Math.floor(s / sec); return n + ' ' + name + (n > 1 ? 's' : '') + ' ago'; }
    }
    return 'Just now';
  }
  function fmtDur(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = (x) => String(x).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
  }
  function isoSeconds(iso) {
    const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
    return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  }

  // ---- cards ----
  function avatarEl(src, name) {
    if (src) { const i = el('img', 'av'); i.src = src; i.alt = ''; i.referrerPolicy = 'no-referrer'; return i; }
    const a = el('div', 'av', (name || '?').trim()[0].toUpperCase());
    a.style.background = '#8b6cff';
    return a;
  }

  function videoCard(o) {
    const v = el('div', 'vid' + (o.mine ? ' mine' : ''));
    if (o.mine && $('hl').checked) v.classList.add('hl');
    const th = el('div', 'thumb');
    if (o.thumb) {
      const i = el('img'); i.src = o.thumb; i.alt = ''; i.loading = 'lazy';
      if (o.fallback) i.onerror = () => { i.onerror = null; i.src = o.fallback; };
      th.append(i);
      if (o.dur) th.append(el('span', 'dur', o.dur));
    } else {
      th.classList.add('empty');
      th.textContent = 'Upload your thumbnail';
    }
    const meta = el('div', 'meta');
    const txt = el('div', 'txt');
    const t = el('div', 't' + (o.titlePlaceholder ? ' ph' : ''), o.title);
    txt.append(t, el('div', 'ch', o.channel), el('div', 'st', o.stats));
    meta.append(avatarEl(o.avatar, o.channel), txt);
    v.append(th, meta);
    return v;
  }

  function skeleton() {
    const v = el('div', 'vid skel');
    const meta = el('div', 'meta');
    const txt = el('div', 'txt');
    txt.style.flex = '1';
    txt.append(el('div', 'bar1'), el('div', 'bar2'));
    meta.append(el('div', 'av'), txt);
    v.append(el('div', 'thumb'), meta);
    return v;
  }

  function render() {
    const grid = $('grid');
    $('yt').classList.toggle('loading', loadState === 'loading');
    const slots = [];
    for (let i = 0; i < 8; i++) {
      const c = comps[i];
      slots.push(c ? videoCard({
        thumb: c.thumb, fallback: c.fallback, dur: fmtDur(c.dur), title: c.title, channel: c.channel,
        avatar: c.avatar, stats: fmtViews(c.views) + ' · ' + fmtAgo(c.published),
      }) : skeleton());
    }
    const title = $('title').value.trim();
    const channel = $('channel').value.trim() || 'Your Channel';
    const me = videoCard({
      mine: true, thumb: mine.url, dur: $('duration').value.trim(),
      title: title || 'Your video title goes here', titlePlaceholder: !title,
      channel, stats: 'No views · Just now',
    });
    slots.splice(+$('pos').value - 1, 0, me);
    grid.replaceChildren(...slots);
    $('count').textContent = $('title').value.length;
  }

  // ---- YouTube API ----
  async function api(path, params) {
    const u = new URL(API + path);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    u.searchParams.set('key', getKey());
    const res = await fetch(u);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = data.error && data.error.errors && data.error.errors[0] && data.error.errors[0].reason;
      const e = new Error((data.error && data.error.message) || 'Request failed');
      e.reason = reason;
      throw e;
    }
    return data;
  }

  async function fetchTop(query) {
    const after = new Date(Date.now() - DAYS * 864e5).toISOString();
    const s = await api('search', { part: 'snippet', type: 'video', order: 'viewCount', maxResults: 25, q: query, publishedAfter: after, relevanceLanguage: 'en' });
    const ids = s.items.map((i) => i.id.videoId).filter(Boolean);
    if (!ids.length) return [];
    const v = await api('videos', { part: 'snippet,contentDetails,statistics', id: ids.join(',') });
    let items = v.items
      .map((x) => {
        const th = x.snippet.thumbnails || {};
        return {
          id: x.id, title: x.snippet.title, channel: x.snippet.channelTitle, channelId: x.snippet.channelId,
          published: x.snippet.publishedAt, views: +(x.statistics && x.statistics.viewCount) || 0,
          dur: isoSeconds(x.contentDetails.duration),
          thumb: (th.maxres || th.medium || th.high || {}).url, fallback: `https://i.ytimg.com/vi/${x.id}/mqdefault.jpg`,
        };
      })
      .filter((x) => x.dur > 180 && x.thumb)   // skip Shorts
      .sort((a, b) => b.views - a.views)
      .slice(0, 8);
    const cids = [...new Set(items.map((x) => x.channelId))];
    if (cids.length) {
      try {
        const c = await api('channels', { part: 'snippet', id: cids.join(',') });
        const map = {};
        c.items.forEach((ch) => { map[ch.id] = ch.snippet.thumbnails && ch.snippet.thumbnails.default && ch.snippet.thumbnails.default.url; });
        items = items.map((x) => ({ ...x, avatar: map[x.channelId] }));
      } catch (e) { /* avatars are optional */ }
    }
    return items;
  }

  function currentQuery() {
    const n = NICHES[+$('niche').value];
    return n[1] || $('custom').value.trim();
  }

  async function load(force) {
    const query = currentQuery();
    if (!getKey()) { loadState = 'nokey'; comps = []; msg('Add a YouTube API key to load the top videos in this niche.'); render(); return; }
    if (!query) { loadState = 'nokey'; comps = []; msg('Type a keyword and press Enter.'); render(); return; }

    const cacheKey = 'tv-cache:' + query.toLowerCase();
    if (!force) {
      try {
        const c = JSON.parse(localStorage.getItem(cacheKey));
        if (c && Date.now() - c.t < CACHE_MS) { comps = c.items; loadState = 'ready'; msg(`Top ${comps.length} most viewed videos from the last ${DAYS} days.`); render(); return; }
      } catch (e) {}
    }

    const id = ++reqId;
    loadState = 'loading'; comps = []; msg('Loading top videos…'); render();
    try {
      const items = await fetchTop(query);
      if (id !== reqId) return;
      comps = items; loadState = 'ready';
      try { localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), items })); } catch (e) {}
      msg(items.length ? `Top ${items.length} most viewed videos from the last ${DAYS} days.` : 'No long-form videos found for that search.', !items.length);
    } catch (e) {
      if (id !== reqId) return;
      loadState = 'error'; comps = [];
      const r = e.reason;
      msg(r === 'quotaExceeded' ? 'Daily YouTube API quota is used up. It resets at midnight Pacific time.'
        : (r === 'keyInvalid' || r === 'forbidden' || r === 'accessNotConfigured' || r === 'ipRefererBlocked') ? 'YouTube rejected the API key: ' + e.message
        : 'Could not load videos: ' + e.message, true);
    }
    render();
  }

  // ---- thumbnail upload ----
  function setImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (mine.url) URL.revokeObjectURL(mine.url);
    mine.url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const off = Math.abs(im.naturalWidth / im.naturalHeight - 16 / 9) > 0.05;
      $('img-hint').textContent = off
        ? `${im.naturalWidth} × ${im.naturalHeight}. Not 16:9, so it is cropped to fit like YouTube does.`
        : `${im.naturalWidth} × ${im.naturalHeight}. Looks good.`;
    };
    im.src = mine.url;
    $('drop-img').src = mine.url;
    $('drop-img').hidden = false;
    $('drop-text').hidden = true;
    render();
  }

  $('file').addEventListener('change', (e) => { setImage(e.target.files[0]); e.target.value = ''; });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => setImage(e.dataTransfer.files[0]));
  document.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => x.type.startsWith('image/'));
    if (f) setImage(f);
  });

  // ---- controls ----
  NICHES.forEach((n, i) => $('niche').append(new Option(n[0], i)));
  for (let i = 1; i <= 9; i++) $('pos').append(new Option('Spot ' + i, i));

  ['title', 'channel', 'duration', 'pos', 'hl'].forEach((id) => { $(id).addEventListener('input', render); $(id).addEventListener('change', render); });
  $('shuffle').addEventListener('click', () => { $('pos').value = 1 + Math.floor(Math.random() * 9); render(); });

  $('niche').addEventListener('change', () => {
    const custom = !NICHES[+$('niche').value][1];
    $('custom').hidden = !custom;
    if (custom) $('custom').focus();
    load(false);
  });
  $('custom').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); load(false); } });
  $('refresh').addEventListener('click', () => load(true));

  $('savekey').addEventListener('click', () => {
    const k = $('key').value.trim();
    if (!k) return;
    try { localStorage.setItem('yt-key', k); } catch (e) {}
    $('key').value = '';
    $('keybox').open = false;
    load(true);
  });

  function setTheme(dark) {
    $('yt').classList.toggle('dark', dark);
    $('yt').classList.toggle('light', !dark);
    $('t-dark').setAttribute('aria-pressed', String(dark));
    $('t-light').setAttribute('aria-pressed', String(!dark));
  }
  $('t-dark').addEventListener('click', () => setTheme(true));
  $('t-light').addEventListener('click', () => setTheme(false));

  if (!getKey()) $('keybox').open = true;
  render();
  load(false);
})();
