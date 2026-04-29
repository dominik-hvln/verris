import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ekohost/ui"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true, 
  }
};

export default nextConfig;
