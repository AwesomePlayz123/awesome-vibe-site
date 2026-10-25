(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  // ---------- Look (measured from a real Steam review) ----------
  const C = {
    page: '#1b2838', box: '#15202c', strip: '#101a25',
    blockUp: '#1e455f', iconUp: '#66c0f4', blockDown: '#5e3035', iconDown: '#e8686b',
    title: '#f1f1f1', muted: '#556772', body: '#acb2b8', head: '#ffffff', rule: '#2e3a46',
    ask: '#5e6978', btn: '#212d3b', btnText: '#66c0f4', btnIcon: '#5c83a6', found: '#6c839b',
    chip: '#101a25', blue: '#66c0f4', star: '#566878', label: '#8f98a0', red: '#d95050', badge: '#2a475e',
    hdrGray: '#5b7284',
  };
  const NAME = { default: '#8f98a0', online: '#57cbde', ingame: '#90ba3c', offline: '#898989' };
  const FONTS = {
    mulish: '"Mulish", Arial, sans-serif', nunito: '"Nunito Sans", Arial, sans-serif',
    figtree: '"Figtree", Arial, sans-serif', arial: 'Arial, Helvetica, sans-serif',
  };
  const BOX_W = 612, PAD = 14, HEAD_H = 28;
  const RX = 213, RW = 393, STRIP_W = 398;   // right column, relative to the review box

  // ---------- Languages ----------
  const TR = {
    en: { rec: 'Recommended', notrec: 'Not Recommended', hours: '{h} hrs on record', at: '({r} hrs at review time)', posted: 'Posted: ', edited: 'Last edited: ', free: 'Product received for free', early: 'Early Access Review', refunded: 'Product refunded', ask: 'Was this review helpful?', yes: 'Yes', no: 'No', funny: 'Funny', award: 'Award', h1: '1 person found this review helpful', hN: '{n} people found this review helpful', f1: '1 person found this review funny', fN: '{n} people found this review funny', rv1: '1 review', rvN: '{n} reviews', prod: '{n} products in account', most: 'Most Helpful Reviews', past: 'In the past 180 days', overall: 'Overall' },
    es: { rec: 'Recomendado', notrec: 'No recomendado', hours: '{h} h registradas', at: '({r} h en el momento del análisis)', posted: 'Publicado: ', edited: 'Última edición: ', free: 'Producto recibido gratis', early: 'Análisis de acceso anticipado', refunded: 'Producto reembolsado', ask: '¿Te ha parecido útil este análisis?', yes: 'Sí', no: 'No', funny: 'Divertido', award: 'Premiar', h1: 'A 1 persona le ha parecido útil este análisis', hN: 'A {n} personas les ha parecido útil este análisis', f1: 'A 1 persona le ha parecido divertido este análisis', fN: 'A {n} personas les ha parecido divertido este análisis', rv1: '1 análisis', rvN: '{n} análisis', prod: '{n} productos en la cuenta', most: 'Análisis más útiles', past: 'En los últimos 180 días', overall: 'Global' },
    fr: { rec: 'Recommandé', notrec: 'Non recommandé', hours: '{h} h au total', at: '({r} h lors de l’évaluation)', posted: 'Posté le : ', edited: 'Dernière modification : ', free: 'Produit reçu gratuitement', early: 'Évaluation en accès anticipé', refunded: 'Produit remboursé', ask: 'Cette évaluation vous a-t-elle été utile ?', yes: 'Oui', no: 'Non', funny: 'Amusant', award: 'Récompenser', h1: '1 personne a trouvé cette évaluation utile', hN: '{n} personnes ont trouvé cette évaluation utile', f1: '1 personne a trouvé cette évaluation amusante', fN: '{n} personnes ont trouvé cette évaluation amusante', rv1: '1 évaluation', rvN: '{n} évaluations', prod: '{n} produits dans le compte', most: 'Évaluations les plus utiles', past: 'Ces 180 derniers jours', overall: 'Globales' },
    de: { rec: 'Empfohlen', notrec: 'Nicht empfohlen', hours: '{h} Std. insgesamt', at: '({r} Std. zum Zeitpunkt der Rezension)', posted: 'Verfasst: ', edited: 'Zuletzt bearbeitet: ', free: 'Produkt kostenlos erhalten', early: 'Rezension im Early Access', refunded: 'Produkt erstattet', ask: 'War diese Rezension hilfreich?', yes: 'Ja', no: 'Nein', funny: 'Lustig', award: 'Auszeichnen', h1: '1 Person fand diese Rezension hilfreich', hN: '{n} Personen fanden diese Rezension hilfreich', f1: '1 Person fand diese Rezension lustig', fN: '{n} Personen fanden diese Rezension lustig', rv1: '1 Rezension', rvN: '{n} Rezensionen', prod: '{n} Produkte auf dem Konto', most: 'Hilfreichste Rezensionen', past: 'In den letzten 180 Tagen', overall: 'Insgesamt' },
    pt: { rec: 'Recomendo', notrec: 'Não recomendo', hours: '{h} h registradas', at: '({r} h no momento da análise)', posted: 'Postado: ', edited: 'Última edição: ', free: 'Produto recebido de graça', early: 'Análise de acesso antecipado', refunded: 'Produto reembolsado', ask: 'Esta análise foi útil?', yes: 'Sim', no: 'Não', funny: 'Engraçada', award: 'Premiar', h1: '1 pessoa achou esta análise útil', hN: '{n} pessoas acharam esta análise útil', f1: '1 pessoa achou esta análise engraçada', fN: '{n} pessoas acharam esta análise engraçada', rv1: '1 análise', rvN: '{n} análises', prod: '{n} produtos na conta', most: 'Análises mais úteis', past: 'Nos últimos 180 dias', overall: 'Geral' },
    it: { rec: 'Consigliato', notrec: 'Non consigliato', hours: '{h} ore in totale', at: '({r} ore al momento della recensione)', posted: 'Pubblicata il: ', edited: 'Ultima modifica: ', free: 'Prodotto ricevuto gratuitamente', early: 'Recensione in accesso anticipato', refunded: 'Prodotto rimborsato', ask: 'Questa recensione ti è stata utile?', yes: 'Sì', no: 'No', funny: 'Divertente', award: 'Premia', h1: '1 persona ha trovato utile questa recensione', hN: '{n} persone hanno trovato utile questa recensione', f1: '1 persona ha trovato divertente questa recensione', fN: '{n} persone hanno trovato divertente questa recensione', rv1: '1 recensione', rvN: '{n} recensioni', prod: '{n} prodotti nell’account', most: 'Recensioni più utili', past: 'Negli ultimi 180 giorni', overall: 'Generale' },
  };
  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
  const num = (s) => parseInt(String(s).replace(/\D/g, ''), 10) || 0;

  const AWARDS = [['', 'None'], ['🏅', 'Helpful'], ['🧠', 'Deep Thoughts'], ['🤣', 'Hilarious'], ['🥰', 'Heartwarming'], ['🤯', 'Mind Blown'], ['🦄', 'Golden Unicorn'], ['🔥', 'Hot Take'], ['🙌', 'Take My Points']];
  const AWARD_DEFAULTS = [['🧠', '4'], ['🤣', '8'], ['🏅', '3'], ['', '']];

  const SAMPLE = "I was skeptical about buying this at first, but it turned out to be one of the best [b]surprises[/b] of the year.\n\n[h2]What I liked[/h2]\n[list]\n[*]Great story and characters\n[*]Smooth combat\n[*]Looks [i]beautiful[/i] on a big screen\n[/list]\n\nThe ending is [spoiler]a total tearjerker[/spoiler]. Highly recommend it.";

  // ---------- Icons ----------
  const P = {
    thumb: new Path2D('M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z'),
    star: new Path2D('M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'),
  };
  function icon(g, path, x, y, size, color, flip) {
    g.save();
    g.translate(x, y);
    g.scale(size / 24, size / 24);
    if (flip) { g.translate(0, 24); g.scale(1, -1); }
    g.fillStyle = color;
    g.fill(path);
    g.restore();
  }
  function smiley(g, x, y, s, color) {
    const r = s / 2 - 0.6;
    g.save();
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 1.2;
    g.beginPath(); g.arc(x + s / 2, y + s / 2, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(x + s / 2 - r * 0.38, y + s / 2 - r * 0.25, 0.9, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + s / 2 + r * 0.38, y + s / 2 - r * 0.25, 0.9, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + s / 2, y + s / 2 + r * 0.05, r * 0.55, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.restore();
  }
  function medal(g, x, y, color) {
    g.save();
    g.fillStyle = color; g.strokeStyle = color;
    g.beginPath(); g.moveTo(x + 2, y + 6); g.lineTo(x + 0.5, y + 13); g.lineTo(x + 3.5, y + 11.2); g.lineTo(x + 5, y + 13.5); g.lineTo(x + 5, y + 7); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x + 8, y + 6); g.lineTo(x + 9.5, y + 13); g.lineTo(x + 6.5, y + 11.2); g.lineTo(x + 5, y + 13.5); g.lineTo(x + 5, y + 7); g.closePath(); g.fill();
    g.lineWidth = 2; g.beginPath(); g.arc(x + 5, y + 4, 3, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  // ---------- Steam BBCode ----------
  function parseBB(src) {
    const lines = [];
    const st = { b: 0, i: 0, u: 0, s: 0, sp: 0 };
    let head = 0, list = null, n = 0, swallow = false;
    const fresh = (bullet) => ({ head, bullet: bullet || null, runs: [] });
    let cur = fresh();
    const push = () => {
      if (list && !cur.runs.length && !cur.bullet) { cur = fresh(); return; }
      lines.push(cur); cur = fresh();
    };
    const addText = (t) => {
      if (swallow && t.startsWith('\n')) t = t.slice(1);
      if (t) swallow = false;
      t.split('\n').forEach((p, k) => {
        if (k > 0) push();
        if (p) cur.runs.push({ t: p, b: st.b > 0, i: st.i > 0, u: st.u > 0, s: st.s > 0, sp: st.sp > 0 });
      });
    };
    const re = /\[(\/?)(b|i|u|strike|spoiler|h1|h2|h3|hr|list|olist|\*)\]/gi;
    let last = 0, m;
    const text = src.replace(/\r/g, '');
    while ((m = re.exec(text))) {
      addText(text.slice(last, m.index));
      last = re.lastIndex;
      const close = !!m[1], tag = m[2].toLowerCase();
      if (['b', 'i', 'u', 'strike', 'spoiler'].includes(tag)) {
        const k = { b: 'b', i: 'i', u: 'u', strike: 's', spoiler: 'sp' }[tag];
        st[k] = Math.max(0, st[k] + (close ? -1 : 1));
      } else if (/^h[123]$/.test(tag)) {
        if (!close) { if (cur.runs.length || cur.bullet) push(); head = +tag[1]; cur.head = head; }
        else { if (cur.runs.length) push(); head = 0; cur.head = 0; swallow = true; }
      } else if (tag === 'hr') {
        if (close) continue;
        if (cur.runs.length) push();
        lines.push({ kind: 'hr' }); swallow = true;
      } else if (tag === 'list' || tag === 'olist') {
        if (!close) { if (cur.runs.length) push(); list = tag; n = 0; swallow = true; }
        else { if (cur.runs.length || cur.bullet) push(); list = null; swallow = true; }
      } else if (tag === '*') {
        if (close) continue;
        if (cur.runs.length || cur.bullet) push();
        n++;
        cur = fresh(list === 'olist' ? n + '.' : '•');
      }
    }
    addText(text.slice(last));
    if (cur.runs.length || cur.bullet || !lines.length) lines.push(cur);
    return lines;
  }

  function layoutRows(lines, maxW, fam) {
    const rows = [];
    for (const ln of lines) {
      if (ln.kind === 'hr') { rows.push({ hr: true, lh: 17 }); continue; }
      const hd = ln.head, size = hd ? [0, 22, 18, 15][hd] : 13, lh = hd ? [0, 28, 24, 20][hd] : 17;
      const indent = ln.bullet ? 18 : 0, avail = maxW - indent;
      const atoms = [];
      for (const r of ln.runs) {
        const font = `${r.i ? 'italic ' : ''}${r.b || hd ? 700 : 400} ${size}px ${fam}`;
        ctx.font = font;
        for (const tok of r.t.split(/( +)/)) {
          if (!tok) continue;
          atoms.push({ t: tok, font, w: ctx.measureText(tok).width, sp: tok[0] === ' ', r });
        }
      }
      let cur = [], x = 0;
      const out = [];
      const flush = () => { while (cur.length && cur[cur.length - 1].sp) cur.pop(); out.push(cur); cur = []; x = 0; };
      for (const a of atoms) {
        if (a.sp) { if (cur.length) { cur.push(a); x += a.w; } continue; }
        if (x + a.w > avail && cur.length) flush();
        if (a.w > avail) {
          ctx.font = a.font;
          let chunk = '';
          for (const ch of a.t) {
            if (ctx.measureText(chunk + ch).width > avail && chunk) { cur.push({ ...a, t: chunk, w: ctx.measureText(chunk).width }); flush(); chunk = ch; }
            else chunk += ch;
          }
          if (chunk) { const w = ctx.measureText(chunk).width; cur.push({ ...a, t: chunk, w }); x += w; }
        } else { cur.push(a); x += a.w; }
      }
      flush();
      out.forEach((at, k) => rows.push({ atoms: at, size, lh, indent, bullet: k === 0 ? ln.bullet : null, head: hd }));
    }
    return rows;
  }

  function drawRow(g, row, x, top, fam) {
    if (row.hr) { g.fillStyle = C.rule; g.fillRect(x, top + 8, RW, 1); return; }
    const base = top + (row.lh - row.size) / 2 + row.size * 0.8;
    g.textAlign = 'left';
    if (row.bullet) { g.font = `400 ${row.size}px ${fam}`; g.fillStyle = C.body; g.fillText(row.bullet, x + (row.bullet === '•' ? 4 : 0), base); }
    let cx = x + row.indent;
    for (const a of row.atoms) {
      g.font = a.font;
      if (a.r.sp) { g.fillStyle = '#000'; g.fillRect(cx, top + 1, a.w, row.lh - 2); }
      else {
        g.fillStyle = row.head ? C.head : C.body;
        g.fillText(a.t, cx, base);
        if (a.r.u) g.fillRect(cx, base + 1.5, a.w, 1);
        if (a.r.s) g.fillRect(cx, base - row.size * 0.3, a.w, 1);
      }
      cx += a.w;
    }
  }

  function spaced(g, text, x, y, sp) {
    for (const ch of text) { g.fillText(ch, x, y); x += g.measureText(ch).width + sp; }
    return x;
  }

  // ---------- State ----------
  let rec = 'yes';
  let avatarImg = null;
  let renderId = 0;

  function params() {
    return {
      rec, fam: FONTS[$('font').value], T: TR[$('lang').value], avatar: avatarImg, S: +$('scale').value,
      name: $('username').value.trim() || 'username', nameColor: NAME[$('namecolor').value],
      reviews: $('reviews').value.trim(), products: $('products').value.trim(),
      hours: $('hours').value.trim(), at: $('atreview').value.trim(),
      posted: $('posted').value.trim(), edited: $('edited').value.trim(),
      free: $('free').checked, early: $('early').checked, refunded: $('refunded').checked,
      text: $('text').value, helpful: num($('helpful').value), funny: num($('funny').value),
      user: $('user').checked, buttons: $('buttons').checked, header: $('header').value, bg: $('bg').value,
      awards: [...document.querySelectorAll('.award')].map((r) => ({ e: r.querySelector('select').value, n: r.querySelector('input').value.trim() })).filter((a) => a.e),
    };
  }

  async function render() {
    const id = ++renderId;
    const p = params();
    if (!avatarImg) return;
    const sample = p.name + p.text + p.hours + p.posted + p.edited + Object.values(p.T).join('');
    try {
      await Promise.all(['400', '500', '600', '700', 'italic 400', 'italic 700'].map((w) => document.fonts.load(`${w} 14px ${p.fam}`, sample)));
    } catch (e) {}
    if (id !== renderId) return;
    draw(p);
  }

  function draw(p) {
    const { T, fam, S } = p;
    const g = ctx;
    const inset = p.user ? 0 : 14;                 // breathing room around the review when the user column is hidden
    const rx = p.user ? RX : inset;                // right column x (the review itself)
    const boxW = p.user ? BOX_W : STRIP_W + inset * 2;
    const dy = p.user ? 0 : inset - 6;             // move the review down so the top gap matches the sides
    const steam = p.bg === 'steam';
    const padX = steam ? PAD : 0, padT = steam ? PAD : 0, padB = steam ? PAD : 0;
    const showHead = p.header !== 'none';
    const bx = padX, by = padT + (showHead ? HEAD_H : 0);

    // ---- text and vertical layout (relative to the top of the review box) ----
    const lines = parseBB(p.text);
    const hasText = p.text.trim().length > 0;
    const rows = hasText ? layoutRows(lines, RW, fam) : [];

    const hasPosted = !!(p.posted || p.edited);
    ctx.font = `400 11px ${fam}`;
    const postedStr = p.posted ? (T.posted + p.posted).toUpperCase() : '';
    const editedStr = p.edited ? (T.edited + p.edited).toUpperCase() : '';
    const editedOwnLine = !!(postedStr && editedStr && ctx.measureText(postedStr).width + 14 + ctx.measureText(editedStr).width > RW);
    const labels = [];
    if (p.free) labels.push({ t: T.free, color: C.red });
    if (p.early) labels.push({ t: T.early.toUpperCase(), badge: true });
    if (p.refunded) labels.push({ t: T.refunded, color: C.red });
    let lastLabel = 46, prevBadge = false;
    if (hasPosted) lastLabel = editedOwnLine ? 85 : 70;
    const labelBase = labels.map((l, i) => { lastLabel += (hasPosted || i ? 17 : 24) + (prevBadge ? 3 : 0); prevBadge = !!l.badge; return lastLabel; });
    const firstBase = lastLabel + (prevBadge ? 27 : 24);
    let cursor = firstBase - 12.4;
    const rowTops = rows.map((r) => { const t = cursor; cursor += r.lh; return t; });
    const rule = cursor + 9;

    let y = rule;
    let askBase = 0, btnTop = 0, btnBottom = rule;
    if (p.buttons) { askBase = rule + 19; btnTop = askBase + 14; btnBottom = btnTop + 22; y = btnBottom; }
    const counts = [];
    if (p.helpful > 0) counts.push(fmt(p.helpful === 1 ? T.h1 : T.hN, { n: p.helpful.toLocaleString('en-US') }));
    if (p.funny > 0) counts.push(fmt(p.funny === 1 ? T.f1 : T.fN, { n: p.funny.toLocaleString('en-US') }));
    const countFirst = (p.buttons ? btnBottom + 23 : rule + 20);
    if (counts.length) y = countFirst + 14 * (counts.length - 1) + 12;
    const awardTop = counts.length ? countFirst + 14 * (counts.length - 1) + 17 : (p.buttons ? btnBottom + 15 : rule + 12);
    let boxH;
    if (p.awards.length) boxH = awardTop + 29 + 9; else boxH = y + 9;
    boxH = Math.ceil(Math.max(boxH + dy + (p.user ? 0 : 5), p.user ? 100 : 60));

    // the section header can be wider than the review when the user column is hidden
    let headW = 0;
    if (showHead) {
      g.font = `600 14px ${fam}`;
      const sw = (t) => [...t].reduce((a, ch) => a + g.measureText(ch).width + 2.2, 0);
      headW = Math.ceil(sw(T.most.toUpperCase()) + 10 + sw((p.header === 'helpful' ? T.past : T.overall).toUpperCase()));
    }
    const lineW = Math.max(boxW, headW);
    const W = padX * 2 + lineW, H = by + boxH + padB;
    canvas.width = W * S; canvas.height = H * S;
    canvas.style.width = W + 'px';
    g.setTransform(S, 0, 0, S, 0, 0);
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';

    if (steam) { g.fillStyle = C.page; g.fillRect(0, 0, W, H); }

    // ---- section header ----
    if (showHead) {
      const base = padT + 17;
      g.font = `600 14px ${fam}`;
      g.fillStyle = '#ffffff';
      let hx = spaced(g, T.most.toUpperCase(), padX, base, 2.2);
      g.fillStyle = C.hdrGray;
      spaced(g, (p.header === 'helpful' ? T.past : T.overall).toUpperCase(), hx + 10, base, 2.2);
      const grad = g.createLinearGradient(padX, 0, padX + lineW, 0);
      grad.addColorStop(0, 'rgba(75,107,132,1)');
      grad.addColorStop(1, 'rgba(75,107,132,0)');
      g.fillStyle = grad;
      g.fillRect(padX, padT + 27, lineW, 1);
    }

    // ---- review box ----
    g.fillStyle = C.box;
    g.fillRect(bx, by, boxW, boxH);

    // left column
    if (p.user) {
    const ax = bx + 8, ay = by + 6;
    g.fillStyle = '#474d54'; g.fillRect(ax, ay, 36, 36);
    g.fillStyle = '#1c2227'; g.fillRect(ax + 1, ay + 1, 34, 34);
    g.drawImage(p.avatar, ax + 2, ay + 2, 32, 32);
    g.fillStyle = p.nameColor; g.font = `700 14px ${fam}`;
    g.fillText(p.name, bx + 51, by + 19, 150);
    g.fillStyle = C.label; g.font = `400 12px ${fam}`;
    let ly = by + 36;
    if (p.products) { g.fillText(fmt(T.prod, { n: p.products }), bx + 51, ly, 150); ly += 15; }
    if (p.reviews) g.fillText(p.reviews === '1' ? T.rv1 : fmt(T.rvN, { n: p.reviews }), bx + 51, ly, 150);

    }

    // right column (the review), shifted up when the user column is hidden
    g.save();
    g.translate(0, dy);
    // recommendation strip
    const up = p.rec === 'yes';
    g.fillStyle = C.strip; g.fillRect(bx + rx, by + 6, STRIP_W, 42);
    g.fillStyle = up ? C.blockUp : C.blockDown; g.fillRect(bx + rx, by + 7, 40, 40);
    // Centre the thumb's actual outline (x 1–23, y 1–21 of its 24-unit box; 3–23 when flipped) in the 40px block.
    const TS = 28, k = TS / 24;
    icon(g, P.thumb, bx + rx + 20 - 12 * k, by + 27 - (up ? 11 : 13) * k, TS, up ? C.iconUp : C.iconDown, !up);
    g.fillStyle = C.title; g.font = `500 16px ${fam}`;
    g.fillText(up ? T.rec : T.notrec, bx + rx + 50, by + 23);
    const hrs = p.hours ? fmt(T.hours, { h: p.hours }) + (p.at ? ' ' + fmt(T.at, { r: p.at }) : '') : '';
    if (hrs) { g.fillStyle = C.muted; g.font = `400 12px ${fam}`; g.fillText(hrs, bx + rx + 50, by + 39); }
    icon(g, P.star, bx + rx + 373, by + 17, 20, C.star);

    // posted / labels
    if (hasPosted) {
      g.fillStyle = C.muted; g.font = `400 11px ${fam}`;
      if (postedStr) g.fillText(postedStr, bx + rx, by + 70);
      if (editedStr) {
        const ex = editedOwnLine || !postedStr ? bx + rx : bx + rx + g.measureText(postedStr).width + 14;
        g.fillText(editedStr, ex, by + (editedOwnLine ? 85 : 70));
      }
    }
    labels.forEach((l, i) => {
      const y = by + labelBase[i];
      if (l.badge) {                              // Early Access: blue rectangle with light-blue text
        g.font = `700 11px ${fam}`;
        const sp = 0.6, tw = [...l.t].reduce((a, ch) => a + g.measureText(ch).width + sp, 0) - sp;
        g.fillStyle = C.badge; g.fillRect(bx + rx, y - 13, Math.ceil(tw) + 14, 18);
        g.fillStyle = C.blue; spaced(g, l.t, bx + rx + 7, y, sp);
      } else {                                    // received for free / refunded: red text
        g.font = `400 12px ${fam}`; g.fillStyle = l.color;
        g.fillText(l.t, bx + rx, y);
      }
    });

    // review text
    rows.forEach((r, i) => drawRow(g, r, bx + rx, by + rowTops[i], fam));

    // controls
    g.fillStyle = C.rule; g.fillRect(bx + rx, by + Math.round(rule), RW, 1);
    if (p.buttons) {
      g.fillStyle = C.ask; g.font = `400 12px ${fam}`;
      g.fillText(T.ask, bx + rx, by + askBase);
      const defs = [[T.yes, 7, 14, 4, 'up'], [T.no, 7, 14, 4, 'down'], [T.funny, 6, 13, 6.5, 'funny'], [T.award, 6, 10, 3, 'award']];
      let x = bx + rx;
      g.font = `500 13px ${fam}`;
      for (const [label, pl, iw, gap, kind] of defs) {
        const tw = g.measureText(label).width, w = pl + iw + gap + tw + 6;
        g.fillStyle = C.btn; g.fillRect(x, by + btnTop, w, 22);
        const iy = by + btnTop + 4;
        if (kind === 'up') icon(g, P.thumb, x + pl, iy, 14, C.btnIcon, false);
        else if (kind === 'down') icon(g, P.thumb, x + pl, iy + 1, 14, C.btnIcon, true);
        else if (kind === 'funny') smiley(g, x + pl, iy + 0.5, 13, C.btnIcon);
        else medal(g, x + pl, iy, '#e8b84a');
        g.fillStyle = C.btnText; g.font = `500 13px ${fam}`;
        g.fillText(label, x + pl + iw + gap, by + btnTop + 15.5);
        x += w + 3;
      }
    }
    g.fillStyle = C.found; g.font = `400 12px ${fam}`;
    counts.forEach((t, i) => g.fillText(t, bx + rx, by + countFirst + 14 * i));

    // awards
    let cx = bx + rx;
    for (const a of p.awards) {
      g.font = `600 13px ${fam}`;
      const cw = a.n ? 7 + 18 + 8 + g.measureText(a.n).width + 9 : 29;
      g.fillStyle = C.chip; g.fillRect(cx, by + awardTop, cw, 29);
      g.font = '16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(a.e, cx + (a.n ? 7 + 9 : cw / 2), by + awardTop + 15);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      if (a.n) { g.fillStyle = C.blue; g.font = `600 13px ${fam}`; g.fillText(a.n, cx + 7 + 18 + 8, by + awardTop + 19.5); }
      cx += cw + 8;
    }

    g.restore();

    $('size').textContent = `${canvas.width} × ${canvas.height} px`;
  }

  // ---------- Avatar ----------
  const status = (m) => { $('pic-status').textContent = m || ''; };
  function setAvatar(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => { avatarImg = im; $('pic-thumb').src = src; render(); resolve(); };
      im.onerror = reject;
      im.src = src;
    });
  }
  function silhouette() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#2b3138'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#5d6772';
    g.beginPath(); g.arc(128, 98, 42, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(46, 256); g.bezierCurveTo(46, 190, 86, 166, 128, 166); g.bezierCurveTo(170, 166, 210, 190, 210, 256); g.fill();
    return c.toDataURL('image/png');
  }
  function cropToSquare(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => {
        const s = Math.min(im.width, im.height);
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 256, 256);
        resolve(c.toDataURL('image/jpeg', 0.92));
      };
      im.onerror = reject;
      im.src = src;
    });
  }
  const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  function generatedAvatar() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const h = Math.floor(Math.random() * 360);
    const grad = g.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, `hsl(${h} 70% 55%)`); grad.addColorStop(1, `hsl(${(h + 60) % 360} 70% 38%)`);
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#fff'; g.font = `700 120px ${FONTS.mulish}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(($('username').value.trim()[0] || 'S').toUpperCase(), 128, 136);
    return c.toDataURL('image/png');
  }

  $('upload').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { await setAvatar(await cropToSquare(await blobToDataURL(f))); status(''); }
    catch (err) { status('That file could not be read as an image.'); }
  });
  $('randomize').addEventListener('click', async () => {
    const btn = $('randomize');
    btn.disabled = true; status('');
    try {
      const group = Math.random() < 0.5 ? 'men' : 'women';
      const res = await fetch(`https://randomuser.me/api/portraits/${group}/${Math.floor(Math.random() * 100)}.jpg`);
      if (!res.ok) throw new Error('bad response');
      await setAvatar(await blobToDataURL(await res.blob()));
    } catch (err) {
      await setAvatar(generatedAvatar());
      status('Could not reach the photo service, so a generated avatar was used.');
    }
    btn.disabled = false;
  });

  // ---------- Controls ----------
  document.querySelectorAll('#rec button').forEach((b) => b.addEventListener('click', () => {
    rec = b.dataset.v;
    document.querySelectorAll('#rec button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));

  const awardsBox = $('awards');
  AWARD_DEFAULTS.forEach(([e, n]) => {
    const row = document.createElement('div');
    row.className = 'award';
    const sel = document.createElement('select');
    AWARDS.forEach(([v, l]) => sel.append(new Option(v ? v + '  ' + l : 'No award', v)));
    sel.value = e;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.maxLength = 5; inp.placeholder = 'Count'; inp.value = n;
    row.append(sel, inp);
    awardsBox.append(row);
  });

  $('text').value = SAMPLE;
  document.querySelectorAll('#bb button').forEach((b) => b.addEventListener('click', () => {
    const ta = $('text');
    const o = b.dataset.o.replace(/\\n/g, '\n'), c = b.dataset.c.replace(/\\n/g, '\n');
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + o + ta.value.slice(s, e) + c + ta.value.slice(e);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + o.length + (e - s);
    render();
  }));

  document.querySelectorAll('.form input, .form textarea, .form select').forEach((el) => {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  $('reset').addEventListener('click', () => {
    const f = { username: 'NiN', reviews: '75', products: '', hours: '2.1', atreview: '0.9', posted: '19 February', edited: '', helpful: '64', funny: '73' };
    Object.entries(f).forEach(([k, v]) => ($(k).value = v));
    $('text').value = SAMPLE;
    ['free', 'early', 'refunded'].forEach((k) => ($(k).checked = false));
    $('buttons').checked = true; $('user').checked = false;
    ['namecolor', 'bg', 'lang', 'font'].forEach((k) => ($(k).selectedIndex = 0));
    $('header').value = 'none';
    $('scale').value = '2';
    document.querySelectorAll('.award').forEach((r, i) => { r.querySelector('select').value = AWARD_DEFAULTS[i][0]; r.querySelector('input').value = AWARD_DEFAULTS[i][1]; });
    rec = 'yes';
    document.querySelectorAll('#rec button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === 'yes')));
    status('');
    setAvatar(silhouette());
  });

  // ---------- Download / copy ----------
  const toBlob = () => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), 'image/png'));
  $('download').addEventListener('click', async () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await toBlob());
    a.download = 'steam-review.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('copy').addEventListener('click', async () => {
    const btn = $('copy');
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await toBlob() })]); btn.textContent = 'Copied!'; }
    catch (e) { btn.textContent = 'Copy failed'; }
    setTimeout(() => (btn.textContent = 'Copy'), 1500);
  });

  // ---------- Collapsible sections (remembers which ones you left open) ----------
  document.querySelectorAll('details.sec').forEach((d) => {
    const key = 'steam-review.open.' + d.dataset.sec;
    try { const v = localStorage.getItem(key); if (v !== null) d.open = v === '1'; } catch (e) {}
    d.addEventListener('toggle', () => { try { localStorage.setItem(key, d.open ? '1' : '0'); } catch (e) {} });
  });

  // ---------- Optional: copy a real review from its link ----------
  const linkStatus = (msg, kind) => { const el = $('linkStatus'); el.textContent = msg; el.className = 'hint' + (kind ? ' ' + kind : ''); };
  async function copyReview() {
    const url = $('reviewUrl').value.trim();
    if (!url) { linkStatus('Paste a link to a Steam review first.', 'err'); return; }
    const btn = $('fetchReview');
    btn.disabled = true;
    linkStatus('Reading the review…');
    try {
      const res = await fetch('/api/steam-review?url=' + encodeURIComponent(url));
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Couldn’t read that review (' + res.status + ').');

      const set = (id, v) => ($(id).value = v == null ? '' : String(v));
      set('username', d.name);
      $('namecolor').value = d.status || 'default';
      set('reviews', d.reviews);
      set('products', d.products);
      set('hours', d.hours);
      set('atreview', d.atReview);
      set('posted', d.posted);
      set('edited', d.edited);
      $('free').checked = !!d.free;
      $('early').checked = !!d.earlyAccess;
      $('refunded').checked = !!d.refunded;
      set('text', d.text);
      set('helpful', d.helpful);
      set('funny', d.funny);
      $('lang').value = 'en';
      // Awards aren't copied, so clear the sample ones.
      document.querySelectorAll('.award').forEach((r) => { r.querySelector('select').value = ''; r.querySelector('input').value = ''; });
      rec = d.recommended === false ? 'no' : 'yes';
      document.querySelectorAll('#rec button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === rec)));

      let avatarNote = '';
      if (d.avatar) {
        try { await setAvatar('/api/file?src=' + encodeURIComponent(d.avatar)); status(''); }
        catch (e) { avatarNote = ' (couldn’t load their picture)'; }
      }
      render();
      const missing = [!d.products && 'products in account', !d.reviews && 'reviews written'].filter(Boolean);
      linkStatus(
        'Copied ' + (d.name ? d.name + '’s' : 'the') + ' review' + (d.game ? ' of ' + d.game : '') + avatarNote + '.' +
          (missing.length ? ' Their profile hides ' + missing.join(' and ') + ', so fill those in if you want them.' : ''),
        'ok'
      );
    } catch (e) {
      linkStatus(e.message, 'err');
    } finally {
      btn.disabled = false;
    }
  }
  $('fetchReview').addEventListener('click', copyReview);
  $('reviewUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); copyReview(); } });

  setAvatar(silhouette());
})();
