import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Mniejszy runtime i stabilniejsza pamięć niż pełny node_modules + next start. */
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@verris/ui"],
  typescript: {
    ignoreBuildErrors: true, 
  }
};

export default nextConfig;
