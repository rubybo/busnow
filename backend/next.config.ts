import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: backendRoot,
  serverExternalPackages: ["web-push"],
};

export default nextConfig;
