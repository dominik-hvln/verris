import type { ReactNode } from 'react';
import './poczta.css';

/**
 * Style strony /poczta (makieta 1.11.2026) ładowane przez layout segmentu, nie przez page.tsx —
 * testy jest renderują stronę bez obsługi plików CSS.
 */
export default function PocztaLayout({ children }: { children: ReactNode }) {
  return children;
}
