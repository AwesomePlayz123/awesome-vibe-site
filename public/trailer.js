// Turns a Steam trailer (HLS stream or direct MP4) into a single MP4 file, entirely in the browser.
// HLS: read the playlists, download every segment through /api/file, then let ffmpeg.wasm copy the
// video + audio into one MP4 (stream copy, no re-encode).
import { FFmpeg } from './vendor/ffmpeg/index.js';

const CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
const PARALLEL = 6;

const via = (url) => `/api/file?src=${encodeURIComponent(url)}`;

async function fetchText(url) {
  const res = await fetch(via(url));
  if (!res.ok) throw new Error(`Couldn't load trailer playlist (${res.status})`);
  return res.text();
}

async function fetchBytes(url, range) {
  const headers = range ? { Range: `bytes=${range.start}-${range.start + range.length - 1}` } : {};
  const res = await fetch(via(url), { headers });
  if (!res.ok) throw new Error(`Couldn't download a trailer segment (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

function attrs(line) {
  const out = {};
  const body = line.slice(line.indexOf(':') + 1);
  for (const m of body.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) out[m[1]] = m[2].replace(/^"|"$/g, '');
  return out;
}

function parseByteRange(spec, lastEnd) {
  const [len, off] = spec.split('@');
  const length = Number(len);
  const start = off !== undefined ? Number(off) : lastEnd;
  return { start, length };
}

// Master playlist → best video playlist URL and matching audio playlist URL (if audio is separate).
function pickRenditions(text, baseUrl) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (!lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'))) return { video: baseUrl, audio: null };

  const variants = [];
  lines.forEach((l, i) => {
    if (!l.startsWith('#EXT-X-STREAM-INF')) return;
    const a = attrs(l);
    const uri = lines.slice(i + 1).find((x) => x && !x.startsWith('#'));
    if (uri) variants.push({ ...a, url: new URL(uri, baseUrl).href, bw: Number(a.BANDWIDTH) || 0 });
  });
  const h264 = variants.filter((v) => !v.CODECS || /avc1/i.test(v.CODECS));
  const best = (h264.length ? h264 : variants).sort((a, b) => b.bw - a.bw)[0];

  let audio = null;
  if (best.AUDIO) {
    const options = lines
      .filter((l) => l.startsWith('#EXT-X-MEDIA'))
      .map(attrs)
      .filter((m) => m.TYPE === 'AUDIO' && m['GROUP-ID'] === best.AUDIO && m.URI);
    const chosen = options.find((m) => m.DEFAULT === 'YES') || options.find((m) => /^en/i.test(m.LANGUAGE || '')) || options[0];
    if (chosen) audio = new URL(chosen.URI, baseUrl).href;
  }
  return { video: best.url, audio, height: Number((best.RESOLUTION || '').split('x')[1]) || null };
}

// Media playlist → ordered list of parts (init segment first, if any).
function parseMedia(text, baseUrl) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const parts = [];
  let pendingRange = null;
  let lastEnd = 0;
  let fmp4 = false;
  for (const l of lines) {
    if (!l) continue;
    if (l.startsWith('#EXT-X-KEY')) {
      const method = attrs(l).METHOD;
      if (method && method !== 'NONE') throw new Error('This trailer is encrypted and can’t be downloaded.');
    } else if (l.startsWith('#EXT-X-MAP')) {
      const a = attrs(l);
      fmp4 = true;
      parts.push({ url: new URL(a.URI, baseUrl).href, range: a.BYTERANGE ? parseByteRange(a.BYTERANGE, 0) : null });
    } else if (l.startsWith('#EXT-X-BYTERANGE')) {
      pendingRange = parseByteRange(l.split(':')[1], lastEnd);
    } else if (!l.startsWith('#')) {
      const range = pendingRange;
      if (range) lastEnd = range.start + range.length;
      parts.push({ url: new URL(l, baseUrl).href, range });
      pendingRange = null;
    }
  }
  const firstMedia = parts[fmp4 ? 1 : 0]?.url || '';
  const ext = fmp4 ? 'mp4' : /\.aac(\?|$)/i.test(firstMedia) ? 'aac' : 'ts';
  return { parts, ext };
}

async function downloadParts(parts, onPart) {
  const out = new Array(parts.length);
  let next = 0;
  async function worker() {
    while (next < parts.length) {
      const i = next++;
      out[i] = await fetchBytes(parts[i].url, parts[i].range);
      onPart(out[i].length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, parts.length) }, worker));
  const total = out.reduce((n, b) => n + b.length, 0);
  const joined = new Uint8Array(total);
  let o = 0;
  for (const b of out) {
    joined.set(b, o);
    o += b.length;
  }
  return joined;
}

let ffmpegPromise = null;
async function getFFmpeg(onStatus) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      onStatus('Loading the video converter (one-time, ~30 MB)…');
      const toBlobURL = async (url, type) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Could not load the video converter.');
        return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type }));
      };
      const ff = new FFmpeg();
      await ff.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      return ff;
    })().catch((e) => {
      ffmpegPromise = null;
      throw e;
    });
  }
  return ffmpegPromise;
}

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

/**
 * @param {{hls?: string, mp4?: string}} trailer
 * @param {(msg: string) => void} onStatus
 * @returns {Promise<Blob>} an MP4
 */
export async function buildTrailerMp4(trailer, onStatus) {
  if (!trailer.hls) return downloadDirect(trailer.mp4, onStatus);

  onStatus('Reading trailer stream…');
  const master = await fetchText(trailer.hls);
  const pick = pickRenditions(master, trailer.hls);
  const [videoPl, audioPl] = await Promise.all([fetchText(pick.video), pick.audio ? fetchText(pick.audio) : null]);
  const video = parseMedia(videoPl, pick.video);
  const audio = audioPl ? parseMedia(audioPl, pick.audio) : null;

  const totalParts = video.parts.length + (audio?.parts.length || 0);
  let doneParts = 0;
  let bytes = 0;
  const tick = (n) => {
    doneParts++;
    bytes += n;
    onStatus(`Downloading${pick.height ? ` ${pick.height}p` : ''}… ${Math.round((doneParts / totalParts) * 100)}% · ${mb(bytes)}`);
  };

  // Start loading the converter while segments download.
  const ffReady = getFFmpeg(() => {});
  const [vBytes, aBytes] = await Promise.all([
    downloadParts(video.parts, tick),
    audio ? downloadParts(audio.parts, tick) : null,
  ]);

  onStatus('Loading the video converter…');
  const ff = await ffReady;
  onStatus('Putting the MP4 together…');
  const vName = `video.${video.ext}`;
  const aName = audio ? `audio.${audio.ext}` : null;
  await ff.writeFile(vName, vBytes);
  if (aName) await ff.writeFile(aName, aBytes);

  const args = ['-i', vName];
  if (aName) args.push('-i', aName, '-map', '0:v:0', '-map', '1:a:0');
  else args.push('-map', '0:v:0', '-map', '0:a:0?');
  args.push('-c', 'copy', '-movflags', '+faststart', 'out.mp4');

  let log = '';
  const onLog = ({ message }) => (log = (log + '\n' + message).slice(-2000));
  ff.on('log', onLog);
  let code;
  try {
    code = await ff.exec(args);
  } finally {
    ff.off('log', onLog);
  }
  if (code !== 0) {
    await cleanup(ff, [vName, aName, 'out.mp4']);
    console.error(log);
    throw new Error('The converter couldn’t build the MP4 (details in the browser console).');
  }
  const data = await ff.readFile('out.mp4');
  await cleanup(ff, [vName, aName, 'out.mp4']);
  return new Blob([data], { type: 'video/mp4' });
}

async function cleanup(ff, names) {
  for (const n of names.filter(Boolean)) await ff.deleteFile(n).catch(() => {});
}

async function downloadDirect(url, onStatus) {
  const res = await fetch(via(url));
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onStatus(total ? `Downloading ${Math.round((got / total) * 100)}% · ${mb(total)}` : `Downloading ${mb(got)}`);
  }
  return new Blob(chunks, { type: 'video/mp4' });
}
