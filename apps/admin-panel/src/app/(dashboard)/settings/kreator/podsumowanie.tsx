import { BarChart3, TriangleAlert } from 'lucide-react';
import { NieWczytano } from '@/components/nie-wczytano';
import { plForm } from '@/lib/pl';
import type { PodsumowanieKreatora } from './actions';

const SEKCJA = 'space-y-5 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-3xl';
const NAGLOWEK = 'flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400';
const usd = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v) < 1 ? Math.abs(v).toFixed(4) : Math.abs(v).toFixed(2)}`;
const liczba = (v: number) => v.toLocaleString('pl-PL');
const zl = (v: number) => `${v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
const nazwaMiesiaca = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dzienMiesiac = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const data = (iso: string) =>
  new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });

function Kafel({ etykieta, wartosc, opis }: { etykieta: string; wartosc: string; opis?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <dt className="text-xs text-neutral-400">{etykieta}</dt>
      <dd className="text-xl font-bold text-white">{wartosc}</dd>
      {opis ? <dd className="text-[11px] text-neutral-400">{opis}</dd> : null}
    </div>
  );
}

/**
 * Koszt AI kreatora dziennie z 30 dni (UTC): słupki w SVG, kolor z tokenu wykresów (`--data`, jak components/wykres.tsx),
 * dymek przeglądarki (<title>) z liczbą generacji i zmian. Bez JS – działa w komponencie serwerowym.
 */
