import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';
import { PRZEKIEROWANIA } from './src/lib/przekierowania';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Panele w monorepo używają Next 16; www trzyma Next 15.4 dla zgodności z Payload 3.
  typescript: { ignoreBuildErrors: true },
  async redirects() {
    return PRZEKIEROWANIA;
  },
};

export default withPayload(nextConfig);
