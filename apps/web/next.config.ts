import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@agent-debugger/engine"],
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
