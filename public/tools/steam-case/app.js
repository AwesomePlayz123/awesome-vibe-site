(function () {
  const $ = (id) => document.getElementById(id);
  const enc = encodeURIComponent;

  // Template: 611 x 1048; the cover window is 600 x 900 at (0, 119)
  const W = 611, H = 1048, CX = 0, CY = 119, CW = 600, CH = 900;
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;

  const tpl = new Image();
  const tplLoaded = new Promise((res, rej) => { tpl.onload = () => res(); tpl.onerror = () => rej(new Error('case.png missing')); });
  tpl.src = 'case.png';

  // ---------- Settings ----------
  const store = {
    get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const getKey = () => store.get('sgdb-key');
  const getProxy = () => store.get('steam-proxy').trim() || '/api/proxy';
  $('sgdbkey').value = getKey();
  $('proxy').value = store.get('steam-proxy').trim();
  $('saveSettings').addEventListener('click', () => {
    store.set('sgdb-key', $('sgdbkey').value.trim());
    store.set('steam-proxy', $('proxy').value.trim());
    status('Settings saved.');
  });

  // ---------- Network helpers ----------
  const proxied = (w, url) => (w.startsWith('/') ? w : w.replace(/\/+$/, '') + '/') + '?url=' + enc(url);

  function loadImage(src, cors) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      if (cors) im.crossOrigin = 'anonymous';
      const t = setTimeout(() => { im.onload = im.onerror = null; reject(new Error('timeout')); }, 12000);
      im.onload = () => { clearTimeout(t); resolve(im); };
      im.onerror = () => { clearTimeout(t); reject(new Error('load failed')); };
      im.src = src;
    });
  }

  // Direct first, then this site's server (same origin, so the canvas can always use it), then a custom proxy
  async function loadViaProxies(url) {
    const tries = [url, proxied('/api/proxy', url)];
    const w = store.get('steam-proxy').trim();
    if (w) tries.push(proxied(w, url));
    let last;
    for (const u of tries) {
      try { return await loadImage(u, true); } catch (e) { last = e; }
    }
    throw last;
  }

  function sourcesFor(url, headers) {
    // This site's own server first, then a custom proxy if you set one, then a direct request.
    const s = [['this site', proxied('/api/proxy', url)]];
    const w = store.get('steam-proxy').trim();
    if (w) s.push(['your proxy', proxied(w, url)]);
    s.push(['direct', url]);
    return s;
  }
  function looseJSON(txt) {
    try { return JSON.parse(txt); } catch (e) {}
    const a = txt.search(/[\[{]/), b = Math.max(txt.lastIndexOf('}'), txt.lastIndexOf(']'));
    if (a >= 0 && b > a) return JSON.parse(txt.slice(a, b + 1));
    throw new Error('not JSON');
  }
  const short = (e) => (e.name === 'AbortError' ? 'timed out' : e.message === 'Failed to fetch' ? 'blocked or offline' : e.message);
  const why = (e) => (e && e.details && e.details.length ? ' (' + e.details.join('; ') + ')' : '');

  // Tries direct, your proxy and several public proxies, and uses whichever answers first
  async function fetchJSON(url, headers) {
    const sources = sourcesFor(url, headers);
    const errors = [], ctrls = [];
    let done = false;
    const attempt = async ([name, u], i) => {
      if (i) await new Promise((r) => setTimeout(r, i * 400));
      if (done) throw new Error('skipped');
      const ctrl = new AbortController();
      ctrls.push(ctrl);
      const t = setTimeout(() => ctrl.abort(), 9000);
      try {
        const r = await fetch(u, { headers, signal: ctrl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return looseJSON(await r.text());
      } catch (e) { if (!done) errors.push(name + ': ' + short(e)); throw e; } finally { clearTimeout(t); }
    };
    try {
      const res = await Promise.any(sources.map(attempt));
      done = true;
      ctrls.forEach((c) => c.abort());
      return res;
    } catch (e) {
      const err = new Error('request failed');
      err.details = errors;
      throw err;
    }
  }

  // ---------- Steam / SteamGridDB ----------
  function parseAppId(input) {
    const s = input.trim();
    const m = s.match(/(?:\/apps?\/|rungameid\/|appid=)(\d+)/i);
    if (m) return m[1];
    return /^\d+$/.test(s) ? s : null;
  }
  function nameFromLink(input) {
    const m = input.match(/\/app\/\d+\/([^\/?#]+)/i);
    if (!m) return '';
    try { return decodeURIComponent(m[1]).replace(/_/g, ' ').trim(); } catch (e) { return ''; }
  }

  const sgdb = async (path) => {
    const j = await fetchJSON('https://www.steamgriddb.com/api/v2/' + path, { Authorization: 'Bearer ' + getKey() });
    if (j && j.success === false) throw new Error('SteamGridDB error');
    return j;
  };

  async function searchSteam(q) {
    const j = await fetchJSON(`https://store.steampowered.com/api/storesearch/?term=${enc(q)}&l=english&cc=US`);
    return (j.items || []).filter((i) => !i.type || i.type === 'app').slice(0, 8).map((i) => ({ name: i.name, appid: i.id, img: i.tiny_image }));
  }
  async function searchSGDB(q) {
    const j = await sgdb('search/autocomplete/' + enc(q));
    return (j.data || []).slice(0, 8).map((g) => ({ name: g.name, sgdb: g.id }));
  }
  async function searchGames(q) {
    let res = [], err;
    try { res = await searchSteam(q); } catch (e) { err = e; }
    if (!res.length && getKey()) { try { res = await searchSGDB(q); } catch (e) { err = err || e; } }
    if (!res.length && err) throw err;
    return res;
  }
  async function lookupName(appid) {
    try {
      const j = await fetchJSON(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`);
      const d = j && j[appid];
      return d && d.success && d.data ? d.data.name : '';
    } catch (e) { return ''; }
  }

  const CDN = [
    'shared.fastly.steamstatic.com/store_item_assets/steam/apps',
    'cdn.cloudflare.steamstatic.com/steam/apps',
    'shared.akamai.steamstatic.com/store_item_assets/steam/apps',
  ];
  const steamCdn = (id) => Promise.any(CDN.map((h) => loadViaProxies(`https://${h}/${id}/library_600x900.jpg`)));

  // Newer games use hashed file names; Steam's store API tells us the real path
  async function steamAssets(id) {
    const input = { ids: [{ appid: +id }], context: { language: 'english', country_code: 'US' }, data_request: { include_assets: true } };
    const j = await fetchJSON('https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=' + enc(JSON.stringify(input)));
    const it = j && j.response && j.response.store_items && j.response.store_items[0];
    const a = it && it.assets;
    if (!a || !a.asset_url_format) throw new Error('no assets');
    const urls = ['library_capsule_2x', 'library_capsule'].filter((k) => a[k])
      .map((k) => 'https://shared.fastly.steamstatic.com/store_item_assets/' + a.asset_url_format.replace('${appid}', id).replace('${asset}', a[k]).replace('${FILENAME}', a[k]));
    if (!urls.length) throw new Error('no library art');
    return { img: await Promise.any(urls.map(loadViaProxies)), name: it.name };
  }

  async function sgdbCover(game) {
    let id = game.sgdb;
    if (!id && game.appid) { try { id = (await sgdb('games/steam/' + game.appid)).data.id; } catch (e) {} }
    if (!id && game.name) { const r = await sgdb('search/autocomplete/' + enc(game.name)); id = r.data && r.data[0] && r.data[0].id; }
    if (!id) throw new Error('game not on SteamGridDB');
    for (const dims of ['600x900', '660x930', '342x482']) {
      const g = await sgdb(`grids/game/${id}?dimensions=${dims}&types=static&nsfw=false&humor=false`);
      for (const grid of (g.data || []).slice(0, 3)) { try { return await loadViaProxies(grid.url); } catch (e) {} }
    }
    throw new Error('no covers');
  }

  async function resolveCover(game) {
    const notes = [];
    if (game.appid) {
      try { return { img: await steamCdn(game.appid), source: 'Steam' }; } catch (e) { notes.push('Steam'); }
      try { const r = await steamAssets(game.appid); return { img: r.img, name: r.name, source: 'Steam' }; } catch (e) { notes.push('Steam store data'); }
    }
    if (getKey()) {
      try { return { img: await sgdbCover(game), source: 'SteamGridDB' }; } catch (e) { notes.push('SteamGridDB'); }
    } else notes.push('SteamGridDB (no API key set)');
    const err = new Error('No cover found');
    err.notes = notes;
    throw err;
  }
  const failText = (e) => e.notes
    ? `No cover found. Tried: ${e.notes.join(', ')}.` + (getKey() ? '' : ' Add a SteamGridDB key in settings, or upload the cover.')
    : (e.message || 'Something went wrong.');

  // ---------- Image + case compositing ----------
  function normalize(im) {
    const c = document.createElement('canvas');
    c.width = CW; c.height = CH;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    const s = Math.max(CW / im.naturalWidth, CH / im.naturalHeight);
    const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    g.drawImage(im, (CW - dw) / 2, (CH - dh) / 2, dw, dh);
    return c;
  }
  function composite(cover) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(cover, CX, CY);
    g.drawImage(tpl, 0, 0);
    return c;
  }
  const toBlob = (c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), 'image/png'));
  const safe = (n) => (n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim() || 'steam-case';

  // ---------- Saving ----------
  async function saveBlob(blob, fileName, desc, mime, ext) {
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: desc, accept: { [mime]: [ext] } }] });
        const w = await h.createWritable();
        await w.write(blob);
        await w.close();
        return 'Saved ' + h.name;
      } catch (e) {
        if (e && e.name === 'AbortError') return '';
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return '';
  }

  // Minimal ZIP writer (PNGs are already compressed, so files are stored as-is)
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function makeZip(files) {
    const te = new TextEncoder(), now = new Date();
    const dt = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const tm = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = te.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, tm, true); lh.setUint16(12, dt, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, tm, true); ch.setUint16(14, dt, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);
      offset += 30 + name.length + size;
    }
    const cdSize = central.reduce((a, p) => a + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  // ---------- UI helpers ----------
  function status(msg, isError) { const s = $('status'); s.textContent = msg || ''; s.classList.toggle('error', !!isError); }
  const hint = (m) => { $('find-hint').textContent = m || ''; };

  $('mode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const bulk = b.dataset.m === 'bulk';
    $('mode').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('single').hidden = bulk; $('bulk').hidden = !bulk;
    $('singlePrev').hidden = bulk; $('bulkPrev').hidden = !bulk;
    status('');
  }));

  // ---------- Single mode ----------
  let cover = null;
  let nameTouched = false;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (cover) ctx.drawImage(cover, CX, CY);
    else {
      const g = ctx.createLinearGradient(0, CY, 0, CY + CH);
      g.addColorStop(0, '#2f2b5c'); g.addColorStop(1, '#14122c');
      ctx.fillStyle = g; ctx.fillRect(CX, CY, CW, CH);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '600 28px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Your cover goes here', CX + CW / 2, CY + CH / 2);
    }
    if (tpl.complete && tpl.naturalWidth) ctx.drawImage(tpl, 0, 0);
    $('download').disabled = !cover;
  }
  const setName = (n) => { $('fname').value = n; };
  $('fname').addEventListener('input', () => { nameTouched = true; });

  async function useGame(game) {
    $('go').disabled = true;
    status('Finding cover…');
    try {
      const r = await resolveCover(game);
      cover = normalize(r.img);
      draw();
      nameTouched = false;
      const nm = r.name || game.name || (game.appid ? 'steam-case-' + game.appid : 'steam-case');
      setName(nm);
      status('Cover loaded from ' + r.source + '.');
      if (!r.name && !game.name && game.appid) { const ex = await lookupName(game.appid); if (ex && !nameTouched) setName(ex); }
    } catch (e) {
      status(failText(e), true);
    }
    $('go').disabled = false;
  }

  const results = $('results');
  function hideResults() { results.hidden = true; results.replaceChildren(); }
  function showResults(list) {
    results.replaceChildren(...list.map((g) => {
      const li = document.createElement('li');
      li.tabIndex = 0;
      if (g.img) { const im = document.createElement('img'); im.src = g.img; im.alt = ''; li.append(im); }
      const sp = document.createElement('span'); sp.className = 'nm'; sp.textContent = g.name; li.append(sp);
      const pick = () => { hideResults(); hint(''); useGame(g); };
      li.addEventListener('click', pick);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
      return li;
    }));
    results.hidden = !list.length;
  }

  let searchSeq = 0;
  async function runSearch(q, pickFirst) {
    const my = ++searchSeq;
    hint('Searching…');
    try {
      const list = await searchGames(q);
      if (my !== searchSeq) return;
      if (!list.length) { hint('No games found. Try another spelling, or paste a link.'); hideResults(); return; }
      hint('');
      if (pickFirst) { hideResults(); await useGame(list[0]); } else showResults(list);
    } catch (e) {
      if (my !== searchSeq) return;
      hideResults();
      hint('Search failed' + why(e) + '. Paste a Steam link or app ID instead.');
    }
  }

  async function onGo() {
    const v = $('steam').value.trim();
    if (!v) return;
    const id = parseAppId(v);
    if (id) { hideResults(); hint(''); await useGame({ appid: id, name: nameFromLink(v) }); }
    else await runSearch(v, true);
  }
  $('go').addEventListener('click', onGo);
  $('steam').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onGo(); } });
  let typing;
  $('steam').addEventListener('input', () => {
    clearTimeout(typing);
    const v = $('steam').value.trim();
    if (v.length < 2 || parseAppId(v)) { hideResults(); hint(''); return; }
    typing = setTimeout(() => runSearch(v, false), 450);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.field')) hideResults(); });

  $('upload').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const url = URL.createObjectURL(f);
    try { cover = normalize(await loadImage(url)); draw(); status('Image loaded.'); }
    catch (err) { status('That file could not be read as an image.', true); }
    URL.revokeObjectURL(url);
  });

  $('reset').addEventListener('click', () => {
    cover = null; nameTouched = false;
    $('steam').value = ''; setName(''); hideResults(); hint(''); status('');
    draw();
  });

  $('download').addEventListener('click', async () => {
    if (!cover) return;
    try { const m = await saveBlob(await toBlob(canvas), safe($('fname').value) + '.png', 'PNG image', 'image/png', '.png'); if (m) status(m); }
    catch (e) { status('Download failed. Try again.', true); }
  });

  // ---------- Bulk mode ----------
  let items = [];
  let running = false;

  function cardFor(it) {
    const card = document.createElement('div');
    card.className = 'bcard';
    const th = document.createElement('div');
    th.className = 'bthumb';
    if (it.composite) { th.style.border = 'none'; th.append(it.composite); }
    else th.textContent = it.state === 'fail' ? 'No cover' : (it.state === 'working' ? 'Working…' : 'Waiting…');
    const nm = document.createElement('input');
    nm.type = 'text'; nm.value = it.name || it.input; nm.title = 'File name';
    nm.addEventListener('input', () => { it.name = nm.value; });
    const msg = document.createElement('div');
    msg.className = 'bmsg ' + (it.state === 'ok' ? 'ok' : it.state === 'fail' ? 'fail' : '');
    msg.textContent = it.state === 'ok' ? '✓ ' + (it.source || 'Ready') : it.state === 'fail' ? it.msg : '';
    msg.title = msg.textContent;
    const row = document.createElement('div');
    row.className = 'row';
    const up = document.createElement('button');
    up.type = 'button'; up.className = 'btn small'; up.textContent = it.state === 'ok' ? 'Replace' : 'Upload';
    up.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return;
        const url = URL.createObjectURL(f);
        try { it.composite = composite(normalize(await loadImage(url))); it.state = 'ok'; it.source = 'Your image'; updateCard(it); refreshBulk(); }
        catch (e) { it.msg = 'Could not read that image.'; updateCard(it); }
        URL.revokeObjectURL(url);
      };
      inp.click();
    });
    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'btn small'; rm.textContent = 'Remove';
    rm.addEventListener('click', () => { items = items.filter((x) => x !== it); card.remove(); refreshBulk(); });
    row.append(up, rm);
    card.append(th, nm, msg, row);
    return card;
  }
  function updateCard(it) { const n = cardFor(it); if (it.el && it.el.parentNode) it.el.replaceWith(n); it.el = n; }
  function refreshBulk() {
    const ok = items.filter((i) => i.state === 'ok').length, fail = items.filter((i) => i.state === 'fail').length;
    $('zip').disabled = running || !ok;
    $('folder').disabled = running || !ok;
    $('bulkRetry').hidden = !fail;
    $('bulkInfo').textContent = items.length ? `${ok} of ${items.length} ready` + (fail ? `, ${fail} not found.` : '.') : 'Add some games and press Generate all.';
  }

  async function processItem(it) {
    it.state = 'working'; updateCard(it);
    try {
      let game;
      const id = parseAppId(it.input);
      if (id) game = { appid: id, name: nameFromLink(it.input) };
      else {
        const list = await searchGames(it.input);
        if (!list.length) throw new Error('No game found for that name.');
        game = list[0];
      }
      const r = await resolveCover(game);
      let name = r.name || game.name;
      if (!name && game.appid) name = await lookupName(game.appid);
      it.name = name || (game.appid ? 'app-' + game.appid : it.input);
      it.source = r.source;
      it.composite = composite(normalize(r.img));
      it.state = 'ok';
    } catch (e) {
      it.state = 'fail';
      it.msg = e.notes ? failText(e) : (e.message === 'No game found for that name.' ? e.message : 'Search failed. Try again, or use a link.');
    }
    updateCard(it);
  }

  async function runQueue(list) {
    running = true;
    $('bulkGo').disabled = true;
    $('progress').hidden = false;
    refreshBulk();
    let next = 0, done = 0;
    const worker = async () => {
      while (next < list.length) {
        const it = list[next++];
        await processItem(it);
        done++;
        $('bar').style.width = (done / list.length * 100) + '%';
        refreshBulk();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    running = false;
    $('bulkGo').disabled = false;
    setTimeout(() => { $('progress').hidden = true; $('bar').style.width = '0'; }, 600);
    refreshBulk();
  }

  $('bulkGo').addEventListener('click', async () => {
    const lines = $('bulkText').value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length || running) return;
    try { await tplLoaded; } catch (e) { status('Could not load case.png.', true); return; }
    items = lines.map((input) => ({ input, state: 'pending' }));
    $('bgrid').replaceChildren(...items.map((it) => (it.el = cardFor(it))));
    status('');
    await runQueue(items);
  });
  $('bulkRetry').addEventListener('click', () => { if (!running) runQueue(items.filter((i) => i.state === 'fail')); });
  $('bulkClear').addEventListener('click', () => { if (running) return; items = []; $('bgrid').replaceChildren(); $('bulkText').value = ''; refreshBulk(); });

  async function readyFiles() {
    const used = new Set();
    const out = [];
    for (const it of items.filter((i) => i.state === 'ok')) {
      let base = safe(it.name), name = base + '.png', n = 2;
      while (used.has(name.toLowerCase())) name = `${base} (${n++}).png`;
      used.add(name.toLowerCase());
      out.push({ name, blob: await toBlob(it.composite) });
    }
    return out;
  }

  $('zip').addEventListener('click', async () => {
    $('zip').disabled = true;
    try {
      const files = await readyFiles();
      const data = await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) })));
      const m = await saveBlob(makeZip(data), 'steam-cases.zip', 'ZIP archive', 'application/zip', '.zip');
      status(m || `Downloaded ${files.length} cases.`);
    } catch (e) { status('Could not build the ZIP. Try again.', true); }
    refreshBulk();
  });

  if (window.showDirectoryPicker) {
    $('folder').hidden = false;
    $('folder').addEventListener('click', async () => {
      try {
        const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
        const files = await readyFiles();
        for (const f of files) {
          const h = await dir.getFileHandle(f.name, { create: true });
          const w = await h.createWritable();
          await w.write(f.blob);
          await w.close();
        }
        status(`Saved ${files.length} files to ${dir.name}.`);
      } catch (e) { if (!e || e.name !== 'AbortError') status('Could not save to that folder.', true); }
    });
  }

  tplLoaded.then(draw, () => status('Could not load case.png. Make sure it sits next to index.html.', true));
  draw();
  refreshBulk();
})();
