# Free Converter

A local, free file converter + YouTube/SoundCloud downloader. Runs entirely on your
machine — no uploads to third parties, no limits, no ads.

## Features

- **File conversion** (powered by ffmpeg):
  - Images: png, jpg, webp, gif, bmp, tiff, ico, avif
  - Audio: mp3, wav, flac, ogg, aac, m4a, opus, wma, aiff
  - Video: mp4, webm, mkv, mov, avi, flv, wmv, gif, m4v
  - Video → audio extraction, quality/bitrate options
  - Documents (pdf, docx, xlsx, pptx, etc.) — **requires LibreOffice** (optional)
- **YouTube → MP3 / MP4** (up to 4K) via yt-dlp
- **SoundCloud → MP3** via yt-dlp

## Running it

```powershell
npm install      # first time only
npm start
```

Then open **http://localhost:3000** in your browser.

## Requirements

Already installed on this machine via winget:
- [ffmpeg](https://ffmpeg.org/) — the conversion engine
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — the downloader

The server auto-detects these on PATH or in the winget package folders.

### Optional: document conversion
Install LibreOffice to enable PDF/DOCX/XLSX/PPTX conversion:
```powershell
winget install TheDocumentFoundation.LibreOffice
```
Restart the server afterward.

## Making YouTube work on Render (or any server host)

YouTube aggressively blocks **datacenter IPs** with a "Sign in to confirm you're not
a bot" error. This does **not** happen on a home connection, only on cloud hosts.
Two ways to fix it on Render — pick one:

### Option A — Cookies (free, most reliable)
1. In Chrome/Edge, install the **"Get cookies.txt LOCALLY"** extension.
2. Open youtube.com **signed in**, click the extension, **Export** as `cookies.txt`.
3. In the Render dashboard: **your service → Environment → Secret Files → Add**,
   filename **`cookies.txt`**, paste the file contents.
4. Redeploy. The app auto-detects `/etc/secrets/cookies.txt`.

### Option B — Residential proxy (paid, set-and-forget)
Sign up for a residential proxy provider (BrightData, Smartproxy, IPRoyal, …) and add
an env var in Render:
```
YT_PROXY = http://USER:PASS@HOST:PORT
```
(`socks5://…` also works.) All yt-dlp traffic then exits through that IP.
Free public proxy lists generally do **not** work against YouTube and are unsafe.

> Locally (home IP) you need neither — it already works, because the app tries
> multiple YouTube player clients to dodge the bot check.

### Env vars reference
| Var | Purpose |
|-----|---------|
| `YT_PROXY` | Route yt-dlp through a proxy, e.g. `http://user:pass@host:port` |
| `YT_COOKIES_FILE` | Explicit path to a cookies.txt |
| `YT_COOKIES_BROWSER` | Read cookies from a browser (local only), e.g. `firefox` |
| `YT_CLIENTS` | Override the player-client fallback list |

## Note on downloading

Only download content you own or have the right to use. Respect each platform's
Terms of Service and copyright law.
