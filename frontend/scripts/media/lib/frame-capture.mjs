// Frame-exact capture: genuine 60 fps at any resolution, independent of this
// machine's speed. Headless Chromium runs under BeginFrame control on a
// virtual clock, so the page renders only when told to and its time
// (performance.now, timers, requestAnimationFrame, CSS animations) advances
// exactly 1/60 s per frame. Every recorded frame is a fresh render at an
// exact time; fetches finish "between frames" because the clock waits while a
// request is pending. Technique adapted from the recorder the same author
// built for Caravan (github.com/abdulaz06/caravan, scripts/lib/frame-capture.mjs).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const FLAGS = [
  "--enable-begin-frame-control",
  "--run-all-compositor-stages-before-draw",
  "--disable-new-content-rendering-timeout",
  "--disable-threaded-animation",
  "--disable-threaded-scrolling",
  "--disable-checker-imaging",
  "--disable-image-animation-resync",
  "--hide-scrollbars",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

/** A headless page, laid out at width×height CSS px and rendered at `scale`, that paints only on demand. */
export async function launchFramePage({ width, height, scale = 1 }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "berthiq-capture-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width, height },
    deviceScaleFactor: scale,
    args: FLAGS,
  });
  // BeginFrame control is per target and only at creation, so create the page ourselves.
  const blank = ctx.pages()[0];
  const opened = ctx.waitForEvent("page");
  await (await ctx.newCDPSession(blank)).send("Target.createTarget", { url: "about:blank", enableBeginFrameControl: true });
  const page = await opened;
  await blank.close();
  const cdp = await ctx.newCDPSession(page);
  return {
    ctx,
    page,
    cdp,
    async close() {
      await ctx.close();
      fs.rmSync(profile, { recursive: true, force: true });
    },
  };
}

/**
 * Starts the page's clock: one frame per tick until stop(). Frames are saved
 * (JPEG) only while recording; paused, the page keeps running off camera.
 */
export async function startClock(cdp, { dir, fps = 60, quality = 92, log = console.log }) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const dt = 1000 / fps;
  const { virtualTimeTicksBase: base } = await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let expire = null;
  cdp.on("Emulation.virtualTimeBudgetExpired", () => {
    const done = expire;
    expire = null;
    done?.();
  });
  const grant = (policy) => {
    const p = new Promise((r) => (expire = r));
    cdp.send("Emulation.setVirtualTimePolicy", { policy, budget: dt }).catch(() => {});
    return p;
  };
  // Time stands still while a fetch is in flight; one that never ends would
  // stall it, so after a few seconds time moves on anyway.
  let stalls = 0;
  async function tickTime() {
    const ok = await Promise.race([grant("pauseIfNetworkFetchesPending").then(() => true), sleep(4000).then(() => false)]);
    if (!ok) {
      stalls++;
      await Promise.race([grant("advance"), sleep(4000)]);
    }
  }
  const frames = [];
  const marks = {};
  const hooks = new Set();
  let waiters = [];
  let ticks = 0;
  let vt = 0;
  let recording = false;
  let running = true;
  let last = null;
  let n = 0;
  const loop = (async () => {
    while (running) {
      for (const h of [...hooks]) await h();
      await tickTime();
      vt += dt;
      const shoot = recording;
      const r = await cdp.send("HeadlessExperimental.beginFrame", {
        frameTimeTicks: base + vt,
        interval: dt,
        ...(shoot ? { screenshot: { format: "jpeg", quality } } : {}),
      });
      ticks++;
      if (shoot) {
        if (r.screenshotData) {
          last = path.join(dir, `${String(n++).padStart(6, "0")}.jpg`);
          fs.writeFileSync(last, Buffer.from(r.screenshotData, "base64"));
        }
        // No screenshot means nothing changed: the previous frame, again.
        if (last) frames.push(last);
      }
      const due = waiters.filter((w) => ticks >= w.at);
      waiters = waiters.filter((w) => ticks < w.at);
      for (const w of due) w.resolve();
    }
  })();
  const clock = {
    fps,
    dt,
    get now() {
      return vt;
    },
    get length() {
      return frames.length;
    },
    /** Resolves after `count` more frames. */
    frames(count = 1) {
      return new Promise((resolve) => waiters.push({ at: ticks + Math.max(1, Math.round(count)), resolve }));
    },
    /** Resolves after `ms` of page time. */
    wait(ms) {
      return clock.frames(ms / dt);
    },
    /** Calls fn(t) before each of the next `ms` of frames, t easing 0 → 1. */
    tween(ms, fn, ease = easeInOut) {
      const count = Math.max(1, Math.round(ms / dt));
      let k = 0;
      return new Promise((resolve) => {
        const hook = async () => {
          k++;
          await fn(ease(Math.min(1, k / count)));
          if (k >= count) {
            hooks.delete(hook);
            clock.frames(1).then(resolve);
          }
        };
        hooks.add(hook);
      });
    },
    record() {
      recording = true;
    },
    pause() {
      recording = false;
      return clock.frames(1);
    },
    /** Names the next recorded frame (for thumbnails and chapter marks). */
    mark(name) {
      marks[name] = frames.length;
    },
    async stop() {
      running = false;
      await loop;
      if (stalls) log(`network never settled ${stalls}× — time moved on regardless`);
      return { frames, marks, fps };
    },
  };
  return clock;
}

// Sine rather than cubic: its last steps stay a visible fraction of a pixel,
// so a glide doesn't trail off into near-identical frames.
export const easeInOut = (t) => (1 - Math.cos(Math.PI * t)) / 2;
export const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * Frames in order → a constant-frame-rate H.264 MP4 (High profile, yuv420p,
 * BT.709, faststart). Frames are hard-linked into a numbered sequence first,
 * so a held frame costs nothing. `size` ("1920:1080") downscales.
 */
export function encodeFrames({ ffmpeg, frames, out, fps = 60, crf = 17, size, work }) {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  for (const [i, f] of frames.entries()) {
    const to = path.join(work, `${String(i).padStart(6, "0")}.jpg`);
    try {
      fs.linkSync(f, to);
    } catch {
      fs.copyFileSync(f, to);
    }
  }
  // JPEG frames are full-range BT.601; web video is limited-range BT.709.
  const scale = `scale=${size ? `${size}:flags=lanczos:` : ""}in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709`;
  execFileSync(ffmpeg, [
    "-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(work, "%06d.jpg"),
    "-vf", `${scale},format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709`,
    "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-r", String(fps), "-fps_mode", "cfr", "-movflags", "+faststart", "-an", out,
  ]);
  fs.rmSync(work, { recursive: true, force: true });
}
