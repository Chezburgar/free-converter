// Free Converter — local server
// Converts files between common formats (image/audio/video/docs) and
// downloads YouTube/SoundCloud audio/video, powered by ffmpeg + yt-dlp.

const express = require("express");
const multer = require("multer");
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Binary resolution: find ffmpeg / ffprobe / yt-dlp on PATH or in winget dirs.
// ---------------------------------------------------------------------------
function firstExisting(paths) {
  for (const p of paths) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

function onPath(bin) {
  // Returns the bare command if it resolves on PATH, else null.
  try {
    const which = process.platform === "win32" ? "where" : "which";
    const out = execFileSync(which, [bin], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .split(/\r?\n/)[0]
      .trim();
    return out || null;
  } catch (_) {
    return null;
  }
}

function findInWinget(filename) {
  const base = path.join(
    process.env.LOCALAPPDATA || "",
    "Microsoft",
    "WinGet",
    "Packages"
  );
  if (!fs.existsSync(base)) return null;
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.name.toLowerCase() === filename.toLowerCase()) return full;
    }
  }
  return null;
}

function resolveBin(cmd, filename) {
  return (
    onPath(cmd) ||
    findInWinget(filename) ||
    null
  );
}

const FFMPEG = resolveBin("ffmpeg", "ffmpeg.exe") || "ffmpeg";
const FFPROBE = resolveBin("ffprobe", "ffprobe.exe") || "ffprobe";
const YTDLP = resolveBin("yt-dlp", "yt-dlp.exe") || "yt-dlp";
const DENO = resolveBin("deno", "deno.exe"); // JS runtime YouTube now needs
const FFMPEG_DIR = path.dirname(FFMPEG);

// Cookies let yt-dlp pass YouTube's "confirm you're not a bot" check.
// Priority: explicit env file > cookies.txt beside this app > a browser name.
const COOKIES_FILE =
  process.env.YT_COOKIES_FILE ||
  (fs.existsSync(path.join(__dirname, "cookies.txt"))
    ? path.join(__dirname, "cookies.txt")
    : null);
const COOKIES_BROWSER = process.env.YT_COOKIES_BROWSER || null; // e.g. "firefox"

// Shared yt-dlp args for every call (JS runtime + auth cookies).
function ytCommonArgs() {
  const a = [];
  if (DENO) a.push("--js-runtimes", `deno:${DENO}`);
  if (COOKIES_FILE) a.push("--cookies", COOKIES_FILE);
  else if (COOKIES_BROWSER) a.push("--cookies-from-browser", COOKIES_BROWSER);
  return a;
}

// LibreOffice (optional) for document conversion.
function resolveSoffice() {
  const candidates = [
    onPath("soffice"),
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    "/usr/bin/soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  ];
  return firstExisting(candidates);
}
const SOFFICE = resolveSoffice();

console.log("Binaries:");
console.log("  ffmpeg :", FFMPEG);
console.log("  ffprobe:", FFPROBE);
console.log("  yt-dlp :", YTDLP);
console.log("  deno   :", DENO || "(not found — YouTube may be degraded)");
console.log(
  "  cookies:",
  COOKIES_FILE
    ? `file: ${COOKIES_FILE}`
    : COOKIES_BROWSER
    ? `browser: ${COOKIES_BROWSER}`
    : "(none — some YouTube videos will hit the bot check)"
);
console.log("  soffice:", SOFFICE || "(not found — document conversion disabled)");

// ---------------------------------------------------------------------------
// Format catalog
// ---------------------------------------------------------------------------
const IMAGE = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "ico", "avif", "heic"];
const AUDIO = ["mp3", "wav", "flac", "ogg", "aac", "m4a", "opus", "wma", "aiff"];
const VIDEO = ["mp4", "webm", "mkv", "mov", "avi", "flv", "wmv", "gif", "m4v"];
const DOC = ["pdf", "docx", "doc", "odt", "rtf", "txt", "html", "epub", "pptx", "ppt", "xlsx", "csv", "ods"];

