import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { python, root, run, requireNode } from "./runtime.mjs";
try {
  requireNode();
  if (existsSync(resolve(root, "backend/.venv"))) {
    console.log("Keeping the existing virtual environment and local .env.");
    run(python, [resolve(root, "backend/scripts/doctor.py"), "--runtime-only"]);
  } else {
    const base =
      process.env.BERTHIQ_SETUP_PYTHON ??
      (process.platform === "win32" ? "python" : "python3");
    run(base, [
      "-c",
      "import sys; assert (3,12) <= sys.version_info[:2] < (3,13), 'Install Python 3.12 first.'",
    ]);
    run(base, ["-m", "venv", resolve(root, "backend/.venv")]);
  }
  run(python, ["-m", "pip", "install", "-r", "backend/requirements.lock"]);
  run(python, ["-m", "pip", "install", "--no-deps", "-e", "./backend[dev]"]);
  // npm CLI is JavaScript; invoking it with Node avoids Windows .cmd quoting.
  const npm = process.env.npm_execpath;
  if (npm) run(process.execPath, [npm, "ci", "--prefix", "frontend"]);
  else {
    // npm.cmd has no user-controlled path arguments and is needed only in setup.
    run(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["ci", "--prefix", "frontend"],
      { shell: process.platform === "win32" },
    );
  }
  run(python, [resolve(root, "backend/scripts/doctor.py")]);
  console.log(
    "Setup complete. Configure your private .env, then just migrate, just seed, just dev. Existing configuration was not changed.",
  );
} catch (e) {
  console.error(
    `${e.message}\nExisting files were preserved. See DOCS/SETUP.md for environment repair.`,
  );
  process.exitCode = 1;
}
