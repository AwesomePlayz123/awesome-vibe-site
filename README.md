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
You can also open `http://localhost:3000/?app=548430` directly.

### Run it

You need [Node.js](https://nodejs.org/) 18.17 or newer.

```bash
npm install
npm start
```

Then open http://localhost:3000.

`npm install` pulls in a bundled copy of ffmpeg (`ffmpeg-static`), which is used to turn Steam's trailer streams into normal MP4 files — the video is copied, not re-encoded, so it's fast and lossless. If that install fails, install ffmpeg yourself and make sure `ffmpeg` is on your PATH.

### How it works

| Route | What it does |
| --- | --- |
| `GET /api/game?url=…` | Looks up the game via Steam's `appdetails` API, the store browse API (for library art), and the store page (for the review rows). |
| `GET /api/image?src=…&download=…` | Proxies images from Steam's CDN so the page can draw them on a canvas and save them with tidy filenames. |
| `GET /api/trailer?src=…&name=…` | Remuxes a trailer's HLS stream to MP4 with ffmpeg and sends it back. |

The proxies only accept Steam CDN URLs.

### Project layout

```
server.js         tiny Node HTTP server (no framework)
lib/steam.js      everything that talks to Steam
public/           the page: index.html, styles.css, app.js (canvas rendering lives here)
```
