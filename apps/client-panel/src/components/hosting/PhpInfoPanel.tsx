'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SectionHead, Switch } from '@/components/panel/v2';
import { fetchPhpInfo, runPhpInfo, setPhpExtensions, type PhpInfoStatus } from '@/app/dashboard/services/[id]/hosting-php-info-actions';

const BTN = 'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';
const puste = (v: string | null) => (v === null ? 'brak' : v === '' ? 'wyłączone / puste' : v === '1' ? 'włączone' : v);

/**
 * B-06 — konfiguracja PHP tej strony tak, jak widzi ją serwer WWW (wersja z konsoli SSH
 * może być inna). Zmiany dyrektyw — w sekcji ustawień PHP powyżej; rozszerzenia (B-04) — tu, gdy konto
 * ma selektor PHP CloudLinux.
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
  const [zmiany, setZmiany] = useState<Record<string, boolean>>({});
  const [filtr, setFiltr] = useState('');
  const sel = k?.selektor ?? null;
  const doWlaczenia = Object.keys(zmiany).filter((n) => zmiany[n]);
  const doWylaczenia = Object.keys(zmiany).filter((n) => !zmiany[n]);
  const przelacz = (nazwa: string, bylo: boolean, teraz: boolean) =>
    setZmiany((z) => {
      const n = { ...z };
      if (teraz === bylo) delete n[nazwa];
      else n[nazwa] = teraz;
      return n;
    });
  const zastosuj = () =>
    sel &&
    start(async () => {
      const r = await setPhpExtensions(serviceId, { enable: doWlaczenia, disable: doWylaczenia, version: sel.wersja });
      if (r.ok) {
        setZmiany({});
        toast.success('Zmiana zlecona — za chwilę kliknij „Odczytaj ponownie”, żeby zobaczyć wynik.');
      } else toast.error(r.error);
    });

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
              {sel ? null : <p className="m-0 mt-2 text-[12px] text-muted-foreground">Brakuje rozszerzenia? Napisz do nas — włączymy je dla Twojego konta.</p>}
            </div>
            {sel ? (
              <div className="border-t border-line px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-foreground">Włączanie rozszerzeń (PHP {sel.wersja})</span>
                  <input
                    value={filtr}
                    onChange={(e) => setFiltr(e.target.value)}
                    placeholder="Szukaj rozszerzenia"
                    aria-label="Szukaj rozszerzenia"
                    className="w-48 rounded-[7px] border border-line bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-data"
                  />
                </div>
                <ul className="m-0 mt-2 grid list-none gap-x-4 gap-y-1 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {sel.rozszerzenia
                    .filter((r) => r.nazwa.toLowerCase().includes(filtr.trim().toLowerCase()))
                    .map((r) => {
                      const bylo = r.stan !== 'off';
                      const teraz = zmiany[r.nazwa] ?? bylo;
                      return (
                        <li key={r.nazwa} className="flex items-center justify-between gap-2 py-0.5 text-[13px]">
                          <span className="min-w-0 break-all font-mono text-[12px] text-foreground">
                            {r.nazwa}
                            {r.stan === 'wbudowane' ? <span className="ml-1 font-sans text-muted-foreground">(wbudowane)</span> : null}
                          </span>
                          <Switch
                            checked={teraz}
                            onChange={(v) => przelacz(r.nazwa, bylo, v)}
                            label={r.nazwa}
                            disabled={pending || r.stan === 'wbudowane'}
                          />
                        </li>
                      );
                    })}
                </ul>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] text-muted-foreground">
                    {doWlaczenia.length || doWylaczenia.length
                      ? `Do włączenia: ${doWlaczenia.join(', ') || '—'} · do wyłączenia: ${doWylaczenia.join(', ') || '—'}`
                      : 'Wbudowanych rozszerzeń nie da się wyłączyć. Zmiana obejmuje całe konto.'}
                  </span>
                  <button type="button" onClick={zastosuj} disabled={pending || (!doWlaczenia.length && !doWylaczenia.length)} className={BTN}>
                    Zastosuj zmiany
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
