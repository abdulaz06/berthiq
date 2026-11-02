import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { assessAudit } from "./audit-policy.mjs";

if (!process.env.npm_execpath) throw new Error("Run npm run audit:security");
const result = spawnSync(process.execPath, [process.env.npm_execpath, "audit", "--json"], {
  encoding: "utf8", windowsHide: true, timeout: 180000, maxBuffer: 10 * 1024 * 1024,
});
if (result.error || ![0, 1].includes(result.status))
  throw new Error(`npm audit could not complete: ${result.error?.message ?? result.status}`);
const { exceptions, failures } = assessAudit(
  JSON.parse(result.stdout), JSON.parse(readFileSync("package-lock.json", "utf8")),
);
for (const exception of exceptions) console.warn(`REVIEWED EXCEPTION: ${exception}`);
for (const failure of failures) console.error(`UNREVIEWED: ${failure}`);
console.log(`Security audit: ${failures.length} unreviewed advisories; ${exceptions.length} documented exception(s).`);
process.exitCode = failures.length ? 1 : 0;
