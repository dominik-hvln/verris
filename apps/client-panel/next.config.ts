import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ekohost/ui", "@ekohost/contracts"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true, 
  }
};

export default nextConfig;
