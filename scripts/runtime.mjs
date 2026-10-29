import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const python = resolve(
  root,
  "backend/.venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
export const next = resolve(root, "frontend/node_modules/next/dist/bin/next");
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Command failed: ${command} ${args[0] ?? ""}. ${result.error?.message ?? `Exit ${result.status}`}`,
    );
}
export function requireNode() {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw new Error(
      "BerthIQ requires Node.js 24 LTS or newer. See DOCS/SETUP.md.",
    );
}
export function doctor() {
  requireNode();
  run(python, [resolve(root, "backend/scripts/doctor.py")]);
}
