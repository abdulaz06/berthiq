// Builds the looping tour preview shown in the offline panel and on the landing page:
//   public/media/tour-preview.webp        animated, 1280 px, 10 fps, ≤ 2.5 MB
//   public/media/tour-preview-still.webp  its first frame, for prefers-reduced-motion
// The source is the same 11-second segment as media/berthiq-showcase.gif, cut at a
// higher resolution from the local (gitignored) film that record-showcase.mjs writes:
//   FFMPEG=/path/to/ffmpeg node scripts/media/make-tour-preview.mjs
// Env: START (seconds into the film, default 2.533), QUALITY (WebP, default 66).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const start = process.env.START ?? "2.533";
const quality = Number(process.env.QUALITY ?? 66);
const LIMIT = 2_500_000;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "../../..");
const film = path.join(root, "media", "berthiq-showcase.mp4");
const outDir = path.join(root, "frontend", "public", "media");
const work = path.join(root, "frontend", ".media-work", "preview");

if (!fs.existsSync(film)) throw new Error(`${film} not found: record it first with record-showcase.mjs`);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
try {
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", start, "-t", "11", "-i", film, "-vf", "fps=10,scale=1280:-2:flags=lanczos", path.join(work, "f%04d.png")]);
  const frames = fs.readdirSync(work).sort().map((f) => path.join(work, f));
  const animated = path.join(outDir, "tour-preview.webp");
  await sharp(frames, { join: { animated: true } })
    .webp({ quality, effort: 6, smartSubsample: true, minSize: true, loop: 0, delay: Array(frames.length).fill(100) })
    .toFile(animated);
  await sharp(frames[0]).webp({ quality: 80 }).toFile(path.join(outDir, "tour-preview-still.webp"));
  const size = fs.statSync(animated).size;
  console.log(`${frames.length} frames → ${(size / 1e6).toFixed(2)} MB`);
  if (size > LIMIT) throw new Error("tour-preview.webp is over 2.5 MB: lower QUALITY");
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