function categoryOf(ext) {
  ext = ext.toLowerCase().replace(/^\./, "");
  if (IMAGE.includes(ext)) return "image";
  if (AUDIO.includes(ext)) return "audio";
  if (VIDEO.includes(ext)) return "video";
  if (DOC.includes(ext)) return "document";
  return null;
}

// Which target formats we offer given a source extension.
function targetsFor(ext) {
  const cat = categoryOf(ext);
  switch (cat) {
    case "image":
      return IMAGE.filter((f) => f !== "heic"); // can read heic, ffmpeg can't always write it
    case "audio":
      return AUDIO;
    case "video":
      // video can go to any video OR extract to audio
      return [...VIDEO, ...AUDIO];
    case "document":
      return DOC;
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Work dir
// ---------------------------------------------------------------------------
const WORK = path.join(os.tmpdir(), "free-converter");
fs.mkdirSync(WORK, { recursive: true });
const upload = multer({ dest: WORK, limits: { fileSize: 2 * 1024 * 1024 * 1024 } }); // 2GB

function cleanup(...files) {
  for (const f of files) {
    if (!f) continue;
    fs.rm(f, { force: true }, () => {});
  }
}

// safe filename base
function safeBase(name) {
  return path.parse(name).name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
}

// ---------------------------------------------------------------------------
// Static + API
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/formats", (req, res) => {
  res.json({
    image: IMAGE,
    audio: AUDIO,
    video: VIDEO,
    document: DOC,
    documentsEnabled: !!SOFFICE,
  });
});

// Return valid target formats for an uploaded extension (used by UI).
app.get("/api/targets", (req, res) => {
  const ext = (req.query.ext || "").toString();
  res.json({ category: categoryOf(ext), targets: targetsFor(ext) });
});

// ---------- File conversion ----------
function runFFmpeg(inputPath, outputPath, opts, done) {
  const args = ["-y", "-i", inputPath];

  const target = path.extname(outputPath).slice(1).toLowerCase();
  const srcCat = categoryOf(opts.srcExt);
  const dstCat = categoryOf(target);

  // Quality knobs
  if (dstCat === "audio") {
    if (opts.audioBitrate) args.push("-b:a", opts.audioBitrate);
    else if (target === "mp3") args.push("-q:a", "2");
    args.push("-vn"); // no video for pure audio outputs
  }
  if (dstCat === "video") {
    if (target === "gif") {
      // decent-quality gif via palette, capped width
      args.push("-vf", "fps=15,scale=480:-1:flags=lanczos");
    } else {
      if (opts.videoBitrate) args.push("-b:v", opts.videoBitrate);
      // sensible defaults for broad compatibility
      if (target === "mp4" || target === "mov" || target === "m4v") {
        args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac");
      }
    }
  }

  args.push(outputPath);

  const ff = spawn(FFMPEG, args);
  let err = "";
  ff.stderr.on("data", (d) => (err += d.toString()));
  ff.on("error", (e) => done(e));
  ff.on("close", (code) => {
    if (code === 0 && fs.existsSync(outputPath)) done(null);
    else done(new Error(err.split(/\r?\n/).slice(-8).join("\n") || "ffmpeg failed"));
  });
}

function runSoffice(inputPath, targetExt, outDir, done) {
  if (!SOFFICE) return done(new Error("LibreOffice not installed"));
  const args = ["--headless", "--convert-to", targetExt, "--outdir", outDir, inputPath];
  const p = spawn(SOFFICE, args);
  let err = "";
  p.stderr.on("data", (d) => (err += d.toString()));
  p.on("error", (e) => done(e));
  p.on("close", () => {
    // soffice names output after input base + new ext
    const base = path.parse(inputPath).name;
    const out = path.join(outDir, base + "." + targetExt);
    if (fs.existsSync(out)) done(null, out);
    else done(new Error(err || "conversion failed"));
  });
}

