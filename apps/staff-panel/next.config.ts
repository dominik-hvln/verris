import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@verris/ui"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true, 
  }
};

export default nextConfig;
