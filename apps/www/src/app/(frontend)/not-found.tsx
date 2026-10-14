import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from './components/ui';
import { KB_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Nie ma takiej strony — Verris',
  description: 'Adres mógł się zmienić albo zawiera literówkę. Zobacz hosting, cennik, przeniesienie strony, domeny i pomoc.',
  robots: { index: false },
};

const NAJCZESCIEJ: { label: string; href: string }[] = [
  { label: 'Hosting', href: '/hosting' },
  { label: 'Cennik', href: '/cennik' },
  { label: 'Przeniesienie strony', href: '/przenies-strone' },
  { label: 'Domeny', href: '/domeny' },
  { label: 'Pomoc', href: KB_URL },
];

/**
 * 404 w wyglądzie strony zamiast domyślnego, angielskiego ekranu Next.js („This page could not be found”).
 * Łapie zarówno notFound() z podstron (np. /vps przed wejściem do sprzedaży), jak i nieznane adresy
 * przez `[...nieznany]/page.tsx`. Makieta 14.10 (NieZnaleziono): bez okruszków, z listą najczęstszych celów.
 */
export default function NotFound() {
  return (
    <main>
      <section className="subhero d-404">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap">
          <div className="subhero-inner">
            <span className="eyebrow">Błąd 404</span>
            <h1>Tej strony tu nie ma. Ale Twoja strona może u nas działać</h1>
            <p className="lead">
              Link mógł się zestarzeć albo zgubiła się w nim literka. Zobacz, czego najczęściej szukają ludzie:
            </p>
            <nav aria-label="Najczęściej odwiedzane">
              <ul className="d-404-links">
                {NAJCZESCIEJ.map((l) => (
                  <li key={l.href}>
                    {l.href.startsWith('/') ? <Link href={l.href}>{l.label}</Link> : <a href={l.href}>{l.label}</a>}
                  </li>
                ))}
              </ul>
            </nav>
            <div className="hero-cta">
              <Button href="/" cta="404-home">
                Wróć na stronę główną
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
