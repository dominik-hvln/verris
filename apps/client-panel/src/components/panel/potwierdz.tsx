'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle } from 'lucide-react';
import { cx } from './cx';

export interface OpcjePotwierdzenia {
  /** Etykieta przycisku akcji, np. „Usuń” — domyślnie „Potwierdź”. */
  akcja?: string;
  /** Akcja nieodwracalna lub niszcząca — czerwony przycisk. */
  niebezpieczne?: boolean;
  tytul?: string;
}

export interface OpcjePytania {
  akcja?: string;
  tytul?: string;
  /** Wartość startowa pola (jak drugi argument `window.prompt`). */
  domyslna?: string;
  placeholder?: string;
}

/**
 * Okna w stylu panelu zamiast systemowych `window.confirm` / `window.prompt`.
 * Wołane jak oryginały, tylko z `await`:
 *   `if (!(await potwierdz('Usunąć?', { akcja: 'Usuń', niebezpieczne: true }))) return;`
 *   `const nazwa = await zapytaj('Nazwa folderu:');  // null = anulowano`
 * Montują się same na `document.body` (bez providera). Esc i klik w tło = anuluj, Enter w polu = akcja,
 * fokus startuje na „Anuluj” przy akcjach niebezpiecznych i wraca na poprzedni element po zamknięciu.
 */
export function potwierdz(tresc: string, opcje: OpcjePotwierdzenia = {}): Promise<boolean> {
  return pokaz<boolean>((zamknij) => <Okno tresc={tresc} {...opcje} onWynik={(ok) => zamknij(ok)} />);
}

export function zapytaj(tresc: string, opcje: OpcjePytania = {}): Promise<string | null> {
  return pokaz<string | null>((zamknij) => (
    <Okno
      tresc={tresc}
      akcja={opcje.akcja ?? 'OK'}
      tytul={opcje.tytul}
      pole={{ domyslna: opcje.domyslna ?? '', placeholder: opcje.placeholder }}
      onWynik={(ok, wartosc) => zamknij(ok ? (wartosc ?? '') : null)}
    />
  ));
}

function pokaz<T>(render: (zamknij: (wynik: T) => void) => React.ReactNode): Promise<T> {
  const poprzedniFokus = document.activeElement as HTMLElement | null;
  const kontener = document.createElement('div');
  document.body.appendChild(kontener);
  const root = createRoot(kontener);
  return new Promise<T>((resolve) => {
    root.render(
      render((wynik) => {
        root.unmount();
        kontener.remove();
        poprzedniFokus?.focus?.();
        resolve(wynik);
      }),
    );
  });
}

function Okno({
  tresc,
  akcja = 'Potwierdź',
  niebezpieczne = false,
  tytul = niebezpieczne ? 'Na pewno?' : 'Potwierdź',
  pole,
  onWynik,
}: OpcjePotwierdzenia & {
  tresc: string;
  pole?: { domyslna: string; placeholder?: string };
  onWynik: (ok: boolean, wartosc?: string) => void;
}) {
  const idTytulu = useId();
  const idTresci = useId();
  const [wartosc, setWartosc] = useState(pole?.domyslna ?? '');
  const anuluj = useRef<HTMLButtonElement>(null);
  const zatwierdz = useRef<HTMLButtonElement>(null);
  const wejscie = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pole) {
      wejscie.current?.focus();
      wejscie.current?.select();
    } else (niebezpieczne ? anuluj : zatwierdz).current?.focus();
    const klawisz = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onWynik(false);
    };
    window.addEventListener('keydown', klawisz);
    return () => window.removeEventListener('keydown', klawisz);
  }, [pole, niebezpieczne, onWynik]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onWynik(false)} aria-hidden />
      <form
        role={pole ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby={idTytulu}
        aria-describedby={idTresci}
        onSubmit={(e) => {
          e.preventDefault();
          onWynik(true, wartosc);
        }}
        className="relative w-full max-w-md rounded-t-[10px] border border-line-strong bg-card p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] sm:rounded-[10px]"
      >
        <div className="flex items-start gap-3">
          {niebezpieczne ? (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-crit/10 text-crit" aria-hidden>
              <AlertTriangle className="h-4 w-4" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id={idTytulu} className="m-0 font-display text-[17px] font-bold leading-tight tracking-[-0.01em] text-foreground">
              {tytul}
            </h2>
            <p id={idTresci} className="mt-2 break-words text-sm text-muted-foreground">
              {tresc}
            </p>
            {pole ? (
              <input
                ref={wejscie}
                value={wartosc}
                onChange={(e) => setWartosc(e.target.value)}
                placeholder={pole.placeholder}
                aria-labelledby={idTresci}
                className="mt-4 w-full rounded-md border border-line-strong bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={anuluj}
            type="button"
            onClick={() => onWynik(false)}
            className="inline-flex items-center justify-center rounded-md border border-line-strong bg-card px-4 py-2 text-sm font-medium text-foreground hover:border-primary"
          >
            Anuluj
          </button>
          <button
            ref={zatwierdz}
            type="submit"
            className={cx(
              'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold hover:opacity-90',
              niebezpieczne ? 'bg-crit text-white' : 'bg-primary text-primary-foreground',
            )}
          >
            {akcja}
          </button>
        </div>
      </form>
    </div>
  );
}
