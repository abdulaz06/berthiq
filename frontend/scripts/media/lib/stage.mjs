// The stage for a filmed walkthrough: a heads-up layer injected into the real
// app page (outside <body>, so it survives the camera transform), with a
// camera (CSS scale on <body>, re-rasterised so text stays sharp), a drawn
// cursor, lower-third captions and title cards in BerthIQ's own type.
// Every movement is tweened frame by frame on the virtual clock.
import { easeInOut, easeOut } from "./frame-capture.mjs";

const FLAG = `<svg viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true"><path d="M8 3.5v25" stroke="#edf2f4" stroke-width="2.4" stroke-linecap="round"/><path d="M9.5 5h17.5v13H9.5z" fill="#f2c230"/><path d="M5 28.5h6" stroke="#edf2f4" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const CURSOR = `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 2.5v17.2l4.3-4.1 2.9 6.6 2.9-1.3-2.9-6.5h6z" fill="#fff" stroke="#0a1219" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

/** Installs the HUD on every document the page loads. */
export async function installStage(page) {
  await page.addInitScript(
    ({ FLAG, CURSOR }) => {
      const css = `
#stage-hud{position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:var(--font-sans),system-ui,sans-serif;color:#edf2f4}
#stage-hud .fade{opacity:0;transition:opacity .35s ease,transform .5s cubic-bezier(.2,.8,.2,1)}
#stage-hud .fade.on{opacity:1;transform:none}
#stage-cap{position:absolute;left:56px;bottom:52px;max-width:1040px;padding:18px 28px 20px;border-radius:16px;background:#0a1219f2;border:1px solid #f2c23055;box-shadow:0 30px 70px -20px #000;transform:translateY(14px)}
#stage-cap .k{display:flex;align-items:center;gap:10px;font:600 15px/1 var(--font-mono),monospace;letter-spacing:.14em;color:#f8e2a0;margin-bottom:10px}
#stage-cap .k i{width:16px;height:12px;background:#f2c230;border-radius:1px}
#stage-cap .t{font:800 50px/1.02 var(--font-display),sans-serif;text-transform:uppercase;letter-spacing:.005em}
#stage-cap .t em{font-style:normal;color:#f2c230}
#stage-cur{position:absolute;left:0;top:0;opacity:0;filter:drop-shadow(0 3px 4px #0008)}
#stage-cur svg{display:block;transition:transform .09s ease;transform-origin:5px 3px}
#stage-cur.down svg{transform:scale(.84)}
#stage-ring{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #f2c230;opacity:0}
#stage-ring.go{animation:stage-ring .5s cubic-bezier(.2,.8,.2,1)}
@keyframes stage-ring{from{opacity:1;transform:scale(.3)}to{opacity:0;transform:scale(1.5)}}
#stage-card{position:absolute;inset:0;display:grid;place-items:center;text-align:center;background:radial-gradient(900px 500px at 50% 110%,#f2c2301c,transparent 70%),#0a1219;transition:opacity .45s ease}
#stage-card .in{transform:translateY(16px);opacity:0;transition:opacity .6s ease,transform .8s cubic-bezier(.2,.8,.2,1)}
#stage-card.on .in{transform:none;opacity:1}
#stage-card .brand{display:inline-flex;align-items:center;gap:16px;font:800 150px/1 var(--font-display),sans-serif;letter-spacing:.01em}
#stage-card .brand b{color:#f2c230;font-weight:800}
#stage-card h1{margin:34px 0 0;font:800 104px/0.95 var(--font-display),sans-serif;text-transform:uppercase}
#stage-card h1 em{font-style:normal;color:#f2c230}
#stage-card p{margin-top:34px;font:500 26px/1.5 var(--font-mono),monospace;color:#c3d0d7}
#stage-card .cta{display:inline-block;margin-top:34px;padding:20px 38px;border-radius:999px;background:#f2c230;color:#1b1503;font:700 30px/1 var(--font-sans),sans-serif}
#stage-black{position:absolute;inset:0;background:#05090d;opacity:0;transition:opacity .4s ease}
#stage-black.on{opacity:1}
body{transform-origin:0 0;will-change:transform}`;
      const mount = () => {
        if (document.getElementById("stage-hud")) return;
        const style = document.createElement("style");
        style.textContent = css;
        document.documentElement.appendChild(style);
        const hud = document.createElement("div");
        hud.id = "stage-hud";
        hud.innerHTML = `<div id="stage-cap" class="fade"><div class="k"><i></i><span></span></div><div class="t"></div></div>
<div id="stage-card" class="fade"><div class="in"></div></div><div id="stage-ring"></div><div id="stage-cur">${CURSOR}</div><div id="stage-black"></div>`;
        document.documentElement.appendChild(hud);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
      else mount();
      const $ = (id) => document.getElementById(id);
      window.__stage = {
        FLAG,
        camera(z, cx, cy) {
          const ox = cx + scrollX;
          const oy = cy + scrollY;
          document.body.style.transformOrigin = `${ox}px ${oy}px`;
          document.body.style.transform = z === 1 ? "" : `scale(${z})`;
        },
        caption(kicker, html) {
          if (kicker === null) return $("stage-cap").classList.remove("on");
          $("stage-cap").querySelector(".k span").textContent = kicker;
          $("stage-cap").querySelector(".t").innerHTML = html;
          $("stage-cap").classList.add("on");
        },
        card(html) {
          if (html === null) return $("stage-card").classList.remove("on");
          $("stage-card").querySelector(".in").innerHTML = html;
          $("stage-card").classList.add("on");
        },
        cardInstant(html) {
          const card = $("stage-card");
          for (const el of [card, card.querySelector(".in")]) el.style.transition = "none";
          this.card(html);
          void card.offsetWidth;
          for (const el of [card, card.querySelector(".in")]) el.style.transition = "";
        },
        black(on) {
          $("stage-black").classList.toggle("on", on);
        },
        blackInstant(on) {
          $("stage-black").style.transition = "none";
          this.black(on);
          void $("stage-black").offsetWidth;
          $("stage-black").style.transition = "";
        },
        cursor(x, y, o) {
          $("stage-cur").style.transform = `translate(${x - 5}px,${y - 2.5}px)`;
          $("stage-cur").style.opacity = o;
        },
        press(x, y, down) {
          $("stage-cur").classList.toggle("down", down);
          if (!down) return;
          const r = $("stage-ring");
          r.style.left = `${x}px`;
          r.style.top = `${y}px`;
          r.classList.remove("go");
          void r.offsetWidth;
          r.classList.add("go");
        },
      };
    },
    { FLAG, CURSOR },
  );
}

export const brandCard = (title, sub = "", cta = "") =>
  `<div class="brand">${FLAG}<span>Berth<b>IQ</b></span></div>${title ? `<h1>${title}</h1>` : ""}${sub ? `<p>${sub}</p>` : ""}${cta ? `<div class="cta">${cta}</div>` : ""}`;

/** Drives the stage on a clock: camera moves, cursor glides, captions and cards. */
export function director(clock, page, { width, height }) {
  const stage = (fn, ...args) => page.evaluate(({ fn, args }) => window.__stage?.[fn](...args), { fn, args });
  const cam = { z: 1, x: width / 2, y: height / 2 };
  const cur = { x: width * 0.62, y: height * 0.72, o: 0 };
  const apply = () => stage("camera", cam.z, cam.x, cam.y);
  return {
    stage,
    /** Zooms to z around viewport point (x, y) over ms. */
    async zoom(z, x, y, ms = 1100) {
      const from = { ...cam };
      await clock.tween(ms, async (t) => {
        cam.z = from.z + (z - from.z) * t;
        cam.x = from.x + (x - from.x) * t;
        cam.y = from.y + (y - from.y) * t;
        await apply();
      });
    },
    /** Zooms so a locator's box fills `fill` of the frame. */
    async frame(locator, { fill = 0.8, ms = 1100, max = 1.8 } = {}) {
      // The box as laid out, undoing the current camera.
      const seen = await locator.boundingBox();
      const box = {
        x: cam.x + (seen.x - cam.x) / cam.z,
        y: cam.y + (seen.y - cam.y) / cam.z,
        width: seen.width / cam.z,
        height: seen.height / cam.z,
      };
      const z = Math.min(max, Math.max(1, Math.min((width * fill) / box.width, (height * fill) / box.height)));
      // Pick the origin so the box's centre lands at the frame's centre after scaling.
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const ox = z === 1 ? cx : (z * cx - width / 2) / (z - 1);
      const oy = z === 1 ? cy : (z * cy - height / 2) / (z - 1);
      await this.zoom(z, Math.min(Math.max(ox, 0), width), Math.min(Math.max(oy, 0), height), ms);
    },
    async reset(ms = 900) {
      await this.zoom(1, cam.x, cam.y, ms);
    },
    async scrollTo(y, ms = 1000) {
      const from = await page.evaluate(() => scrollY);
      await clock.tween(ms, (t) => page.evaluate((v) => scrollTo(0, v), from + (y - from) * t));
    },
    async caption(kicker, html) {
      await stage("caption", kicker, html);
    },
    async uncaption() {
      await stage("caption", null);
    },
    async moveTo(x, y, ms = 750) {
      const from = { ...cur };
      await clock.tween(
        ms,
        async (t) => {
          cur.x = from.x + (x - from.x) * t;
          cur.y = from.y + (y - from.y) * t;
          cur.o = Math.max(cur.o, Math.min(1, t * 3));
          await stage("cursor", cur.x, cur.y, cur.o);
        },
        easeOut,
      );
    },
    /** Glides the cursor to a control, presses it, and clicks it. */
    async click(locator) {
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await this.moveTo(x, y);
      await clock.wait(120);
      await stage("press", x, y, true);
      await locator.evaluate((el) => el.click());
      await clock.wait(140);
      await stage("press", x, y, false);
    },
    async hideCursor(ms = 300) {
      const o = cur.o;
      await clock.tween(ms, async (t) => {
        cur.o = o * (1 - t);
        await stage("cursor", cur.x, cur.y, cur.o);
      }, easeInOut);
    },
  };
}
