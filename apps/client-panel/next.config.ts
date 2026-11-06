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
  // Przewodnik testera (PDF) leży poza public/ i oddaje go tylko trasa z kontrolą sesji. Plik czytany z dysku
  // w czasie działania musi trafić do .next/standalone (Dockerfile.panel kopiuje tylko standalone, static i public):
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats — klucz = ścieżka trasy,
  // wartość = glob od katalogu projektu (apps/client-panel). Pilnuje beta/przewodnik/route.spec.ts.
  outputFileTracingIncludes: {
    "/dashboard/beta/przewodnik": ["./assets/beta/Verris-przewodnik-testera.pdf"],
  },
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
