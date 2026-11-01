import type { ReactNode } from 'react';
import './przenies.css';

/**
 * Style strony /przenies-strone (makieta 1.11.2026) ładowane przez layout segmentu, nie przez page.tsx —
 * testy jest renderują stronę bez obsługi plików CSS. Klasy mają prefiks (pc-, pp-, pz-), więc poradniki
 * /przenies-strone/z-* nie są nimi dotknięte.
 */
export default function PrzeniesLayout({ children }: { children: ReactNode }) {
  return children;
}
