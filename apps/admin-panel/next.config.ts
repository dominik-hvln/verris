import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@verris/ui", "@verris/contracts"],
};

export default nextConfig;
