import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@verris/ui", "@verris/contracts"],
  experimental: {
    // Pliki idą przez Server Actions, których domyślny limit to 1 MB. API przyjmuje 25 MB w menedżerze
    // plików i 5 załączników po 8 MB w zgłoszeniu — bez tego większy plik kończył się błędem 413 w Next.
    serverActions: { bodySizeLimit: "41mb" },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
