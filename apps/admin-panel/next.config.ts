import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@verris/ui", "@verris/contracts"],
};

export default nextConfig;
