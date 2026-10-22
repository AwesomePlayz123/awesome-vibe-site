# awesome-vibe-site

Little tools that speed up YouTube editing.

## Steam Kit

Paste a Steam store link (or just the app id) and get everything you need for a video about that game:

- **Logo** – the transparent library logo, as a PNG.
- **Cover & case** – the 600×900 library cover art, plus a game-case mockup (front or angled) exported as a transparent PNG.
- **Store info card** – a recreation of the Steam store sidebar (header image, description, reviews, release date, developer, publisher), exported at 3× resolution. There's also a "Copy text" button.
- **Trailers** – one-click MP4 download of each trailer at the best quality Steam offers.
- **More art** – library hero, store header, page background and every screenshot.

Works with links like `https://store.steampowered.com/app/548430/Deep_Rock_Galactic/`, `steamcommunity.com/app/548430`, `steamdb.info/app/548430`, or `548430`.
You can also link straight to a game with `?app=548430`.

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
| `GET /api/file?src=…&download=…` | Passes files through from Steam's CDN (images, trailer playlists and video segments) so the page can use them and save them with tidy names. Only Steam CDN URLs are accepted. |

**Trailers** are converted in your browser. Steam streams trailers in small pieces (HLS) rather than offering one file, so `public/trailer.js` picks the highest-quality H.264 stream, downloads its pieces, and uses [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) to join video and audio into one MP4 — a straight copy, no re-encoding. The first trailer you download also loads the converter (~30 MB, from jsDelivr), after which the browser caches it.

## Project layout

```
functions/api/    the API handlers (game.js, file.js), shared by every way of running the site
worker.js         Cloudflare Workers entry point; wrangler.jsonc is its config
lib/              shared code: steam.js talks to Steam, http.js has small response helpers
public/           the page: index.html, styles.css, app.js (canvas rendering), trailer.js
public/vendor/    ffmpeg.wasm's small JS wrapper (MIT), kept local so its worker loads from the same site
server.js         local dev server that runs the same handlers
```
