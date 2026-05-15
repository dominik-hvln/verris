import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@verris/ui", "@verris/contracts"],
};

export default nextConfig;
