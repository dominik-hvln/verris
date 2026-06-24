import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@verris/ui", "@verris/contracts"],
  typescript: {
    ignoreBuildErrors: true, 
  }
};

export default nextConfig;
