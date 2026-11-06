import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { Analytics } from './components/Analytics';
import { CookieConsent } from './components/CookieConsent';
import { AsystentWidget } from './components/AsystentWidget';
import { UstepujFormularzom } from './components/UstepujFormularzom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { VPS_W_SPRZEDAZY, OFERTA_KROTKO } from '@/lib/oferta';
import { asystentDostepny } from '@/lib/asystent-status';

// D12 (10.10): CSP z nonce (src/proxy.ts) wymaga renderu per żądanie — layout czyta `x-nonce` przez headers(),
// więc strony nie są już ISR. Treść z CMS dalej z cache danych: stopka przez unstable_cache (60 s, lib/globals.ts),
// blog był już force-dynamic; pozostałe strony mają treść w kodzie. Koszt: render HTML przy każdym żądaniu.

export const metadata: Metadata = {
  metadataBase: new URL('https://verris.pl'),
  title: 'Verris – polski hosting z autoskalowaniem. Hosting bez gwiazdek.',
  description:
    `Hosting współdzielony ${VPS_W_SPRZEDAZY ? 'z autoskalowaniem, VPS i domeny' : 'z autoskalowaniem i domeny'} w jednym panelu. Cena odnowienia znana z góry – bez pułapek odnowień. Migracja i SSL za 0 zł, SLA 99,5% z automatycznymi rekompensatami, kopie z samodzielnym odtwarzaniem.`,
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Verris – hosting bez gwiazdek. Skaluj świadomie.',
    description:
      `Polski ${OFERTA_KROTKO}. Płacisz tyle, ile widzisz. Migracja za 0 zł, SLA 99,5% z rekompensatami.`,
    url: 'https://verris.pl/',
    locale: 'pl_PL',
    type: 'website',
    siteName: 'Verris',
    images: [
      { url: '/og-default.png', width: 1200, height: 630, alt: 'Verris – Hosting bez gwiazdek.' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Verris – hosting bez gwiazdek. Skaluj świadomie.',
    description:
      `Polski ${OFERTA_KROTKO}. Płacisz tyle, ile widzisz. Migracja za 0 zł, SLA 99,5% z rekompensatami.`,
    images: ['/og-default.png'],
  },
};

export default async function FrontendLayout({ children }: { children: ReactNode }) {
  // headers() robi z layoutu render per żądanie, więc status asystenta nie zamarza z czasu builda (w CI nie ma API);
  // fetch statusu ma własny cache danych 60 s i timeout 1,5 s (błąd = widget niewidoczny).
  const [naglowki, asystent] = await Promise.all([headers(), asystentDostepny()]);
  const nonce = naglowki.get('x-nonce') ?? undefined;
  return (
    <html lang="pl">
      <head>
        {/* A2-03: fonty z public/fonts (@font-face w globals.css) — bez żądań do Google. Preload dwóch głównych krojów. */}
        <link rel="preload" href="/fonts/hanken-grotesk-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/schibsted-grotesk-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <Analytics nonce={nonce} />
        {/* Decyzja 22 — bez ramki GTM dla przeglądarek bez JavaScriptu: tagi Google tylko po zgodzie z banera. */}
        <Header />
        {children}
        <Footer />
        <CookieConsent />
        <UstepujFormularzom />
        {/* Asystent AI — włącza go wyłącznie przełącznik w Admin → Konfiguracja asystenta (/settings/ai), sekcja „Asystent na verris.pl” (GET /public/asystent/status). */}
        <AsystentWidget wlaczony={asystent} />
      </body>
    </html>
  );
}
