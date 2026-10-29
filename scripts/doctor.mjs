import { doctor } from "./runtime.mjs";
try {
  doctor();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
