# awesome-vibe-site

Little tools that speed up YouTube editing. The home screen launches each tool: **Steam Kit**, **Clipart Finder**, **Audio Finder** and **Comment Cards**.

## Steam Kit

Paste a Steam store link (or just the app id) and get everything you need for a video about that game:

- **Logo** – the transparent library logo, as a PNG.
- **Cover & case** – the 600×900 library cover art, plus a game-case mockup (front or angled) exported as a transparent PNG.
- **Store info card** – a recreation of the Steam store sidebar (header image, description, reviews, release date, developer, publisher), exported at 3× resolution. There's also a "Copy text" button.
- **Trailers** – one-click MP4 download of each trailer at the best quality Steam offers.
- **Price tag** – the Steam search-row look: capsule art, name, discount badge, struck-through original price and sale price (or Free / Coming Soon). Pick the store region to get that currency; turn the background off for a transparent PNG.
- **More art** – library hero, store header, page background and every screenshot.

Works with links like `https://store.steampowered.com/app/548430/Deep_Rock_Galactic/`, `steamcommunity.com/app/548430`, `steamdb.info/app/548430`, or `548430`.
You can also link straight to a game with `?app=548430` (add `&cc=ca` for Canadian prices, etc.).

## Clipart Finder

Type keywords and get the 10 most relevant images from [Pixabay](https://pixabay.com/) (clip art/vectors by default, or illustrations, photos, everything). Tick **Transparent background only** for cut-out PNGs, and **Show 10 more** for further results. Pixabay's license allows commercial use with no credit needed in your videos; the site itself shows a small "Images from Pixabay" line, as Pixabay's API terms ask. Skip images that show logos, brands or recognizable people in monetized videos.

It needs a free Pixabay API key:

1. Sign up at pixabay.com, then copy your key from https://pixabay.com/api/docs/ (shown in the `key` parameter row while you're logged in).
2. In Cloudflare: your project → **Settings → Variables and Secrets → Add** → type **Secret**, name `PIXABAY_API_KEY`, paste the key, save.
3. Redeploy (Deployments → ⋯ → Retry deployment) so the secret takes effect.

For local runs, create a `.dev.vars` file next to `server.js` containing your keys, one per line, e.g. `PIXABAY_API_KEY=your-key` (it's git-ignored).

## Audio Finder

Search for **Sound FX** or **Music**, preview right on the page, and download.

- **Sound FX** come from [Freesound](https://freesound.org/), public-domain (CC0) sounds only: free for commercial use, no credit needed. Downloads are Freesound's high-quality MP3 previews.
- **Music** comes from [Jamendo](https://www.jamendo.com/). Only tracks whose Creative Commons license allows commercial use *and* use in a video are shown (no NC or ND licenses). These need credit: **Copy credit** gives you a line for your video description. Some tracks may still be registered with YouTube Content ID, so for monetized videos YouTube Studio's Audio Library is the safest option.

It needs two more secrets, added the same way as the Pixabay one:

| Secret | Where to get it |
| --- | --- |
| `FREESOUND_API_KEY` | freesound.org/apiv2/apply, the **Client secret/Api key** column |
| `JAMENDO_CLIENT_ID` | devportal.jamendo.com, create an application, copy its **Client ID** |

## Comment Cards

Recreate a viewer comment as an overlay: pick **YouTube**, **Instagram** or **TikTok** and **Light** or **Dark**, then fill in the username, comment, time and likes. Optional: upload the commenter's avatar (otherwise a coloured initial is used), a verified badge, and "liked by creator" (your own avatar is remembered for the creator heart). Export a 3× PNG with or without the card background, or copy it straight to the clipboard. These are simplified recreations of each layout without platform logos. Everything runs in the browser; no keys needed.

## Hosting on Cloudflare (free)

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com), open **Workers & Pages** and choose **Create application**.
2. Connect GitHub and pick this repo.
3. Keep the defaults: project name `awesome-vibe-site`, build command empty, deploy command `npx wrangler deploy`.
4. Click **Deploy**. You'll get a `*.workers.dev` link, and every push to `main` redeploys automatically.

`wrangler.jsonc` tells Cloudflare to serve `public/` and send `/api/*` to `worker.js`. (The `functions/` folder also works if you use the older Cloudflare Pages flow instead: build output directory `public`.)

## Running it on your own computer

You need [Node.js](https://nodejs.org/) 18.17 or newer. There's nothing to install:

```bash
npm start
```

Then open http://localhost:3000. The local server runs the exact same `functions/` code as Cloudflare.

## How it works

| Route | What it does |
| --- | --- |
| `GET /api/game?url=…` | Looks up the game via Steam's `appdetails` API, the store browse API (for library art), and the store page (for the review rows). |
| `GET /api/file?src=…&download=…` | Passes files through from Steam's CDN (images, trailer playlists and video segments), Pixabay, Freesound and Jamendo, so the page can use them and save them with tidy names. Only those hosts are accepted. |
| `GET /api/clipart?q=…&type=…&transparent=1&offset=…` | Searches Pixabay with the `PIXABAY_API_KEY` secret. Results are cached for 24 hours, as Pixabay asks. |
| `GET /api/audio?q=…&kind=sfx\|music&offset=…` | Searches Freesound (CC0 only) or Jamendo (commercial + video-safe licenses only). Cached for 24 hours. |

**Trailers** are converted in your browser. Steam streams trailers in small pieces (HLS) rather than offering one file, so `public/trailer.js` picks the highest-quality H.264 stream, downloads its pieces, and uses [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) to join video and audio into one MP4 — a straight copy, no re-encoding. The first trailer you download also loads the converter (~30 MB, from jsDelivr), after which the browser caches it.

## Project layout

```
functions/api/    the API handlers (game.js, file.js, clipart.js, audio.js), shared by every way of running the site
worker.js         Cloudflare Workers entry point; wrangler.jsonc is its config
lib/              shared code: steam.js talks to Steam, http.js has small response helpers
public/           the page: index.html, styles.css, nav.js (home screen + tabs), app.js + trailer.js (Steam Kit), clipart.js, audio.js, comments.js
public/vendor/    ffmpeg.wasm's small JS wrapper (MIT), kept local so its worker loads from the same site
server.js         local dev server that runs the same handlers
```
