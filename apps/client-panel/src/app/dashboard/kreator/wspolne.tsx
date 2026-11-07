'use client';

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cx } from '@/components/panel/cx';

/**
 * Drobne elementy UI Verris Kreatora wspólne dla listy, kreatora briefu i edytora. Wyłącznie tokeny motywu
 * (text-foreground, bg-card, border-line…) – działają w jasnym i ciemnym motywie panelu bez mapowania .v2-skin.
 */

export const klasaPola =
  'w-full rounded-[7px] border border-line-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-data aria-[invalid=true]:border-crit';

export const klasaPrzyciskuGlownego =
  'inline-flex items-center justify-center gap-2 rounded-[7px] border border-primary bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-data-hi disabled:cursor-not-allowed disabled:opacity-50';

export const klasaPrzyciskuDrugiego =
  'inline-flex items-center justify-center gap-2 rounded-[7px] border border-line-strong bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50';

export const klasaPrzyciskuIkony =
  'inline-flex h-7 w-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40';

/** Oznaczenie elementu Kreatora Pro (kłódka) – w wersjach bez Pro. W Pro sam napis „Pro” bez kłódki. */
export function ZnakPro({ zablokowane = true, className }: { zablokowane?: boolean; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex flex-none items-center gap-1 rounded-full px-1.5 py-[1px] font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em]',
        zablokowane ? 'bg-warn-soft text-warn' : 'bg-data-soft text-data-hi',
        className,
      )}
    >
      {zablokowane ? <Lock className="h-3 w-3" aria-hidden /> : null}
      Pro
      {zablokowane ? <span className="sr-only"> – funkcja Kreatora Pro</span> : null}
    </span>
  );
}

