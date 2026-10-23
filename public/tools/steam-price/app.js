(function () {
  const $ = (id) => document.getElementById(id);
  const enc = encodeURIComponent;
  const canvas = $('canvas');

  // ---------- Look (measured from a real Steam discount tag) ----------
  const COL = { green: '#4c6b22', blue: '#344654', lime: '#beee11', gray: '#80817a' };
  const H = 140, RADIUS = 38;
  const FONTS = {
    mulish: '"Mulish", Arial, sans-serif', nunito: '"Nunito Sans", Arial, sans-serif',
    figtree: '"Figtree", Arial, sans-serif', arial: 'Arial, Helvetica, sans-serif',
  };

  // ---------- Settings ----------
  const store = {
    get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const getProxy = () => store.get('steam-proxy').trim() || '/api/proxy';
  $('proxy').value = store.get('steam-proxy').trim();
  $('saveProxy').addEventListener('click', () => { store.set('steam-proxy', $('proxy').value.trim()); status('Proxy saved.'); });

  // ---------- Network: several routes, raced ----------
  const proxied = (w, url) => (w.startsWith('/') ? w : w.replace(/\/+$/, '') + '/') + '?url=' + enc(url);
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

  async function fetchJSON(url, headers) {
    const sources = sourcesFor(url, headers);
    const errors = [], ctrls = [];
    let done = false;
    const attempt = async ([name, u], i) => {
      if (i) await new Promise((r) => setTimeout(r, i * 400));   // stagger so we don't hit every proxy needlessly
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
  const why = (e) => (e && e.details && e.details.length ? ' (' + e.details.join('; ') + ')' : '');

  $('test').addEventListener('click', async () => {
    const out = $('testout');
    out.hidden = false;
    out.textContent = 'Testing…';
    const lines = [];
    for (const [name, u] of sourcesFor('https://store.steampowered.com/api/appdetails?appids=220&filters=basic')) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 9000);
      try {
        const r = await fetch(u, { signal: ctrl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = looseJSON(await r.text());
        if (!j || !j[220]) throw new Error('unexpected reply');
        lines.push('✓ ' + name);
      } catch (e) { lines.push('✗ ' + name + ': ' + short(e)); } finally { clearTimeout(t); }
      out.textContent = lines.join('\n');
    }
    if (!lines.some((l) => l.startsWith('✓'))) out.textContent += '\n\nNothing got through. Steam may be blocking requests right now; try again in a minute.';
  });

  // ---------- Steam lookups ----------
  function parseAppId(input) {
    const s = input.trim();
    const m = s.match(/(?:\/apps?\/|rungameid\/|appid=)(\d+)/i);
    if (m) return m[1];
    return /^\d+$/.test(s) ? s : null;
  }
  async function searchSteam(q) {
    const j = await fetchJSON(`https://store.steampowered.com/api/storesearch/?term=${enc(q)}&l=english&cc=${$('cc').value}`);
    return (j.items || []).filter((i) => !i.type || i.type === 'app').slice(0, 8).map((i) => ({ name: i.name, appid: i.id, img: i.tiny_image }));
  }
  async function getPrice(appid) {
    const j = await fetchJSON(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=${$('cc').value}&l=english&filters=basic,price_overview`);
    const d = j && j[appid];
    if (!d || !d.success) throw Object.assign(new Error('Steam has no store page for that app.'), { steam: true });
    return { name: d.data && d.data.name, price: d.data && d.data.price_overview };
  }

  // ---------- Price helpers ----------
  function parseMoney(s) {
    const m = (s || '').replace(/[^\d.,]/g, '');
    if (!m) return NaN;
    const lc = m.lastIndexOf(','), ld = m.lastIndexOf('.');
    const dec = Math.max(lc, ld);
    if (dec < 0) return parseFloat(m);
    const after = m.length - dec - 1;
    if (after === 3 && (lc < 0 || ld < 0)) return parseFloat(m.replace(/[.,]/g, ''));
    return parseFloat(m.slice(0, dec).replace(/[.,]/g, '') + '.' + m.slice(dec + 1));
  }
  function formatPrice(raw, fmt) {
    raw = (raw || '').trim();
    if (!raw) return '';
    if (fmt !== '{p}' && /^[\d.,\s]+$/.test(raw)) return fmt.replace('{p}', raw);
    return raw;
  }
  function calcPct(o, f) {
    const a = parseMoney(o), b = parseMoney(f);
    return a > 0 && b >= 0 && b < a ? String(Math.round((1 - b / a) * 100)) : '';
  }
  function syncAuto() {
    const on = $('auto').checked;
    $('pct').disabled = on;
    if (on) $('pct').value = calcPct($('orig').value, $('final').value);
  }

  // ---------- Drawing ----------
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Pick a font size so that digits are exactly `digitH` pixels tall (works for any font)
  function sizeFor(g, weight, digitH, fam) {
    g.font = `${weight} 100px ${fam}`;
    const a = g.measureText('0').actualBoundingBoxAscent || 70;
    return (digitH * 100) / a;
  }
  function ink(g, text, font) {
    g.font = font;
    const m = g.measureText(text);
    return { l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight };
  }

  // Draws one tag onto `cv`. d = { orig, final, pct } as typed/fetched; options come from the page.
  function drawTag(cv, d, S) {
    const fam = FONTS[$('font').value], fmt = $('fmt').value;
    const g = cv.getContext('2d');
    const origTxt = formatPrice(d.orig, fmt), finalTxt = formatPrice(d.final, fmt);
    const pctNum = parseInt(String(d.pct || '').replace(/\D/g, ''), 10) || 0;
    const showPct = $('showpct').checked && pctNum > 0;
    const showOrig = $('showorig').checked && origTxt !== '';

    const szP = sizeFor(g, 700, 80, fam), szF = sizeFor(g, 600, 33, fam), szO = sizeFor(g, 600, 26, fam);
    const fP = `700 ${szP}px ${fam}`, fF = `600 ${szF}px ${fam}`, fO = `600 ${szO}px ${fam}`;
    const pctText = '-' + pctNum + '%';
    const iP = showPct ? ink(g, pctText, fP) : null;
    const iF = finalTxt ? ink(g, finalTxt, fF) : { l: 0, r: 0, w: 0 };
    const iO = showOrig ? ink(g, origTxt, fO) : null;

    const leftW = showPct ? Math.ceil(iP.w + 18 + 23) : 0;
    const rightW = Math.ceil(Math.max(iF.w, iO ? iO.w : 0, 60) + 15 + 14);
    const W = leftW + rightW;

    cv.width = W * S;
    cv.height = H * S;
    g.setTransform(S, 0, 0, S, 0, 0);
    g.clearRect(0, 0, W, H);

    g.save();
    rr(g, 0, 0, W, H, RADIUS);
    g.clip();
    if (leftW) { g.fillStyle = COL.green; g.fillRect(0, 0, leftW, H); }
    g.fillStyle = COL.blue;
    g.fillRect(leftW, 0, rightW, H);
    g.restore();

    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    if (showPct) {
      g.font = fP; g.fillStyle = COL.lime;
      g.fillText(pctText, 18 + iP.l, 109);
    }
    const cx = leftW + rightW / 2;
    if (finalTxt) {
      g.font = fF; g.fillStyle = COL.lime;
      g.fillText(finalTxt, cx - (iF.r - iF.l) / 2, showOrig ? 109 : 70 + 33 / 2);
    }
    if (showOrig) {
      g.font = fO; g.fillStyle = COL.gray;
      g.fillText(origTxt, cx - (iO.r - iO.l) / 2, 54);
      g.save();                                  // Steam's slanted strike-through
      g.translate(cx, 54 - 13);
      g.rotate(-10 * Math.PI / 180);
      g.fillRect(-iO.w / 2, -2.25, iO.w, 4.5);
      g.restore();
    }
    return W;
  }

  async function ensureFonts() {
    const fam = FONTS[$('font').value];
    const sample = $('fmt').value + '0123456789-%.,' + $('orig').value + $('final').value + items.map((i) => (i.orig || '') + (i.final || '')).join('');
    try { await Promise.all(['600', '700'].map((w) => document.fonts.load(`${w} 40px ${fam}`, sample))); } catch (e) {}
  }

  let rid = 0;
  async function render() {
    const id = ++rid;
    await ensureFonts();
    if (id !== rid) return;
    const S = +$('scale').value;
    const W = drawTag(canvas, { orig: $('orig').value, final: $('final').value, pct: $('pct').value }, S);
    canvas.style.width = W + 'px';
    $('size').textContent = `${canvas.width} × ${canvas.height} px`;
    items.forEach(repaint);
  }

  // ---------- Status ----------
  function status(msg, isError) { const s = $('status'); s.textContent = msg || ''; s.classList.toggle('error', !!isError); }
  const hint = (m) => { $('find-hint').textContent = m || ''; };
  const safe = (n) => (n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim() || 'steam-price';

  $('mode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const bulk = b.dataset.m === 'bulk';
    $('mode').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    ['singleSearch', 'singlePrices', 'singleName', 'singlePrev'].forEach((id) => { $(id).hidden = bulk; });
    ['bulkInput', 'bulkPrev'].forEach((id) => { $(id).hidden = !bulk; });
    status('');
  }));

  // ---------- Single mode ----------
  let nameTouched = false;
  const setName = (n) => { $('fname').value = n; };
  $('fname').addEventListener('input', () => { nameTouched = true; });

  async function useGame(game) {
    $('go').disabled = true;
    status('Getting price…');
    try {
      const r = await getPrice(game.appid);
      const name = r.name || game.name;
      nameTouched = false;
      if (name) setName(name);
      if (!r.price) {
        status(`${name || 'This game'} has no price on Steam in this region (free, unreleased or not sold there). Enter it manually.`, true);
      } else {
        const p = r.price, onSale = p.discount_percent > 0;
        $('final').value = p.final_formatted || '';
        $('orig').value = onSale ? (p.initial_formatted || '') : '';
        $('auto').checked = false;
        $('pct').value = onSale ? String(p.discount_percent) : '';
        syncAuto();
        status(onSale ? `${name}: ${p.initial_formatted} → ${p.final_formatted} (-${p.discount_percent}%)` : `${name}: ${p.final_formatted} (not on sale right now).`);
        render();
      }
    } catch (e) {
      status(e.steam ? e.message : 'Could not reach Steam' + why(e) + '. Try again, open the connection settings and press Test, or type the price in.', true);
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

  let seq = 0;
  async function runSearch(q, pickFirst) {
    const my = ++seq;
    hint('Searching…');
    try {
      const list = await searchSteam(q);
      if (my !== seq) return;
      if (!list.length) { hint('No games found. Try another spelling, or paste a link.'); hideResults(); return; }
      hint('');
      if (pickFirst) { hideResults(); await useGame(list[0]); } else showResults(list);
    } catch (e) {
      if (my !== seq) return;
      hideResults();
      hint('Search failed' + why(e) + '. Paste a Steam link or app ID instead.');
    }
  }
  async function onGo() {
    const v = $('steam').value.trim();
    if (!v) return;
    const id = parseAppId(v);
    if (id) { hideResults(); hint(''); await useGame({ appid: id }); } else await runSearch(v, true);
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

  ['orig', 'final', 'auto'].forEach((id) => { $(id).addEventListener('input', () => { syncAuto(); render(); }); $(id).addEventListener('change', () => { syncAuto(); render(); }); });
  ['pct', 'fmt', 'showpct', 'showorig', 'font', 'scale'].forEach((id) => { $(id).addEventListener('input', render); $(id).addEventListener('change', render); });
  $('pct').addEventListener('input', () => { if ($('auto').checked) { $('auto').checked = false; syncAuto(); } });

  $('reset').addEventListener('click', () => {
    $('orig').value = '79.99'; $('final').value = '6.39'; $('fmt').selectedIndex = 0;
    $('auto').checked = true; $('showpct').checked = true; $('showorig').checked = true;
    $('font').selectedIndex = 0; $('scale').value = '2';
    $('steam').value = ''; setName(''); hideResults(); hint(''); status('');
    syncAuto(); render();
  });

  // ---------- Saving ----------
  const toBlob = (cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), 'image/png'));
  async function saveBlob(blob, fileName, desc, mime, ext) {
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: desc, accept: { [mime]: [ext] } }] });
        const w = await h.createWritable();
        await w.write(blob);
        await w.close();
        return 'Saved ' + h.name;
      } catch (e) { if (e && e.name === 'AbortError') return ''; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return '';
  }

  $('download').addEventListener('click', async () => {
    try { const m = await saveBlob(await toBlob(canvas), safe($('fname').value) + '.png', 'PNG image', 'image/png', '.png'); if (m) status(m); }
    catch (e) { status('Download failed. Try again.', true); }
  });
  $('copy').addEventListener('click', async () => {
    const btn = $('copy');
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await toBlob(canvas) })]); btn.textContent = 'Copied!'; }
    catch (e) { btn.textContent = 'Copy failed'; }
    setTimeout(() => (btn.textContent = 'Copy'), 1500);
  });

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

  // ---------- Bulk mode ----------
  let items = [];
  let running = false;

  const isReady = (it) => !!(it.final && String(it.final).trim());
  function repaint(it) {
    if (!it.thumb) return;
    if (isReady(it)) {
      if (!it.cv) it.cv = document.createElement('canvas');
      const w = drawTag(it.cv, it, 1);
      it.cv.style.width = Math.round(w * 0.38) + 'px';
      if (it.thumb.firstChild !== it.cv) it.thumb.replaceChildren(it.cv);
    } else {
      it.thumb.textContent = it.state === 'working' ? 'Working…' : it.state === 'pending' ? 'Waiting…' : 'Type a price below';
    }
  }
  function setMsg(it) {
    const ok = isReady(it);
    it.msgEl.className = 'bmsg ' + (ok ? 'ok' : it.state === 'fail' ? 'fail' : '');
    it.msgEl.textContent = ok ? '✓ ' + (it.note || 'Ready') : (it.state === 'fail' ? it.msg : '');
    it.msgEl.title = it.msgEl.textContent;
  }

  function cardFor(it) {
    const card = document.createElement('div');
    card.className = 'bcard';
    it.thumb = document.createElement('div');
    it.thumb.className = 'bthumb';
    const nm = document.createElement('input');
    nm.type = 'text'; nm.value = it.name || it.input || ''; nm.title = 'File name'; nm.placeholder = 'File name';
    nm.addEventListener('input', () => { it.name = nm.value; });
    const row = document.createElement('div');
    row.className = 'prices';
    const mk = (key, ph) => {
      const i = document.createElement('input');
      i.type = 'text'; i.placeholder = ph; i.value = it[key] || ''; i.title = ph;
      i.addEventListener('input', () => {
        it[key] = i.value;
        it.pct = calcPct(it.orig, it.final);
        if (isReady(it)) { it.state = 'ok'; it.note = 'Edited by you'; }
        setMsg(it); repaint(it); refreshBulk();
      });
      it[key + 'El'] = i;
      return i;
    };
    row.append(mk('orig', 'Original'), mk('final', 'Sale'));
    it.msgEl = document.createElement('div');
    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'btn small'; rm.textContent = 'Remove';
    rm.addEventListener('click', () => { items = items.filter((x) => x !== it); card.remove(); refreshBulk(); });
    card.append(it.thumb, nm, row, it.msgEl, rm);
    it.el = card;
    setMsg(it); repaint(it);
    return card;
  }
  function syncCard(it) {
    if (!it.el) return;
    it.el.querySelector('input').value = it.name || it.input || '';
    it.origEl.value = it.orig || '';
    it.finalEl.value = it.final || '';
    setMsg(it); repaint(it);
  }

  function refreshBulk() {
    const ok = items.filter(isReady).length, fail = items.filter((i) => !isReady(i) && i.state === 'fail').length;
    $('zip').disabled = running || !ok;
    $('folder').disabled = running || !ok;
    $('bulkInfo').textContent = items.length ? `${ok} of ${items.length} ready` + (fail ? `, ${fail} need a price.` : '.') : 'Add some games and press Get all prices.';
  }

  function parseLine(line) {
    if (line.includes('|')) {
      const p = line.split('|').map((s) => s.trim());
      const manual = { manual: true, name: p[0], orig: p.length >= 3 ? p[1] : '', final: p.length >= 3 ? p[2] : (p[1] || '') };
      manual.pct = calcPct(manual.orig, manual.final);
      return manual;
    }
    return { input: line };
  }

  async function processItem(it) {
    it.state = 'working'; syncCard(it);
    try {
      if (it.manual) {
        it.state = isReady(it) ? 'ok' : 'fail';
        it.note = 'Manual';
        it.msg = 'Add a sale price.';
      } else {
        let game;
        const id = parseAppId(it.input);
        if (id) game = { appid: id };
        else {
          const list = await searchSteam(it.input);
          if (!list.length) throw Object.assign(new Error('No game found for that name.'), { steam: true });
          game = list[0];
        }
        const r = await getPrice(game.appid);
        it.name = r.name || game.name || ('app-' + game.appid);
        if (!r.price) { it.state = 'fail'; it.msg = 'No price on Steam in this region. Type it below.'; }
        else {
          const p = r.price, onSale = p.discount_percent > 0;
          it.final = p.final_formatted || '';
          it.orig = onSale ? (p.initial_formatted || '') : '';
          it.pct = onSale ? String(p.discount_percent) : '';
          it.state = 'ok';
          it.note = onSale ? `-${p.discount_percent}% on Steam` : 'Not on sale';
        }
      }
    } catch (e) {
      it.state = 'fail';
      it.msg = e.steam ? e.message : 'Could not reach Steam' + why(e) + '. Retry, or type the price below.';
    }
    syncCard(it);
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
    await Promise.all([worker(), worker()]);
    running = false;
    $('bulkGo').disabled = false;
    setTimeout(() => { $('progress').hidden = true; $('bar').style.width = '0'; }, 600);
    refreshBulk();
  }

  $('bulkGo').addEventListener('click', async () => {
    const lines = $('bulkText').value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length || running) return;
    items = lines.map((l) => ({ ...parseLine(l), state: 'pending' }));
    await ensureFonts();
    $('bgrid').replaceChildren(...items.map(cardFor));
    status('');
    await runQueue(items);
    render();
  });
  $('bulkClear').addEventListener('click', () => { if (running) return; items = []; $('bgrid').replaceChildren(); $('bulkText').value = ''; refreshBulk(); });

  async function readyFiles() {
    await ensureFonts();
    const S = +$('scale').value, used = new Set(), out = [];
    for (const it of items.filter(isReady)) {
      const base = safe(it.name || it.input);
      let name = base + '.png', n = 2;
      while (used.has(name.toLowerCase())) name = `${base} (${n++}).png`;
      used.add(name.toLowerCase());
      const cv = document.createElement('canvas');
      drawTag(cv, it, S);
      out.push({ name, blob: await toBlob(cv) });
    }
    return out;
  }

  $('zip').addEventListener('click', async () => {
    $('zip').disabled = true;
    try {
      const files = await readyFiles();
      const data = await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) })));
      const m = await saveBlob(makeZip(data), 'steam-prices.zip', 'ZIP archive', 'application/zip', '.zip');
      status(m || `Downloaded ${files.length} tags.`);
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

  syncAuto();
  render();
  refreshBulk();
})();
