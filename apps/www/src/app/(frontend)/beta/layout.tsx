import type { ReactNode } from 'react';
import './beta.css';

/**
 * Style strony /beta ładowane przez layout segmentu, nie przez page.tsx — testy jest renderują stronę
 * bez obsługi plików CSS (jak /poczta).
 */
export default function BetaLayout({ children }: { children: ReactNode }) {
  return children;
}
