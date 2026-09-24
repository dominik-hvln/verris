import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Mniejszy runtime i stabilniejsza pamięć niż pełny node_modules + next start. */
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@verris/ui"],
  experimental: {
    // Załączniki idą przez Server Actions, których domyślny limit to 1 MB. API przyjmuje 5 plików po 8 MB
    // w odpowiedzi na zgłoszenie — bez tego większy plik kończył się błędem 413 w Next.
    serverActions: { bodySizeLimit: "41mb" },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
