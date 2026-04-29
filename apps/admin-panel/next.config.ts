import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ekohost/ui", "@ekohost/contracts"],
};

export default nextConfig;
