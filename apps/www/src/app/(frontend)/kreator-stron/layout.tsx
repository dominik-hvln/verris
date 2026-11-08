import type { ReactNode } from 'react';
import './kreator.css';

/**
 * Style strony /kreator-stron (paczka 123) ładowane przez layout segmentu, nie przez page.tsx —
 * testy jest renderują stronę bez obsługi plików CSS (jak /poczta).
 */
export default function KreatorStronLayout({ children }: { children: ReactNode }) {
  return children;
}
