'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Kpi, KpiStrip, MiniBars, SectionHead } from '@/components/panel/v2';
import { fetchStatystykiStrony, odswiezStatystykiStrony, type StatystykiStrony } from '@/app/dashboard/services/[id]/hosting-site-stats-actions';

const BTN = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50';
const dzien = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric' });

/**
 * PB-19 — ruch 7 dni, błędy 5xx, TTFB z serwera i technologia strony. Dane z logu domeny i pomiaru na
 * węźle; brak danych = „—”, nie zero. Pierwsze wejście zleca odczyt samo (raz).
 */
export function SiteStatsPanel({ serviceId, domain }: { serviceId: string; domain: string }) {
  const [stan, setStan] = useState<StatystykiStrony | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [odczyt, setOdczyt] = useState(0);
  const [pending, start] = useTransition();
  const zlecone = useRef(false);

  useEffect(() => {
    let aktualny = true;
    void fetchStatystykiStrony(serviceId, domain).then((r) => {
      if (!aktualny) return;
      if (!r.ok) return setBlad(r.error);
      setStan(r.stan);
      if (!r.stan.odczytano && !r.stan.wToku && !zlecone.current) {
        zlecone.current = true;
        void odswiezStatystykiStrony(serviceId, domain).then((x) => aktualny && x.ok && setStan(x.stan));
      }
    });
    return () => {
      aktualny = false;
    };
  }, [serviceId, domain, odczyt]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => setOdczyt((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [stan?.wToku]);

  const s = stan?.statystyki ?? null;
  const ruch = s?.ruch ?? [];
  const suma = (k: 'zadania' | 'odwiedzajacy' | 'bledy5xx') => ruch.reduce((a, d) => a + d[k], 0);
  const zLogu = Boolean(s?.log);

  return (
    <section className="mt-6">
      <SectionHead
        title="Ruch i wydajność — 7 dni"
        desc={
          stan?.odczytano
            ? `Z logu serwera WWW i pomiaru na serwerze · odczyt ${new Date(stan.odczytano).toLocaleString('pl-PL')}`
            : 'Z logu serwera WWW i pomiaru na serwerze.'
        }
        action={
          <button
            type="button"
            className={BTN}
            disabled={pending || !stan || stan.wToku}
            onClick={() => start(async () => {
              const r = await odswiezStatystykiStrony(serviceId, domain);
              if (r.ok) setStan(r.stan);
              else setBlad(r.error);
            })}
          >
            {stan?.wToku ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            {stan?.wToku ? 'Odczytuję…' : 'Odśwież'}
          </button>
        }
      />
      {blad || stan?.blad ? <p role="alert" className="m-0 mb-2 text-[13px] text-crit">{blad ?? stan?.blad}</p> : null}
      <KpiStrip>
        <Kpi label="Odwiedzający" value={zLogu ? suma('odwiedzajacy').toLocaleString('pl-PL') : '—'} foot={<span>unikalne adresy IP, 7 dni</span>}>
          {zLogu && ruch.length ? <MiniBars values={ruch.map((d) => d.odwiedzajacy)} labels={ruch.map((d) => dzien(d.dzien))} unit="odwiedzających" /> : null}
        </Kpi>
        <Kpi label="Żądania" value={zLogu ? suma('zadania').toLocaleString('pl-PL') : '—'} foot={<span>wszystkie odpowiedzi serwera</span>}>
          {zLogu && ruch.length ? <MiniBars values={ruch.map((d) => d.zadania)} labels={ruch.map((d) => dzien(d.dzien))} unit="żądań" /> : null}
        </Kpi>
        <Kpi label="Błędy 5xx" value={zLogu ? suma('bledy5xx').toLocaleString('pl-PL') : '—'} foot={<span>{zLogu ? (suma('bledy5xx') ? 'szczegóły niżej i w zakładce Logi' : 'bez błędów serwera') : 'brak logu domeny'}</span>}>
          {zLogu && ruch.length ? <MiniBars values={ruch.map((d) => d.bledy5xx)} labels={ruch.map((d) => dzien(d.dzien))} unit="błędów" lastTone="warn" /> : null}
        </Kpi>
        <Kpi
          label="TTFB (serwer)"
          value={s?.ttfbMs ? s.ttfbMs.mediana : '—'}
          unit={s?.ttfbMs ? 'ms' : undefined}
          foot={<span>{s ? `${s.technologia.nazwa}${s.technologia.wersja ? ` ${s.technologia.wersja}` : ''}` : 'technologia: —'}</span>}
        />
      </KpiStrip>
      {s?.top5xx.length ? (
        <div className="mt-3 rounded-[10px] border border-line bg-card px-4 py-3">
          <b className="text-[13px] font-semibold text-foreground">Adresy z błędami 5xx</b>
          <ul className="m-0 mt-1.5 list-none p-0">
            {s.top5xx.map((x) => (
              <li key={x.sciezka} className="flex justify-between gap-3 text-[13px]">
                <span className="break-all font-mono text-foreground">{x.sciezka}</span>
                <span className="shrink-0 text-muted-foreground">{x.liczba.toLocaleString('pl-PL')}×</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="m-0 mt-2 text-[12px] text-muted-foreground">
        TTFB to czas pierwszego bajtu zmierzony na samym serwerze (bez Twojego łącza) — pokazuje, jak szybko strona generuje odpowiedź.
      </p>
    </section>
  );
}
