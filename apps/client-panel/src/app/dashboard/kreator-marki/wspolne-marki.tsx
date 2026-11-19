import { ExternalLink, ShieldAlert } from 'lucide-react';
import type { StanKreatoraMarki } from '@verris/kreator/klient';
import { cx } from '@/components/panel/cx';
import { ADRES_TMVIEW, ETYKIETY_WERSJI_MARKI, KROKI_TMVIEW, OSTRZEZENIE_NAGLOWKA, pozostaloZ } from '@/lib/kreator-marki';

/**
 * Paczka 131 – elementy wspólne ekranów Kreatora marki (bez 'use client' – działają w komponentach serwerowych
 * i klienckich): stałe ostrzeżenie prawne w nagłówku, instrukcja TMview, pigułka wersji i limitów.
 */

/** Ostrzeżenie w nagłówku (projekt prawny, sekcja 6 pkt 1) – zawsze widoczne, z instrukcją TMview do rozwinięcia. */
export function OstrzezeniePrawne({ className }: { className?: string }) {
  return (
    <div className={cx('rounded-[8px] border border-warn/40 bg-warn-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground', className)}>
      <p className="m-0 flex gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-warn" aria-hidden />
        <span>{OSTRZEZENIE_NAGLOWKA}</span>
      </p>
      <details className="mt-1.5 pl-6">
        <summary className="cursor-pointer font-semibold text-foreground underline underline-offset-2">Jak to zrobić</summary>
        <InstrukcjaTmview className="mt-2" />
      </details>
    </div>
  );
}

export function InstrukcjaTmview({ className }: { className?: string }) {
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[12.5px] text-foreground">
        {KROKI_TMVIEW.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ol>
      <a
        href={ADRES_TMVIEW}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-data-hi underline underline-offset-2"
      >
        Otwórz TMview <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only"> (otwiera się w nowej karcie)</span>
      </a>
    </div>
  );
}

/** Wersja konta i liczniki AI w nagłówku ekranów marki. */
export function PigulkaLimitow({ stan, className }: { stan: Pick<StanKreatoraMarki, 'wersja' | 'limity'>; className?: string }) {
  const { serie, zmianyAi } = stan.limity;
  return (
    <div className={cx('flex flex-wrap items-center gap-1.5 text-[12px]', className)}>
      <span className="rounded-full border border-data/50 bg-data-soft px-2.5 py-1 font-semibold text-foreground">{ETYKIETY_WERSJI_MARKI[stan.wersja]}</span>
      <span className="rounded-full border border-line px-2.5 py-1 font-mono tabular-nums text-muted-foreground">
        <span className="sr-only">Limit AI: </span>
        serie {pozostaloZ(serie)}/{serie.limit} · zmiany AI {pozostaloZ(zmianyAi)}/{zmianyAi.limit}
      </span>
    </div>
  );
}
