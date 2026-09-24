import type { Metadata } from 'next';
import { SubHero } from './components/ui';

export const metadata: Metadata = {
  title: 'Nie ma takiej strony — Verris',
  robots: { index: false },
};

/**
 * 404 w wyglądzie strony zamiast domyślnego, angielskiego ekranu Next.js („This page could not be found”).
 * Łapie zarówno notFound() z podstron (np. /vps przed wejściem do sprzedaży), jak i nieznane adresy
 * przez `[...nieznany]/page.tsx`.
 */
export default function NotFound() {
  return (
    <main>
      <SubHero
        eyebrow="Błąd 404"
        title="Nie ma takiej strony"
        lead="Adres mógł się zmienić albo zawiera literówkę. Zacznij od strony głównej, cennika albo bazy wiedzy."
        crumbs={[{ label: 'Nie znaleziono' }]}
        primary={{ label: 'Strona główna', href: '/' }}
        secondary={{ label: 'Cennik', href: '/cennik' }}
      />
    </main>
  );
}
