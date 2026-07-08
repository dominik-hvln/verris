import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Panele w monorepo używają Next 16; www trzyma Next 15.4 dla zgodności z Payload 3.
  typescript: { ignoreBuildErrors: true },
};

export default withPayload(nextConfig);
