import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Mniejszy runtime i stabilniejsza pamięć niż pełny node_modules + next start. */
  output: "standalone",
  transpilePackages: ["@verris/ui"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true, 
  }
};

export default nextConfig;