export function WykresDni({ dni }: { dni: PodsumowanieKreatora['dni'] }) {
  const W = 300;
  const H = 64;
  const max = Math.max(...dni.map((d) => d.kosztUsd), 0);
  const szer = W / Math.max(1, dni.length);
  const razem = dni.reduce((s, d) => s + d.kosztUsd, 0);
  const wywolania = dni.reduce((s, d) => s + d.wywolania, 0);
  if (!dni.length || wywolania === 0) return <p className="text-sm text-neutral-400">Brak wywołań AI kreatora w ostatnich 30 dniach.</p>;
  return (
    <figure className="space-y-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-20 w-full"
        role="img"
        aria-label={`Koszt AI kreatora w ostatnich 30 dniach: razem ${usd(razem)}, ${liczba(wywolania)} ${plForm(wywolania, 'wywołanie', 'wywołania', 'wywołań')}`}
      >
        <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="currentColor" strokeOpacity="0.15" />
        {dni.map((d, i) => {
          const h = max > 0 ? Math.max(d.kosztUsd > 0 ? 1.5 : 0, (d.kosztUsd / max) * (H - 4)) : 0;
          return (
            <rect key={d.dzien} data-dzien={d.dzien} x={i * szer + 0.75} y={H - h} width={Math.max(0.5, szer - 1.5)} height={h} rx="1" fill="var(--data)">
              <title>{`${dzienMiesiac(d.dzien)}: ${usd(d.kosztUsd)} · ${liczba(d.generacje)} ${plForm(d.generacje, 'wywołanie generacji', 'wywołania generacji', 'wywołań generacji')}, ${liczba(d.zmiany)} ${plForm(d.zmiany, 'zmiana AI', 'zmiany AI', 'zmian AI')}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="flex justify-between text-[11px] text-neutral-400">
        <span>{dzienMiesiac(dni[0]!.dzien)}</span>
        <span>najwyżej {usd(max)} dziennie · razem {usd(razem)}</span>
        <span>{dzienMiesiac(dni[dni.length - 1]!.dzien)}</span>
      </figcaption>
    </figure>
  );
}

/** Admin → Kreator stron: zużycie i koszty miesiąca (GET /admin/kreator/podsumowanie) i ostatnie błędy generacji. */
export function PodsumowanieKreatoraPanel({ dane }: { dane: PodsumowanieKreatora | null }) {
  if (!dane) {
    return (
      <section data-sekcja="zuzycie" className={SEKCJA}>
        <h2 className={NAGLOWEK}>
          <BarChart3 className="h-4 w-4" aria-hidden /> Zużycie i koszty
        </h2>
        <NieWczytano co="podsumowania kreatora" />
      </section>
    );
  }
  const k = dane.koszt;
  return (
    <>
      <section data-sekcja="zuzycie" className={SEKCJA}>
        <h2 className={NAGLOWEK}>
          <BarChart3 className="h-4 w-4" aria-hidden /> Zużycie i koszty – {nazwaMiesiaca(dane.miesiac)}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Kafel
            etykieta="Konta z kreatorem"
            wartosc={liczba(dane.konta.zeStronami)}
            opis={`${liczba(dane.konta.aktywneWMiesiacu)} ${plForm(dane.konta.aktywneWMiesiacu, 'aktywne', 'aktywne', 'aktywnych')} w tym miesiącu`}
          />
          <Kafel
            etykieta="Strony"
            wartosc={liczba(dane.strony.razem)}
            opis={`${liczba(dane.strony.opublikowane)} ${plForm(dane.strony.opublikowane, 'opublikowana', 'opublikowane', 'opublikowanych')}${dane.strony.generowane ? ` · ${liczba(dane.strony.generowane)} w generowaniu` : ''}`}
          />
          <Kafel etykieta="Generacje / zmiany AI" wartosc={`${liczba(dane.generacje)} / ${liczba(dane.zmiany)}`} opis="z liczników limitów kont" />
          <Kafel etykieta="Koszt AI" wartosc={usd(k.razemUsd)} opis={`${liczba(k.wywolania)} ${plForm(k.wywolania, 'wywołanie', 'wywołania', 'wywołań')} modelu`} />
          <Kafel
            etykieta="Oszczędność dzięki cache"
            wartosc={usd(k.oszczednoscUsd)}
            opis={k.bezCacheUsd > 0 ? `bez cache tokeny promptu kosztowałyby ${usd(k.bezCacheUsd)}` : 'brak tokenów w cache'}
          />
          <Kafel
            etykieta="Kreator Pro"
            wartosc={`${liczba(dane.pro.aktywne)} ${plForm(dane.pro.aktywne, 'abonament', 'abonamenty', 'abonamentów')}`}
            opis={`${zl(dane.pro.miesiecznieNetto)} netto / ${zl(dane.pro.miesiecznieBrutto)} brutto miesięcznie`}
          />
        </dl>

        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-300">Koszt AI w tym miesiącu</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-rozbicie-kosztu>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-400">
                  <th className="py-1 font-medium">Pozycja</th>
                  <th className="py-1 font-medium text-right">Tokeny</th>
                  <th className="py-1 font-medium text-right">Koszt</th>
                </tr>
              </thead>
              <tbody className="text-neutral-200">
                <tr className="border-t border-white/5">
                  <td className="py-1.5 pr-3">Zwykłe tokeny wejścia</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{liczba(k.tokeny.wej)}</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(k.wejscieUsd)}</td>
                </tr>
                <tr className="border-t border-white/5">
                  <td className="py-1.5 pr-3">Tokeny wyjścia</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{liczba(k.tokeny.wyj)}</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(k.wyjscieUsd)}</td>
                </tr>
                <tr className="border-t border-white/5">
                  <td className="py-1.5 pr-3">Zapis do cache (1 h i 5 min)</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{liczba(k.tokeny.zapis1h + k.tokeny.zapis5m)}</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(k.cacheZapisUsd)}</td>
                </tr>
                <tr className="border-t border-white/5">
                  <td className="py-1.5 pr-3">Odczyt z cache</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{liczba(k.tokeny.odczyt)}</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(k.cacheOdczytUsd)}</td>
                </tr>
                <tr className="border-t border-white/10 font-semibold text-white">
                  <td className="py-1.5 pr-3">Razem</td>
                  <td />
                  <td className="py-1.5 text-right tabular-nums">{usd(k.razemUsd)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-neutral-400">
            Rozbicie wg bieżącego cennika z Konfiguracji asystenta; koszt zapisany przy wywołaniach: {usd(k.zapisanyUsd)}. Miesiąc w UTC.
            {dane.pro.aktywne ? ` Kreator Pro: ${liczba(dane.pro.miesieczne)} mies., ${liczba(dane.pro.roczne)} ${plForm(dane.pro.roczne, 'roczny', 'roczne', 'rocznych')} (rok liczony jako 1/12), bez kont zespołu.` : ''}
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-300">Koszt AI dziennie – 30 dni</h3>
          <WykresDni dni={dane.dni} />
        </div>
      </section>

      <section data-sekcja="bledy" className={SEKCJA}>
        <h2 className={NAGLOWEK}>
          <TriangleAlert className="h-4 w-4" aria-hidden /> Ostatnie błędy generacji
        </h2>
        {dane.bledy.length === 0 ? (
          <p className="text-sm text-neutral-400">Brak stron z błędem generacji.</p>
        ) : (
          <>
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10" aria-label="Ostatnie błędy generacji">
              {dane.bledy.map((b) => (
                <li key={b.id} data-blad={b.id} className="space-y-0.5 px-3 py-2 text-sm">
                  <p className="flex flex-wrap gap-x-3 text-xs text-neutral-400">
                    <span className="tabular-nums">{data(b.at)}</span>
                    <span className="[overflow-wrap:anywhere] text-neutral-200">{b.email}</span>
                  </p>
                  <p className="text-neutral-300">{b.opis}</p>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-neutral-400">
              Bez treści stron klientów – tylko komunikat, który klient widzi w panelu. Szczegóły dostawcy AI są w logach API.
            </p>
          </>
        )}
      </section>
    </>
  );
}
