import { copyFile, mkdir } from "node:fs/promises";

// MapLibre 6 uses a module worker. Serve the installed, version-matched worker
// from our own origin so Next's chunk rewriting cannot break its URL.
const target = new URL("../public/vendor/", import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url), new URL("maplibre-gl-worker.mjs", target));
