'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SectionHead } from '@/components/panel/v2';
import { fetchPhpInfo, runPhpInfo, type PhpInfoStatus } from '@/app/dashboard/services/[id]/hosting-php-info-actions';

const BTN = 'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';
const puste = (v: string | null) => (v === null ? 'brak' : v === '' ? 'wyłączone / puste' : v === '1' ? 'włączone' : v);

/**
 * B-06 — konfiguracja PHP tej strony tak, jak widzi ją serwer WWW (wersja z konsoli SSH
 * może być inna). Tylko odczyt; zmiany dyrektyw — w sekcji ustawień PHP powyżej.
 */
export function PhpInfoPanel({ serviceId, domain }: { serviceId: string; domain: string }) {
  const [stan, setStan] = useState<PhpInfoStatus | null>(null);
  const [bladWczytania, setBladWczytania] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const odswiez = useCallback(
    () =>
      fetchPhpInfo(serviceId, domain).then((r) => {
        if (r.ok) {
          setStan(r.status);
          setBladWczytania(null);
        } else setBladWczytania(r.error);
      }),
    [serviceId, domain],
  );
  useEffect(() => {
    void odswiez();
  }, [odswiez]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => void odswiez(), 4_000);
    return () => clearInterval(t);
  }, [stan?.wToku, odswiez]);

  const odczytaj = () =>
    start(async () => {
      const r = await runPhpInfo(serviceId, domain);
      if (r.ok) setStan(r.status);
      else toast.error(r.error);
    });

  const k = stan?.konfiguracja ?? null;
  return (
    <section className="mt-8">
      <SectionHead title="Aktualna konfiguracja PHP" desc="Odczyt z serwera WWW tej strony: wersja, najważniejsze ustawienia i włączone rozszerzenia." />
      {bladWczytania && !stan ? <p role="alert" className="m-0 my-2 rounded-[8px] border border-line px-3 py-2 text-[13px] text-crit">Nie udało się wczytać: {bladWczytania}</p> : null}
      <div className="rounded-[10px] border border-line bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="text-[13px] text-muted-foreground">
            {stan?.wToku
              ? 'Odczytuję…'
              : k
                ? `PHP ${k.wersja}${k.sapi ? ` (${k.sapi})` : ''}${stan?.odczytano ? ` · odczyt z ${new Date(stan.odczytano).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`
                : 'Jeszcze nie odczytano.'}
          </span>
          <button type="button" onClick={odczytaj} disabled={pending || !stan || stan.wToku} className={BTN}>
            {k ? 'Odczytaj ponownie' : 'Odczytaj konfigurację'}
          </button>
        </div>
        {stan?.blad ? <p className="m-0 border-t border-line px-4 py-2 text-[13px] text-crit">{stan.blad}</p> : null}
        {k ? (
          <>
            <dl className="m-0 grid border-t border-line text-[13px] sm:grid-cols-2">
              {Object.entries(k.ini).map(([nazwa, v]) => (
                <div key={nazwa} className="flex min-w-0 justify-between gap-3 border-b border-line px-4 py-1.5">
                  <dt className="font-mono text-[12px] text-muted-foreground">{nazwa}</dt>
                  <dd className="m-0 min-w-0 break-all text-right font-mono text-[12px] text-foreground">{puste(v)}</dd>
                </div>
              ))}
            </dl>
            <div className="px-4 py-3">
              <span className="block text-[13px] font-medium text-foreground">Rozszerzenia ({k.rozszerzenia.length})</span>
              <ul className="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0">
                {k.rozszerzenia.map((e) => (
                  <li key={e} className="rounded-[5px] border border-line bg-raised px-2 py-0.5 font-mono text-[12px] text-foreground">
                    {e}
                  </li>
                ))}
              </ul>
              <p className="m-0 mt-2 text-[12px] text-muted-foreground">Brakuje rozszerzenia? Napisz do nas — włączymy je dla Twojego konta.</p>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
