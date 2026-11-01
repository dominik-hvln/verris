import type { ReactNode } from 'react';
import './hosting.css';

/**
 * Style strony /hosting (makieta 1.11.2026) ładowane przez layout segmentu, nie przez page.tsx —
 * testy jest renderują stronę bez obsługi plików CSS. Klasy mają prefiks (h-, hspec, hdod, hprz, hpyt),
 * więc podstrony /hosting/wordpress i /hosting/sklep nie są nimi dotknięte.
 */
export default function HostingLayout({ children }: { children: ReactNode }) {
  return children;
}
