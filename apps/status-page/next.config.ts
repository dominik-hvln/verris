import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
