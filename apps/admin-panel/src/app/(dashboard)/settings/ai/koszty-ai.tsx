import { BarChart3 } from 'lucide-react';
import type { KosztyAi } from './actions';

const usd = (v: number) => `$${v < 1 ? v.toFixed(4) : v.toFixed(2)}`;
const liczba = (v: number) => v.toLocaleString('pl-PL');
const FUNKCJE: Record<string, string> = {
  chatbot_client: 'Czat klienta',
  chatbot_staff: 'Czat obsługi',
  service_forecast: 'Prognoza zasobów',
  support_suggestion: 'Szkic odpowiedzi BOK',
};

export function KosztyAiPanel({ koszty }: { koszty: KosztyAi | null }) {
  return (
    <section className="space-y-5 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-3xl">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
        <BarChart3 className="h-4 w-4" aria-hidden /> Koszty
      </h2>
      {!koszty ? (
        <p className="text-sm text-neutral-400">Nie udało się pobrać kosztów. Odśwież stronę za chwilę.</p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs text-neutral-400">Bieżący miesiąc</dt>
              <dd className="text-xl font-bold text-white">{usd(koszty.miesiacUsd)}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs text-neutral-400">Prognoza na koniec miesiąca (przy obecnym tempie)</dt>
              <dd className="text-xl font-bold text-white">{usd(koszty.prognozaMiesiacaUsd)}</dd>
            </div>
          </dl>

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-300">Ostatnie 30 dni</h3>
            {koszty.ostatnie30Dni.length === 0 ? (
              <p className="text-sm text-neutral-400">Brak wywołań AI w tym okresie.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-400">
                      <th className="py-1 font-medium">Funkcja</th>
                      <th className="py-1 font-medium">Poziom</th>
                      <th className="py-1 font-medium">Model</th>
                      <th className="py-1 font-medium text-right">Wywołania</th>
                      <th className="py-1 font-medium text-right">Tokeny wej./wyj.</th>
                      <th className="py-1 font-medium text-right">Koszt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {koszty.ostatnie30Dni.map((w) => (
                      <tr key={`${w.funkcja}-${w.model}`} className="border-t border-white/5 text-neutral-200">
                        <td className="py-1.5 pr-3">{FUNKCJE[w.funkcja] ?? w.funkcja}</td>
                        <td className="py-1.5 pr-3">{w.poziom === 'szybki' ? 'Szybki' : 'Analiza'}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs">{w.model}</td>
                        <td className="py-1.5 pr-3 text-right">{liczba(w.wywolania)}</td>
                        <td className="py-1.5 pr-3 text-right">{liczba(w.tokenyWej)} / {liczba(w.tokenyWyj)}</td>
                        <td className="py-1.5 text-right text-white">{usd(w.kosztUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-300">
              Klienci z największym zużyciem w tym miesiącu
            </h3>
            {koszty.klienci.length === 0 ? (
              <p className="text-sm text-neutral-400">Nikt jeszcze nie korzystał z asystenta w tym miesiącu.</p>
            ) : (
              <ul className="divide-y divide-white/5 text-sm">
                {koszty.klienci.map((k) => {
                  const pelny = koszty.limitKlientaUsd > 0 && k.kosztUsd >= koszty.limitKlientaUsd;
                  return (
                    <li key={k.userId} className="flex items-center justify-between gap-3 py-1.5">
                      <a href={`/customers/${k.userId}`} className="truncate text-neutral-200 hover:text-emerald-300">
                        {k.email}
                      </a>
                      <span className="shrink-0 text-neutral-400">
                        {liczba(k.wywolania)} wyw. · <span className="text-white">{usd(k.kosztUsd)}</span>
                        {koszty.limitKlientaUsd > 0 ? <> / {usd(koszty.limitKlientaUsd)}</> : null}
                        {pelny ? <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-300">limit wyczerpany</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
