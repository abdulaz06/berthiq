import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The repo has a root package-lock.json (for `concurrently`) as well as this
  // one; pin the tracing root here so Next doesn't guess the workspace root.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
