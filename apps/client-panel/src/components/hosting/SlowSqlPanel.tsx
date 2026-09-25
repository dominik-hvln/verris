'use client';

import { useEffect, useState, useTransition } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { SectionHead } from '@/components/panel/v2';
import { fetchWolneZapytania, odswiezWolneZapytania, type WolneZapytania } from '@/app/dashboard/services/[id]/hosting-slow-sql-actions';

const BTN = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';
const TH = 'whitespace-nowrap px-3 pb-2.5 pt-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground';
const TD = 'border-t border-line px-3 py-[11px] align-top text-[13px]';
const sek = (v: number) => `${v.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} s`;

/**
 * K-14 — zapytania, które trwały dłużej niż próg (slow query log). Pokazujemy kształt zapytania bez
 * wartości, zgrupowany — od najbardziej obciążającego (łączny czas). Wskazówki: indeksy, LIMIT, cache.
 */
export function SlowSqlPanel({ serviceId }: { serviceId: string }) {
  const [stan, setStan] = useState<WolneZapytania | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [odczyt, setOdczyt] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    let aktualny = true;
    void fetchWolneZapytania(serviceId).then((r) => {
      if (!aktualny) return;
      if (r.ok) setStan(r.stan);
      else setBlad(r.error);
    });
    return () => {
      aktualny = false;
    };
  }, [serviceId, odczyt]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => setOdczyt((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [stan?.wToku]);

  const odswiez = () =>
    start(async () => {
      const r = await odswiezWolneZapytania(serviceId);
      if (r.ok) setStan(r.stan);
      else setBlad(r.error);
    });

  return (
    <section className="mt-8">
      <SectionHead
        title="Wolne zapytania SQL"
        desc={`Zapytania Twoich baz, które trwały dłużej niż ${stan?.progSekund ?? 2} s. Wartości są ukryte — widać tylko kształt zapytania.`}
        action={
          <button type="button" className={BTN} disabled={pending || !stan || stan.wToku} onClick={odswiez}>
            {stan?.wToku ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            {stan?.wToku ? 'Odczytuję…' : 'Odczytaj'}
          </button>
        }
      />
      {blad ? <p role="alert" className="m-0 mb-2 text-[13px] text-crit">{blad}</p> : null}
      {stan?.blad ? <p role="alert" className="m-0 mb-2 text-[13px] text-crit">{stan.blad}</p> : null}
      {stan && !stan.odczytano && !stan.wToku ? (
        <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-3 text-[13.5px] text-muted-foreground">
          Kliknij „Odczytaj” — serwer przejrzy dziennik wolnych zapytań (kilka sekund).
        </p>
      ) : null}
      {stan?.odczytano && stan.wlaczony === false ? (
        <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-3 text-[13.5px] text-muted-foreground">
          Dziennik wolnych zapytań jest na serwerze wyłączony — napisz do nas, włączymy go.
        </p>
      ) : null}
      {stan?.odczytano && stan.wlaczony !== false && stan.grupy.length === 0 ? (
        <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-3 text-[13.5px] text-muted-foreground">Brak wolnych zapytań — bazy odpowiadają szybko.</p>
      ) : null}
      {stan?.grupy.length ? (
        <>
          <div className="overflow-hidden rounded-[10px] border border-line bg-card">
            <table className="v2-stack w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Zapytanie</th>
                  <th className={TH}>Baza</th>
                  <th className={TH}>Ile razy</th>
                  <th className={TH}>Łącznie / najdłużej</th>
                  <th className={TH}>Przejrzane wiersze</th>
                </tr>
              </thead>
              <tbody>
                {stan.grupy.map((g) => (
                  <tr key={`${g.baza}:${g.sql}`}>
                    <td className={TD} data-label="Zapytanie">
                      <code className="block max-w-[640px] whitespace-pre-wrap break-words font-mono text-[12px] text-foreground">{g.sql}</code>
                    </td>
                    <td className={`${TD} font-mono`} data-label="Baza">{g.baza}</td>
                    <td className={TD} data-label="Ile razy">{g.liczba.toLocaleString('pl-PL')}</td>
                    <td className={TD} data-label="Łącznie / najdłużej">{sek(g.suma)} / {sek(g.max)}</td>
                    <td className={TD} data-label="Przejrzane wiersze">{g.przejrzane.toLocaleString('pl-PL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 mt-2 text-[12px] text-muted-foreground">
            Dużo przejrzanych wierszy przy małym wyniku zwykle oznacza brak indeksu na kolumnach z WHERE/JOIN. W WordPressie pomaga cache obiektowy (Redis w zakładce PHP i serwer).
          </p>
        </>
      ) : null}
    </section>
  );
}
