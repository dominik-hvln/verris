import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { Analytics } from './components/Analytics';
import { CookieConsent } from './components/CookieConsent';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ANALYTICS } from '@/lib/analytics';
import { VPS_W_SPRZEDAZY, OFERTA_KROTKO } from '@/lib/oferta';

// D12 (10.10): CSP z nonce (src/proxy.ts) wymaga renderu per żądanie — layout czyta `x-nonce` przez headers(),
// więc strony nie są już ISR. Treść z CMS dalej z cache danych: stopka przez unstable_cache (60 s, lib/globals.ts),
// blog był już force-dynamic; pozostałe strony mają treść w kodzie. Koszt: render HTML przy każdym żądaniu.

export const metadata: Metadata = {
  metadataBase: new URL('https://verris.pl'),
  title: 'Verris — polski hosting z autoskalowaniem. Hosting bez gwiazdek.',
  description:
    `Hosting współdzielony ${VPS_W_SPRZEDAZY ? 'z autoskalowaniem, VPS i domeny' : 'z autoskalowaniem i domeny'} w jednym panelu. Jedna cena hostingu: 45 zł/mies lub 449 zł/rok brutto — bez pułapek odnowień. Migracja i SSL za 0 zł, SLA 99,5% z rekompensatami na wniosek, kopie z samodzielnym odtwarzaniem.`,
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Verris — hosting bez gwiazdek. Skaluj świadomie.',
    description:
      `Polski ${OFERTA_KROTKO}. Płacisz tyle, ile widzisz. Migracja za 0 zł, SLA 99,5% z rekompensatami.`,
    url: 'https://verris.pl/',
    locale: 'pl_PL',
    type: 'website',
    siteName: 'Verris',
    images: [
      { url: '/og-default.png', width: 1200, height: 630, alt: 'Verris — Hosting bez gwiazdek.' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Verris — hosting bez gwiazdek. Skaluj świadomie.',
    description:
      `Polski ${OFERTA_KROTKO}. Płacisz tyle, ile widzisz. Migracja za 0 zł, SLA 99,5% z rekompensatami.`,
    images: ['/og-default.png'],
  },
};

export default async function FrontendLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="pl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- to root layout App Routera, więc font ładuje się na każdej stronie; reguła celuje w pages/_document */}
        <link
          href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@700;800&family=Hanken+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Analytics nonce={nonce} />
        {ANALYTICS.gtmId ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${ANALYTICS.gtmId}`}
              title="Google Tag Manager"
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        ) : null}
        <Header />
        {children}
        <Footer />
        <CookieConsent />
      </body>
    </html>
  );
}
