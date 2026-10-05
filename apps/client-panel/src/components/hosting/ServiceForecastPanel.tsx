'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Lightbulb, Loader2 } from 'lucide-react';
import type { ForecastResource, ServiceForecastDto, ServiceForecastResourceDto } from '@verris/contracts';
import { fetchServiceForecastAction as fetchServiceForecastActionAkcja } from '@/app/dashboard/services/[id]/hosting-forecast-actions';
import { Wykres } from '@/components/panel/wykres';
import { zOdpakowaniem } from '@/lib/wynik-akcji';
import { days } from '@/lib/pl';

// Akcja zwraca Wynik (komunikat błędu przeżywa produkcję) — tu z powrotem dane albo Error z treścią.
const fetchServiceForecastAction = zOdpakowaniem(fetchServiceForecastActionAkcja);

const KOLEJNOSC: ForecastResource[] = ['CPU', 'RAM', 'DISK', 'IO'];
const NAZWA: Record<ForecastResource, string> = {
  CPU: 'CPU',
  RAM: 'Pamięć RAM',
  DISK: 'Dysk',
  IO: 'Operacje dyskowe (IO)',
};
const PEWNOSC: Record<ServiceForecastDto['confidence'], string> = { low: 'niska', medium: 'średnia', high: 'wysoka' };
const DZIEN_MS = 86_400_000;
const HISTORIA_DNI = 7;

const proc = (v: number) => `${v.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%`;
const godzina = (t: number) =>
  new Date(t).toLocaleString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function uwaga(r: ServiceForecastResourceDto): string {
  if (r.note) return r.note;
  if (r.daysToLimit === 0) return 'na limicie planu';
  if (r.daysToLimit != null) return `limit za ok. ${days(r.daysToLimit)}`;
  return { up: 'rośnie', down: 'spada', flat: 'stabilnie', unknown: '' }[r.trend];
}

