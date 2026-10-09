/**
 * Kafel „Wydajność konta · 24 h” z przeglądu usługi (ServiceOverviewV2).
 *
 * Procent liczymy od mocy PLANU, nie od chwilowego limitu: autoskalowanie podnosi limit
 * na czas skoku ruchu, więc szczyt może przekroczyć 100% (np. 248% CPU przy planie 200% → 124%).
 * Wtedy pod liczbą dopisujemy, skąd się wzięła — bez tego „124% limitu” wyglądało na błąd.
 */

import { Kpi } from '@/components/panel/v2';
import { Wykres } from '@/components/panel/wykres';

export function KafelWydajnosci({
  wartosci,
  etykiety,
  limitPlanu,
  autoskalowanie,
}: {
  /** Szczyt CPU w każdej godzinie (te same jednostki co limit planu). */
  wartosci: number[];
  etykiety: string[];
  /** Moc procesora w planie (np. 200 = dwa rdzenie). */
  limitPlanu: number;
  /** Czy autoskalowanie jest teraz włączone. */
  autoskalowanie: boolean;
}) {
  const szczyt = wartosci.length ? Math.max(...wartosci) : null;
  const procent = szczyt != null ? Math.round((szczyt / limitPlanu) * 100) : null;
  const ponadPlan = procent != null && procent > 100;
  const blisko = procent != null && procent >= 80;

  return (
    <Kpi
      label="Wydajność konta · 24 h"
      value={procent ?? '—'}
      unit={procent != null ? '% planu · szczyt' : undefined}
      foot={
        ponadPlan ? (
          autoskalowanie ? (
            <span>dodatkowa moc w ramach Twojego limitu kosztów</span>
          ) : (
            <span className="text-warn">autoskalowanie wyłączone — przy kolejnym skoku strona może zwolnić</span>
          )
        ) : blisko ? (
          autoskalowanie ? (
            <span className="text-warn">blisko mocy planu — autoskalowanie doda moc, gdy trzeba</span>
          ) : (
            <span className="text-warn">blisko mocy planu — rozważ autoskalowanie</span>
          )
        ) : (
          <span>{wartosci.length ? 'w normie' : 'brak pomiarów z 24 h'}</span>
        )
      }
    >
      {ponadPlan ? (
        <p className="-mt-1 text-[12.5px] text-muted-foreground">ponad plan dzięki autoskalowaniu</p>
      ) : null}
      {wartosci.length ? (
        <div className="mt-3">
          <Wykres
            wariant="slupki"
            punkty={wartosci.map((v, i) => ({ v: (v / limitPlanu) * 100, label: `od ${etykiety[i] ?? ''}` }))}
            limit={100}
            format={(v) => `${Math.round(v)}% mocy planu`}
            nazwa="Wydajność konta w ostatnich 24 godzinach: szczyt CPU w każdej godzinie, w procentach mocy planu"
            wysokosc={44}
          />
        </div>
      ) : null}
    </Kpi>
  );
}
