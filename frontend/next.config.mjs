import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  agentRules: false,
  // The repo has a root package-lock.json (for the local launcher) as well as this
  // one; pin the tracing root here so Next doesn't guess the workspace root.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
