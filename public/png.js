// PNG Converter: turns any image the browser can open into a PNG, entirely client-side.
// Transparency is kept. GIFs use their first frame. Files never leave the computer.
const $ = (sel) => document.querySelector(sel);
const items = []; // { id, name, blob, url, width, height, srcSize }
let nextId = 1;

const drop = $('#pngDrop');
const input = $('#pngInput');

const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);
const baseName = (name) => (name || 'image').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'image';

function uniqueName(name) {
  const taken = new Set(items.map((i) => i.name));
  if (!taken.has(name)) return name;
  const stem = name.replace(/\.png$/i, '');
  let n = 2;
  while (taken.has(`${stem} (${n}).png`)) n++;
  return `${stem} (${n}).png`;
}

// Decode with an <img> (handles the widest range of formats, including SVG), then draw to a canvas.
function decode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(unsupportedMessage(file)));
    };
    img.src = url;
  });
}

function unsupportedMessage(file) {
  const n = (file.name || '').toLowerCase();
  if (/\.(heic|heif)$/.test(n)) return 'HEIC photos can only be opened by Safari. Try this page in Safari, or export the photo as JPEG first.';
  if (/\.tiff?$/.test(n)) return 'TIFF files can only be opened by Safari. Try this page in Safari.';
  if (/\.psd$/.test(n)) return 'Photoshop files can’t be opened in a browser. Export as PNG from Photoshop instead.';
  return 'Your browser couldn’t open this file as an image.';
}

async function toPng(file) {
  const { img, url } = await decode(file);
  try {
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    // SVGs without a set size report 0; give them a sensible default.
    if (!w || !h) {
      w = 1024;
      h = 1024;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('This image is too large for your browser to convert.');
    return { blob, width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function render() {
  const ul = $('#pngList');
  ul.innerHTML = '';
  for (const it of items) ul.appendChild(row(it));
  const ok = items.filter((i) => i.blob);
  $('#pngBar').hidden = items.length === 0;
  $('#pngZip').hidden = ok.length < 2;
  $('#pngSummary').textContent = ok.length
    ? `${ok.length} image${ok.length === 1 ? '' : 's'} converted`
    : items.some((i) => i.busy)
      ? 'Converting…'
      : '';
}

function row(it) {
  const li = document.createElement('li');
  li.className = 'png-item';

  const thumb = document.createElement('div');
  thumb.className = 'png-thumb checker';
  if (it.url) {
    const img = document.createElement('img');
    img.src = it.url;
    img.alt = '';
    thumb.appendChild(img);
  }

  const info = document.createElement('div');
  info.style.minWidth = '0';
  const name = document.createElement('div');
  name.className = 'png-name';
  name.textContent = it.name;
  const meta = document.createElement('div');
  meta.className = 'png-meta' + (it.error ? ' err' : '');
  meta.textContent = it.error
    ? it.error
    : it.busy
      ? 'Converting…'
      : `${it.width}×${it.height} · ${it.type} ${fmtBytes(it.srcSize)} → PNG ${fmtBytes(it.blob.size)}`;
  info.append(name, meta);

  const actions = document.createElement('div');
  actions.className = 'actions';
  if (it.blob) {
    const dl = document.createElement('a');
    dl.className = 'btn';
    dl.href = it.url;
    dl.download = it.name;
    dl.textContent = 'Download';
    actions.appendChild(dl);
  }
  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'btn ghost';
  rm.textContent = 'Remove';
  rm.addEventListener('click', () => {
    if (it.url) URL.revokeObjectURL(it.url);
    items.splice(items.indexOf(it), 1);
    render();
  });
  actions.appendChild(rm);

  li.append(thumb, info, actions);
  return li;
}

function typeLabel(file) {
  const ext = (file.name.match(/\.([^.]+)$/) || [])[1];
  if (ext) return ext.toUpperCase();
  return (file.type.split('/')[1] || 'image').toUpperCase();
}

async function addFiles(fileList) {
  const files = [...fileList].filter((f) => f && (f.type.startsWith('image/') || /\.(jfif|pjpeg|pjp|avif|ico|svg|heic|heif|tiff?|psd|webp|bmp)$/i.test(f.name)));
  if (!files.length) return;
  const jobs = files.map((file) => {
    const it = {
      id: nextId++,
      original: file.name || 'pasted image',
      name: uniqueName(`${baseName(file.name || 'pasted image')}.png`),
      type: typeLabel(file),
      srcSize: file.size,
      busy: true,
    };
    items.push(it);
    return { it, file };
  });
  render();
  for (const { it, file } of jobs) {
    try {
      const { blob, width, height } = await toPng(file);
      Object.assign(it, { blob, width, height, url: URL.createObjectURL(blob) });
    } catch (e) {
      it.error = e.message;
      it.name = it.original;
    }
    it.busy = false;
    render();
  }
  // Single file: start its download straight away.
  if (jobs.length === 1 && jobs[0].it.blob) {
    const a = document.createElement('a');
    a.href = jobs[0].it.url;
    a.download = jobs[0].it.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

/* ---------------- zip (store-only, no compression; PNGs are already compressed) ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer());
    const name = enc.encode(f.name);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(local.buffer, name, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd.buffer, name);

    offset += 30 + name.length + data.length;
  }

  const cdSize = central.reduce((n, p) => n + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

$('#pngZip').addEventListener('click', async () => {
  const ok = items.filter((i) => i.blob);
  if (!ok.length) return;
  const btn = $('#pngZip');
  btn.disabled = true;
  btn.textContent = 'Zipping…';
  try {
    const zip = await makeZip(ok);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip);
    a.download = `converted-pngs-${ok.length}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download all (.zip)';
  }
});

$('#pngClear').addEventListener('click', () => {
  for (const it of items) if (it.url) URL.revokeObjectURL(it.url);
  items.length = 0;
  render();
});

/* ---------------- input: click, drag & drop, paste ---------------- */

input.addEventListener('change', () => {
  addFiles(input.files);
  input.value = '';
});
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    input.click();
  }
});
for (const ev of ['dragenter', 'dragover']) {
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
}
for (const ev of ['dragleave', 'drop']) {
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove('over');
  });
}
drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

// Dropping a file anywhere on the PNG page shouldn't make the browser open it.
const pngView = $('#view-png');
for (const ev of ['dragover', 'drop']) {
  window.addEventListener(ev, (e) => {
    if (!pngView.hidden) {
      e.preventDefault();
      if (ev === 'drop' && !drop.contains(e.target)) addFiles(e.dataTransfer.files);
    }
  });
}

document.addEventListener('paste', (e) => {
  if (pngView.hidden) return;
  const files = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile());
  if (files.length) {
    e.preventDefault();
    addFiles(files);
  }
});
