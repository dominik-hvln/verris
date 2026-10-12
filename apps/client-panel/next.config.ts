import type { NextConfig } from "next";

/**
 * Wersja panelu w zgłoszeniach „Zgłoś uwagę” (beta): z NEXT_PUBLIC_WERSJA_PANELU, gdy podana przy buildzie,
 * inaczej chwila builda. Next nie wystawia buildId w App Routerze, a baner nowej wersji (libs/ui) nie ma
 * własnego identyfikatora — wykrywa tylko błąd nieaktualnej akcji serwera.
 */
const wersjaPanelu =
  process.env.NEXT_PUBLIC_WERSJA_PANELU || `build ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;

const nextConfig: NextConfig = {
  output: "standalone",
  env: { NEXT_PUBLIC_WERSJA_PANELU: wersjaPanelu },
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