export default function ServiceForecastPanel({ serviceId }: { serviceId: string }) {
  const [forecast, setForecast] = useState<ServiceForecastDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Liczby liczy panel (regresja), komentarz AI jest w pamięci 3 h — wczytanie przy wejściu nic nie kosztuje.
  // Spinner przy montażu daje stan początkowy, przy odświeżeniu — onClick; efekt nie ustawia stanu synchronicznie.
  const pobierz = useCallback(
    () =>
      fetchServiceForecastAction(serviceId)
        .then((f) => {
          setForecast(f);
          setError(null);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Nie udało się wczytać prognozy.'))
        .finally(() => setLoading(false)),
    [serviceId],
  );
  useEffect(() => {
    void pobierz();
  }, [pobierz]);

  const ai = forecast?.komentarzAi ? 'true' : undefined;
  const h = forecast?.horizonDays ?? 7;

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-line bg-card px-5 py-4">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-1.5">
          {forecast?.available ? (
            <div className="flex flex-wrap gap-2 text-[12.5px]">
              <span className={`rounded-full px-2.5 py-0.5 font-semibold ${forecast.confidence === 'low' ? 'bg-warn-soft text-warn' : 'bg-data-soft text-data-hi'}`}>
                Pewność: {PEWNOSC[forecast.confidence]}
              </span>
              <span className="rounded-full bg-raised px-2.5 py-0.5 text-muted-foreground">
                {HISTORIA_DNI} dni historii · prognoza na {days(h)}
              </span>
            </div>
          ) : null}
          {loading && !forecast ? (
            <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Liczę prognozę…
            </p>
          ) : forecast && !forecast.available ? (
            <p className="m-0 flex items-start gap-2 text-sm text-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {forecast.unavailableReason ?? 'Prognoza jest chwilowo niedostępna.'}
            </p>
          ) : forecast ? (
            <p data-ai-generated={ai} className="m-0 text-[15px] leading-normal text-foreground">
              {forecast.summary}
            </p>
          ) : null}
          {error ? <p className="m-0 text-sm text-crit">{error}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              void pobierz();
            }}
            className="rounded-[7px] border border-line-strong px-3 py-2 text-[13px] font-semibold text-foreground hover:bg-raised disabled:opacity-60"
          >
            {loading ? 'Liczę…' : 'Odśwież'}
          </button>
          <Link
            href={`/dashboard/services/${serviceId}/autoscaling`}
            className="rounded-[7px] border border-line-strong px-3 py-2 text-[13px] font-semibold text-foreground hover:bg-raised"
          >
            Autoskalowanie i limity
          </Link>
        </div>
      </section>

      {forecast?.available ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {KOLEJNOSC.map((k) => forecast.resources.find((r) => r.resource === k))
              .filter((r): r is ServiceForecastResourceDto => !!r)
              .map((r) => (
                <WykresZasobu key={r.resource} r={r} horyzont={h} wygenerowano={Date.parse(forecast.generatedAt)} ai={ai} />
              ))}
          </div>

          {forecast.recommendations.length > 0 ? (
            <div data-ai-generated={ai} className="rounded-[10px] border border-line bg-card p-4">
              <p className="mb-2 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                <Lightbulb className="h-3.5 w-3.5" /> Rekomendacje
              </p>
              <ul className="m-0 list-none space-y-1.5 p-0">
                {forecast.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-data-hi" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="m-0 text-[11.5px] text-muted-foreground">
            Prognoza orientacyjna, liczona przez Verris z historycznych metryk — nie stanowi gwarancji.
            {forecast.komentarzAi ? ' Opis i rekomendacje tworzy AI.' : ''}
          </p>
        </>
      ) : null}
    </div>
  );
}

function WykresZasobu({
  r,
  horyzont,
  wygenerowano,
  ai,
}: {
  r: ServiceForecastResourceDto;
  horyzont: number;
  wygenerowano: number;
  ai: 'true' | undefined;
}) {
  const punkty = (r.historia ?? []).map((p) => {
    const t = Date.parse(p.t);
    return { t, v: p.v, label: godzina(t) };
  });
  const teraz = punkty.at(-1)?.t ?? wygenerowano;
  const obecnie = r.currentPct ?? punkty.at(-1)?.v ?? 0;
  const za = r.predictedPct ?? obecnie;
  const prognoza = [
    { t: teraz, v: obecnie, label: 'teraz' },
    { t: teraz + horyzont * DZIEN_MS, v: za, label: `za ${days(horyzont)}` },
  ];
  const najwyzej = Math.max(100, za, ...punkty.map((p) => p.v));
  const opis = uwaga(r);
  return (
    <section className="flex min-w-0 flex-col gap-2.5 rounded-[10px] border border-line bg-card px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 font-display text-[16px] font-bold text-foreground">{NAZWA[r.resource]}</h3>
        <div className="text-[13px] text-muted-foreground">
          teraz <b className="font-mono text-foreground">{Math.round(obecnie)}%</b> · za {days(horyzont)}{' '}
          <b className={`font-mono ${za >= 100 ? 'text-crit' : 'text-foreground'}`}>{Math.round(za)}%</b>
        </div>
      </div>
      <Wykres
        nazwa={`${NAZWA[r.resource]}: ${HISTORIA_DNI} dni historii i prognoza na ${days(horyzont)}, w procentach limitu planu`}
        punkty={punkty}
        prognoza={prognoza}
        limit={100}
        // Prognoza 250% nie spłaszcza historii: oś najwyżej do 150% limitu, wyższe wartości przy krawędzi.
        max={Math.min(150, najwyzej)}
        domena={[teraz - HISTORIA_DNI * DZIEN_MS, teraz + horyzont * DZIEN_MS]}
        format={proc}
        wysokosc={150}
      />
      <div className="flex justify-between text-[11.5px] text-muted-foreground">
        <span>−{HISTORIA_DNI} dni</span>
        <span>dziś</span>
        <span>+{days(horyzont)}</span>
      </div>
      <div className="flex justify-between gap-3 text-[11.5px] text-muted-foreground">
        <span>
          <span className="text-crit" aria-hidden>
            - - -
          </span>{' '}
          limit planu
        </span>
        <span data-ai-generated={r.note ? ai : undefined} className="text-right">
          {opis}
        </span>
      </div>
    </section>
  );
}
