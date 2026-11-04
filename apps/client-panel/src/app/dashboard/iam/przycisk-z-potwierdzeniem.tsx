'use client';

import type { ReactNode } from 'react';
import { potwierdz } from '@/components/panel/potwierdz';

/**
 * P3-01 — przycisk formularza z akcją serwerową, który najpierw pyta (okno panelu, nie `window.confirm`).
 * Bez potwierdzenia formularz nie wychodzi; po „tak” wysyłamy ten sam formularz z tym przyciskiem jako nadawcą.
 */
export function PrzyciskZPotwierdzeniem({
  pytanie,
  akcja,
  niebezpieczne = false,
  tytul,
  className,
  children,
}: {
  pytanie: string;
  akcja: string;
  niebezpieczne?: boolean;
  tytul?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={async (e) => {
        // requestSubmit nie wywołuje ponownie kliknięcia — pytanie pada przy każdym kliknięciu.
        e.preventDefault();
        const przycisk = e.currentTarget;
        if (!(await potwierdz(pytanie, { akcja, niebezpieczne, tytul }))) return;
        przycisk.form?.requestSubmit(przycisk);
      }}
    >
      {children}
    </button>
  );
}
