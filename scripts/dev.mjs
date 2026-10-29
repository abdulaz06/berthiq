import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { doctor, next, python, root, run } from "./runtime.mjs";

const children = [];
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.all(
    children
      .filter((c) => c.exitCode === null)
      .map(
        (c) =>
          new Promise((resolve) => {
            if (process.platform === "win32") {
              // Only our own child trees: uvicorn's reloader and Next may spawn children.
              const killer = spawn(
                "taskkill.exe",
                ["/pid", String(c.pid), "/t", "/f"],
                { stdio: "ignore", windowsHide: true },
              );
              killer.once("exit", resolve);
              killer.once("error", resolve);
            } else {
              try {
                process.kill(-c.pid, "SIGTERM");
              } catch {}
              resolve();
            }
          }),
      ),
  );
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => void stop());
function launch(command, args, cwd, env = process.env) {
  // No cmd/sh command string: paths containing spaces remain a single argument.
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  children.push(child);
  child.once("error", (e) => {
    console.error(e.message);
    void stop(1);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        `Server stopped (${command}): exit ${code}, signal ${signal}.`,
      );
      void stop(code ?? 1);
    }
  });
}
async function portAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is occupied. Stop the existing server or set BERTHIQ_API_PORT / BERTHIQ_WEB_PORT; no process was killed.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
try {
  doctor();
  const apiPort = Number(process.env.BERTHIQ_API_PORT ?? 8000),
    webPort = Number(process.env.BERTHIQ_WEB_PORT ?? 3000);
  await Promise.all([portAvailable(apiPort), portAvailable(webPort)]);
  run(process.execPath, [
    resolve(root, "frontend/scripts/prepare-map-worker.mjs"),
  ]);
  console.log(
    `BerthIQ: frontend http://localhost:${webPort} · API http://localhost:${apiPort}. Ctrl+C stops both.`,
  );
  launch(
    python,
    [
      "-m",
      "uvicorn",
      "app.main:app",
      "--app-dir",
      "backend",
      "--reload",
      "--reload-dir",
      "backend/app",
      "--port",
      String(apiPort),
    ],
    root,
    {
      ...process.env,
      CORS_ORIGINS: JSON.stringify([
        `http://localhost:${webPort}`,
        `http://127.0.0.1:${webPort}`,
      ]),
    },
  );
  launch(
    process.execPath,
    [next, "dev", "--webpack", "--port", String(webPort)],
    resolve(root, "frontend"),
    { ...process.env, NEXT_PUBLIC_API_BASE_URL: `http://localhost:${apiPort}` },
  );
} catch (e) {
  console.error(e.message);
  await stop(1);
}
