import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { Analytics } from './components/Analytics';
import { CookieConsent } from './components/CookieConsent';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ANALYTICS } from '@/lib/analytics';

// ISR: strony odświeżają treść z CMS (globalsy/kolekcje) co 60 s.
export const revalidate = 60;

export const metadata: Metadata = {
  metadataBase: new URL('https://verris.pl'),
  title: 'Verris — polski hosting z autoskalowaniem. Hosting bez gwiazdek.',
  description:
    'Hosting współdzielony z autoskalowaniem, VPS i domeny w jednym panelu. Jedna cena hostingu: 39 zł/mies lub 349 zł/rok brutto — bez pułapek odnowień. Migracja i SSL za 0 zł, SLA 99,5% z rekompensatami, serwery w UE.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Verris — hosting bez gwiazdek. Skaluj świadomie.',
    description:
      'Polski hosting z autoskalowaniem, VPS i domeny. Płacisz tyle, ile widzisz. Migracja za 0 zł, SLA 99,5% z rekompensatami.',
    url: 'https://verris.pl/',
    locale: 'pl_PL',
    type: 'website',
  },
};

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@700;800&family=Hanken+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Analytics />
        {ANALYTICS.gtmId ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${ANALYTICS.gtmId}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        ) : null}
        <div className="announce">
          Nowość · <strong>Hosting z autoskalowaniem</strong> — płacisz tyle, ile widzisz. Migracja
          strony i poczty za <strong>0 zł</strong>.
        </div>
        <Header />
        {children}
        <Footer />
        <CookieConsent />
      </body>
    </html>
  );
}
