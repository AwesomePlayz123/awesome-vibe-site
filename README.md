# awesome-vibe-site

Little tools that speed up YouTube editing. The home screen launches each tool, with the Steam tools grouped in a **Steam** folder (and a **Steam ▾** menu in the navbar):

- **Steam**: Steam Kit, Case Generator, Review Generator, Price Generator
- **Clipart Finder**, **Audio Finder**, **Comment Cards**, **PNG Converter**, **Thumbnail Viewer**, **Script Writer**

The Case, Review and Price generators and the Thumbnail Viewer were merged in from [notUltraHazard/vibe-tools](https://github.com/notUltraHazard/vibe-tools) and restyled to match this site.

## Steam Kit

Type a game's name and pick it from the suggestions (like the Steam store's search box), or paste a Steam store link or app id. You get everything you need for a video about that game:

- **Logo** – the transparent library logo, as a PNG.
- **Cover & case** – the 600×900 library cover art, plus a case mockup exported as a transparent PNG: our black case (front or angled) or the **Steam case** from the Case Generator (same template and output size).
- **Store info card** – a recreation of the Steam store sidebar (header image, description, reviews, release date, developer, publisher), exported at 3× resolution. There's also a "Copy text" button.
- **Trailers** – one-click MP4 download of each trailer at the best quality Steam offers.
- **Price tag** – the Steam search-row look: capsule art, name, discount badge, struck-through original price and sale price (or Free / Coming Soon). Pick the store region to get that currency; turn the background off for a transparent PNG.
- **More art** – library hero, store header, page background and every screenshot.

Works with links like `https://store.steampowered.com/app/548430/Deep_Rock_Galactic/`, `steamcommunity.com/app/548430`, `steamdb.info/app/548430`, or `548430`.
You can also link straight to a game with `?app=548430` (add `&cc=ca` for Canadian prices, etc.).

## Steam Case, Review and Price generators

- **Case Generator**: puts a game's cover into a Steam case (search by name, paste a link, or upload your own image), one at a time or a whole list at once (ZIP). Covers come from Steam first, then SteamGridDB if you add a free SteamGridDB API key under *Cover sources and settings* (stored in your browser).
- **Review Generator**: builds a Steam store review (recommended or not, hours, dates, Steam formatting, votes, awards) and exports a PNG. Optionally paste a review link (`steamcommunity.com/id/<name>/recommended/<appid>`) and it copies the name, picture, hours, dates, text and votes, all still editable. Awards aren't copied, and products/reviews counts only come through when the profile shows them.
- **Price Generator**: Steam discount tags, pulled from Steam or typed in, single or bulk (ZIP), in several store regions.

All Steam and SteamGridDB lookups go through this site's own `/api/proxy`, so no third-party proxies are involved. Your SteamGridDB key is only ever forwarded to SteamGridDB.

## Thumbnail Viewer

Upload a thumbnail and title and see them in a YouTube-style grid next to other videos.

- **Videos & channels** (default, no key): paste YouTube video and/or channel links. Channels contribute their most viewed recent uploads from YouTube's public RSS feed (latest 15, Shorts skipped); videos come from YouTube's public oEmbed. Save link lists by name to reload them later (stored in your browser).
- **Niche search** (optional): the most viewed videos in a niche over the last 30 days. Only YouTube's Data API can search, so this mode needs a free API key pasted into the page.

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

