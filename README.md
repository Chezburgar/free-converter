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

## Note on downloading

Only download content you own or have the right to use. Respect each platform's
Terms of Service and copyright law.