/** Pole z etykietą, podpowiedzią, licznikiem znaków i błędem powiązanym przez aria-describedby. */
export function Pole({
  etykieta,
  podpowiedz,
  blad,
  licznik,
  children,
  className,
}: {
  etykieta: ReactNode;
  podpowiedz?: ReactNode;
  blad?: string | null;
  licznik?: { ile: number; max: number; zalecane?: number } | null;
  children: (atrybuty: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const idOpisu = `${id}-opis`;
  const idBledu = `${id}-blad`;
  const opisane = [podpowiedz ? idOpisu : null, blad ? idBledu : null].filter(Boolean).join(' ') || undefined;
  const ponadZalecane = licznik?.zalecane !== undefined && licznik.ile > licznik.zalecane;
  const ponadMax = licznik ? licznik.ile > licznik.max : false;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-foreground">
          {etykieta}
        </label>
        {licznik ? (
          <span
            className={cx('font-mono text-[11.5px] tabular-nums', ponadMax ? 'text-crit' : ponadZalecane ? 'text-warn' : 'text-muted-foreground')}
            aria-hidden
          >
            {licznik.ile}/{licznik.zalecane ?? licznik.max}
          </span>
        ) : null}
      </div>
      {children({ id, 'aria-describedby': opisane, ...(blad ? { 'aria-invalid': true } : {}) })}
      {podpowiedz ? (
        <p id={idOpisu} className="text-[12px] leading-snug text-muted-foreground">
          {podpowiedz}
        </p>
      ) : null}
      {blad ? (
        <p id={idBledu} className="text-[12px] font-medium text-crit">
          {blad}
        </p>
      ) : null}
    </div>
  );
}

export interface OpcjaKafelka<T extends string> {
  wartosc: T;
  nazwa: ReactNode;
  opis?: ReactNode;
  pro?: boolean;
  wylaczona?: boolean;
  dodatek?: ReactNode;
}

/**
 * Wybór jednej opcji kafelkami (radiogroup wg APG: strzałki przechodzą i wybierają, Tab wchodzi na wybraną).
 * `kolumny` – klasy siatki Tailwind.
 */
export function Kafelki<T extends string>({
  etykieta,
  wartosc,
  opcje,
  onZmiana,
  kolumny = 'grid-cols-1 sm:grid-cols-2',
  proZablokowane = true,
  ukryjEtykiete = false,
}: {
  etykieta: string;
  wartosc: T | null;
  opcje: OpcjaKafelka<T>[];
  onZmiana: (w: T) => void;
  kolumny?: string;
  proZablokowane?: boolean;
  ukryjEtykiete?: boolean;
}) {
  const id = useId();
  const refy = useRef<(HTMLButtonElement | null)[]>([]);
  const aktywne = opcje.map((o, i) => (o.wylaczona ? -1 : i)).filter((i) => i >= 0);
  const wybrany = opcje.findIndex((o) => o.wartosc === wartosc);
  const klawisz = (e: KeyboardEvent, i: number) => {
    const krok = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!krok) return;
    e.preventDefault();
    const poz = aktywne.indexOf(i);
    const nast = aktywne[(poz + krok + aktywne.length) % aktywne.length];
    if (nast === undefined) return;
    onZmiana(opcje[nast]!.wartosc);
    refy.current[nast]?.focus();
  };
  return (
    <div className="flex flex-col gap-2">
      <div id={id} className={cx('text-[13px] font-medium text-foreground', ukryjEtykiete && 'sr-only')}>
        {etykieta}
      </div>
      <div role="radiogroup" aria-labelledby={id} className={cx('grid gap-2', kolumny)}>
        {opcje.map((o, i) => {
          const zaznaczona = o.wartosc === wartosc;
          const fokusowalna = zaznaczona || (wybrany === -1 && i === aktywne[0]);
          return (
            <button
              key={o.wartosc}
              ref={(el) => {
                refy.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={zaznaczona}
              disabled={o.wylaczona}
              tabIndex={fokusowalna ? 0 : -1}
              onClick={() => onZmiana(o.wartosc)}
              onKeyDown={(e) => klawisz(e, i)}
              className={cx(
                'flex flex-col items-start gap-1 rounded-[8px] border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                zaznaczona ? 'border-data bg-data-soft' : 'border-line bg-card hover:border-line-strong hover:bg-raised',
              )}
            >
              <span className="flex w-full items-center gap-2 text-[13.5px] font-semibold text-foreground">
                <span className="min-w-0 flex-1">{o.nazwa}</span>
                {o.pro ? <ZnakPro zablokowane={proZablokowane} /> : null}
              </span>
              {o.opis ? <span className="text-[12px] leading-snug text-muted-foreground">{o.opis}</span> : null}
              {o.dodatek}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Komunikat w ramce (informacja, ostrzeżenie, błąd) – role dobierane do wagi. */
export function Komunikat({ rodzaj = 'info', tytul, children, className }: { rodzaj?: 'info' | 'ostrzezenie' | 'blad' | 'sukces'; tytul?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div
      role={rodzaj === 'blad' ? 'alert' : undefined}
      className={cx(
        'rounded-[8px] border px-3.5 py-3 text-[13px] leading-relaxed',
        rodzaj === 'info' && 'border-line bg-raised text-foreground',
        rodzaj === 'ostrzezenie' && 'border-warn/40 bg-warn-soft text-foreground',
        rodzaj === 'blad' && 'border-crit/40 bg-crit/10 text-foreground',
        rodzaj === 'sukces' && 'border-data/40 bg-data-soft text-foreground',
        className,
      )}
    >
      {tytul ? <p className={cx('font-semibold', rodzaj === 'blad' ? 'text-crit' : rodzaj === 'ostrzezenie' ? 'text-warn' : rodzaj === 'sukces' ? 'text-data-hi' : 'text-foreground')}>{tytul}</p> : null}
      {children ? <div className={cx(tytul ? 'mt-1' : null, 'text-muted-foreground')}>{children}</div> : null}
    </div>
  );
}

/** Miniatura strony na liście: tło, pasek akcentu i nazwa w kolorach projektu. */
export function Miniatura({ nazwa, tlo, akcent, tekst, className }: { nazwa: string; tlo: string; akcent: string; tekst: string; className?: string }) {
  return (
    <div
      aria-hidden
      className={cx('relative flex aspect-[16/10] flex-col justify-between overflow-hidden rounded-[8px] border border-line p-3', className)}
      style={{ background: tlo, color: tekst }}
    >
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-6 rounded-full" style={{ background: akcent }} />
        <span className="h-1 w-8 rounded-full opacity-30" style={{ background: tekst }} />
        <span className="ml-auto h-1 w-4 rounded-full opacity-30" style={{ background: tekst }} />
      </div>
      <div>
        <p className="break-words font-display text-[15px] font-bold leading-tight">{nazwa}</p>
        <span className="mt-2 block h-1 w-2/3 rounded-full opacity-25" style={{ background: tekst }} />
        <span className="mt-1 block h-1 w-1/2 rounded-full opacity-25" style={{ background: tekst }} />
        <span className="mt-2.5 inline-block h-3 w-12 rounded-[3px]" style={{ background: akcent }} />
      </div>
    </div>
  );
}