- **Playlists**: paste a Spotify playlist or album link to listen in Spotify's own player (full songs if you're logged into Spotify in that browser, otherwise 30-second previews). **Save** keeps it in a list on that tab (stored in your browser), where you can rename, remove, or click to load it again. Under it, **Played so far** lists each song as it plays (newest first, the current one marked), with the artist, a link to the song on Spotify, and a YouTube search for the song and artist (the artist comes from the song page's link-preview info, the same thing chat apps show for a pasted Spotify link). That list uses Spotify's official player API and is kept only for the current visit. There's no downloading of Spotify songs; to use one in a Short, add it through the YouTube Shorts editor's **Add sound**.

Sound FX and Music need two more secrets, added the same way as the Pixabay one:

| Secret | Where to get it |
| --- | --- |
| `FREESOUND_API_KEY` | freesound.org/apiv2/apply, the **Client secret/Api key** column |
| `JAMENDO_CLIENT_ID` | devportal.jamendo.com, create an application, copy its **Client ID** |

## Comment Cards

Recreate a viewer comment as an overlay for **YouTube**, **Instagram** or **TikTok**. Two previews update together, each with its own Download and Copy:

- **Compact**: sized close to the real apps.
- **Bold**: bigger text that reads better in a video (the layouts from the vibe-tools Comment Generator).

Options: username, comment, time, likes; **Replying to** (Instagram) and **Channel name** for "Pinned by" (YouTube); **Badge** (verified, creator/channel owner, pinned); **Color** (Light/Dark, or White/Black/Blue on Instagram); **Language** for the labels (English, Spanish, French, German, Portuguese, Italian); **Font**; avatar upload or **Randomize**; **Liked by creator** with your own remembered avatar; card background on/off for a transparent PNG; drop shadow. Everything runs in the browser; no keys needed.

## PNG Converter

Drop, choose or paste (Ctrl+V) images in WebP, JPEG, JFIF, AVIF, GIF (first frame), BMP, SVG or ICO and get PNGs back with transparency kept. A single file downloads straight away; with several, use each **Download** button or **Download all (.zip)**. Everything runs in the browser and nothing is uploaded. HEIC and TIFF only open in Safari, since other browsers can't read them.

## Script Writer

Say what the video is (e.g. "Game showcase"), add any details to work in, a style ("funny, personable, non-robotic") and a length (15–90s presets or any number of seconds), and it writes a voiceover script sized to fit: about 2.6 words per second, the natural pace of a Short. The word count and read time update as you edit, with a badge showing whether it fits. **Regenerate** keeps earlier versions as **Takes** you can flip between.

**Game research**: search for a game in the **Game** box (or paste its Steam store link) and the script is built on real facts from Steam: the store description and "about" text, genres, popular player tags, modes, developer, release date, price, review score, and the most helpful English player reviews (paraphrased, never quoted). **What the AI will know about it** shows exactly what was found, so you can check it. If Steam can't be reached, the script is still written from what you typed, and the page says so. Research is cached for a day per game.

**Saved styles**: **Edit styles** opens a popup where you name a style and paste your own instructions for the AI (your channel, series, script structure, voice, do's and don'ts). Pick it in the **Saved style** dropdown and the AI follows it first; the length you choose still sets the word count, and Style notes and Details add to it. Saved styles stay in your browser.

**AI settings** picks the AI:

- **Built-in AI** (default): Cloudflare Workers AI (Llama 3.3 70B), free within Cloudflare's daily allowance and no key needed. It has to be switched on once: in the Cloudflare dashboard open **Workers & Pages** → this site → **Settings** → **Bindings** → **Add** → **Workers AI**, variable name `AI`, save, then **Retry deployment** on the latest deployment. (A Workers deployment picks it up from `wrangler.jsonc` automatically.)
- **AI of your choice**: Claude (Anthropic) or ChatGPT (OpenAI) with your own API key and an editable model name (defaults `claude-haiku-5-5` and `gpt-5.4-mini`). The key is kept only in your browser (untick "Remember" to not save it at all) and sent with each request straight through to that provider. It's never stored on the site.

If a draft lands well off the target length, the server asks the AI for one tightened or expanded rewrite.

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
| `GET /api/steam-search?q=…&cc=…` | Game-name suggestions from the Steam store search (falls back to Valve's Web API search), with capsule art and prices. |
| `GET /api/game?url=…` | Looks up the game via Steam's `appdetails` API, the store browse API (for library art), and the store page (for the review rows). The Steam store site sometimes blocks cloud servers like Cloudflare's; when it does, everything comes from Valve's Web API (`api.steampowered.com`) instead, minus the "Recent reviews" row. |
| `GET /api/proxy?url=…` | Pass-through for the Case/Review/Price tools, limited to Steam's store API, Steam's Web API, Steam's image CDN and SteamGridDB. |
| `GET /api/steam-review?url=…` | Reads a public Steam review page (and the reviewer's profile for their game and review counts) for the Review Generator's link tab. No API key needed. |
| `GET /api/game-facts?app=…` | Script Writer research for a Steam game: store details, popular tags, review score and the most helpful player reviews. |
| `POST /api/script` | Script Writer: builds the prompt and asks the chosen AI (Workers AI binding, or Claude/OpenAI with the key from the `X-AI-Key` header, never stored). |
| `GET /api/youtube?links=…` | Keyless video data for the Thumbnail Viewer: YouTube oEmbed for videos, channel RSS feeds for uploads, channel names and avatars from the channel page's link-preview tags. |
| *(library art fallback)* | Newer games keep their logo (and sometimes cover/hero) in hashed folders that Valve's store APIs don't list. When the usual paths miss, Steam Kit looks up the Steam client's art paths via [SteamCMD.net](https://www.steamcmd.net) (free, unofficial, no key), cached for a day. |
| `GET /api/steam-check` | Diagnostic: shows which Steam servers the deployment can currently reach. |
| `GET /api/file?src=…&download=…` | Passes files through from Steam's CDN (images, trailer playlists and video segments), Pixabay, Freesound and Jamendo, so the page can use them and save them with tidy names. Only those hosts are accepted. |
| `GET /api/clipart?q=…&type=…&transparent=1&offset=…` | Searches Pixabay with the `PIXABAY_API_KEY` secret. Results are cached for 24 hours, as Pixabay asks. |
| `GET /api/spotify?url=…` | Gets a Spotify playlist's, album's or song's name and cover (Spotify's public oEmbed) for the saved and played lists. |
| `GET /api/audio?q=…&kind=sfx\|music&offset=…` | Searches Freesound (CC0 only) or Jamendo (commercial + video-safe licenses only). Cached for 24 hours. |

**Trailers** are converted in your browser. Steam streams trailers in small pieces (HLS) rather than offering one file, so `public/trailer.js` picks the highest-quality H.264 stream, downloads its pieces, and uses [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) to join video and audio into one MP4 — a straight copy, no re-encoding. The first trailer you download also loads the converter (~30 MB, from jsDelivr), after which the browser caches it.

## Project layout

```
functions/api/    the API handlers (game.js, steam-search.js, steam-check.js, proxy.js, youtube.js, file.js, clipart.js, audio.js, spotify.js), shared by every way of running the site
worker.js         Cloudflare Workers entry point; wrangler.jsonc is its config
lib/              shared code: steam.js talks to Steam, http.js has small response helpers
public/           the page: index.html, styles.css, nav.css + site-header.js (shared navbar), nav.js (views), folder.js (Steam folder), app.js + trailer.js (Steam Kit), clipart.js, audio.js + playlists.js, comments.js, png.js
public/tools/     the tool pages (steam-case, steam-review, steam-price, thumbnail-viewer, script-writer) + theme.css that styles them
public/vendor/    ffmpeg.wasm's small JS wrapper (MIT), kept local so its worker loads from the same site
server.js         local dev server that runs the same handlers
```
