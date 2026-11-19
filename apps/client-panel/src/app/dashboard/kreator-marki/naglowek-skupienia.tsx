import type { ReactNode } from 'react';
import type { StanKreatoraMarki } from '@verris/kreator/klient';
import { OstrzezeniePrawne, PigulkaLimitow } from './wspolne-marki';

/**
 * Paczka 131 – nagłówek ekranów Kreatora marki w trybie skupienia: tytuł, opis, wersja i limity AI, a pod nimi stałe
 * ostrzeżenie prawne (projekt prawny, sekcja 6 pkt 1). `kroki` – nawigacja po etapach marki.
 */
export function NaglowekMarki({
  tytul,
  opis,
  stan,
  kroki,
}: {
  tytul: string;
  opis?: ReactNode;
  stan: Pick<StanKreatoraMarki, 'wersja' | 'limity'> | null;
  kroki?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="m-0 break-words font-display text-[24px] font-bold leading-tight text-foreground sm:text-[28px]">{tytul}</h1>
          {opis ? <p className="mt-1 max-w-3xl text-[13.5px] text-muted-foreground">{opis}</p> : null}
        </div>
        {stan ? <PigulkaLimitow stan={stan} className="flex-none" /> : null}
      </div>
      {kroki}
      <OstrzezeniePrawne />
    </header>
  );
}