app.post("/api/convert", upload.single("file"), (req, res) => {
  const file = req.file;
  const target = (req.body.target || "").toLowerCase();
  if (!file) return res.status(400).json({ error: "No file uploaded" });
  if (!target) return res.status(400).json({ error: "No target format" });

  const srcExt = path.extname(file.originalname).slice(1).toLowerCase();
  const cat = categoryOf(srcExt);
  const dstCat = categoryOf(target);
  if (!cat) return res.status(400).json({ error: `Unsupported source type: .${srcExt}` });
  if (!targetsFor(srcExt).includes(target))
    return res.status(400).json({ error: `Cannot convert .${srcExt} to .${target}` });

  const base = safeBase(file.originalname);
  const outName = `${base}.${target}`;

  const finish = (outPath) => {
    res.download(outPath, outName, (e) => cleanup(file.path, outPath));
  };
  const fail = (err) => {
    cleanup(file.path);
    res.status(500).json({ error: String(err.message || err) });
  };

  if (cat === "document" || dstCat === "document") {
    runSoffice(file.path, target, WORK, (err, out) => {
      if (err) return fail(err);
      finish(out);
    });
  } else {
    const outPath = path.join(WORK, `out-${Date.now()}-${outName}`);
    runFFmpeg(
      file.path,
      outPath,
      {
        srcExt,
        audioBitrate: req.body.audioBitrate,
        videoBitrate: req.body.videoBitrate,
      },
      (err) => {
        if (err) return fail(err);
        finish(outPath);
      }
    );
  }
});

// ---------- YouTube / SoundCloud download ----------
app.post("/api/download", (req, res) => {
  const url = (req.body.url || "").trim();
  const format = (req.body.format || "mp3").toLowerCase(); // mp3 | mp4
  const quality = (req.body.quality || "").toString();

  if (!/^https?:\/\//i.test(url))
    return res.status(400).json({ error: "Please enter a valid http(s) URL" });

  const id = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const outTemplate = path.join(WORK, `dl-${id}.%(ext)s`);

  let args = [
    ...ytCommonArgs(),
    "--no-playlist",
    "--ffmpeg-location", FFMPEG_DIR,
    "-o", outTemplate,
    "--restrict-filenames",
  ];

  if (format === "mp4") {
    const height = quality || "1080";
    args.push(
      "-f",
      `bv*[height<=${height}]+ba/b[height<=${height}]/b`,
      "--merge-output-format",
      "mp4",
      "--recode-video",
      "mp4"
    );
  } else {
    // audio -> mp3
    args.push("-x", "--audio-format", "mp3", "--audio-quality", quality || "0");
  }
  args.push(url);

  const p = spawn(YTDLP, args);
  let err = "";
  p.stderr.on("data", (d) => (err += d.toString()));
  p.stdout.on("data", () => {});
  p.on("error", (e) => res.status(500).json({ error: String(e.message || e) }));
  p.on("close", (code) => {
    // find produced file
    let produced = null;
    try {
      produced = fs
        .readdirSync(WORK)
        .filter((f) => f.startsWith(`dl-${id}.`))
        .map((f) => path.join(WORK, f))
        .find((f) => fs.statSync(f).size > 0);
    } catch (_) {}
    if (code !== 0 || !produced) {
      return res
        .status(500)
        .json({ error: err.split(/\r?\n/).slice(-6).join("\n") || "Download failed" });
    }
    const ext = path.extname(produced);
    res.download(produced, `download${ext}`, () => cleanup(produced));
  });
});

// Metadata preview for a URL (title/thumbnail) — best effort.
app.post("/api/info", (req, res) => {
  const url = (req.body.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "Invalid URL" });
  const p = spawn(YTDLP, [...ytCommonArgs(), "--no-playlist", "-J", url]);
  let out = "";
  let err = "";
  p.stdout.on("data", (d) => (out += d.toString()));
  p.stderr.on("data", (d) => (err += d.toString()));
  p.on("error", (e) => res.status(500).json({ error: String(e.message || e) }));
  p.on("close", (code) => {
    if (code !== 0) return res.status(500).json({ error: "Could not fetch info" });
    try {
      const j = JSON.parse(out);
      res.json({
        title: j.title,
        uploader: j.uploader || j.channel,
        duration: j.duration,
        thumbnail: j.thumbnail,
      });
    } catch (_) {
      res.status(500).json({ error: "Parse error" });
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n  Free Converter running →  http://localhost:${PORT}\n`);
});
