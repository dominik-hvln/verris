'use client';

import { startTransition, useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { BriefMarki, StanKreatoraMarki, WidokMarki } from '@verris/kreator/klient';
import { cx } from '@/components/panel/cx';
import { KOMUNIKAT_PO_AKTUALIZACJI } from '@/lib/akcja';
import type { PozycjaListyKreatora } from '@/lib/kreator';
import { adresMarki, krokiMarki, krokPoczatkowy, pozostaloZ, type KrokMarki } from '@/lib/kreator-marki';
import { Komunikat, klasaPrzyciskuDrugiego } from '../kreator/wspolne';
import { nowaSeria, stanKreatoraMarki, zapiszProjekt, zmienBrief } from './akcje';
import { Analiza } from './analiza';
import { KrokDopasuj } from './dopasuj';
import { Eksport } from './eksport';
import { FormularzBriefu } from './formularz-briefu';
import { Materialy } from './materialy';
import { NaglowekMarki } from './naglowek-skupienia';
import { Propozycje } from './propozycje';
import { ZasadyMarki } from './zasady';

/**
 * Paczka 131 – ekran jednej marki: nagłówek (nazwa, wersja i limity, ostrzeżenie prawne), kroki zależne od źródła
 * marki (krokiMarki) i treść kroku. Krok trafia do adresu (`?krok=`) bez przeładowania – odświeżenie strony i link
 * wracają do tego samego miejsca. Akcje zwracają WidokMarki – ekran podmienia go w całości.
 *
 * Paczka 134: liczniki (serie, zmiany AI) to osobny stan konta – po każdej operacji AI (`onStan`) pobieramy go od nowa
 * (akcja serwera, fetch `no-store`) i czekamy na wynik, zanim przycisk przestanie „trwać”; starsza odpowiedź nie
 * nadpisze nowszej. `router.refresh()` czyści pamięć tras Next – lista marek (karta wersji) po powrocie nie pokaże
 * starych liczników.
 */
export function EkranMarki({
  widok: widokPoczatkowy,
  stan: stanPoczatkowy,
  krok: krokZAdresu,
  strony,
  paynowDostepny,
  bladSerii = false,
}: {
  widok: WidokMarki;
  stan: StanKreatoraMarki;
  krok: string | null;
  strony: PozycjaListyKreatora[] | null;
  paynowDostepny: boolean;
  bladSerii?: boolean;
}) {
  const [widok, setWidok] = useState(widokPoczatkowy);
  const [stan, setStan] = useState(stanPoczatkowy);
  const [krok, setKrok] = useState<KrokMarki>(() => krokPoczatkowy(widokPoczatkowy, krokZAdresu));
  const [bladBriefu, setBladBriefu] = useState<string | null>(bladSerii ? 'Brief zapisany, ale nie udało się przygotować propozycji. Spróbuj ponownie za chwilę.' : null);
  const refy = useRef<(HTMLButtonElement | null)[]>([]);
  const numerStanu = useRef(0);
  const router = useRouter();
  const kroki = krokiMarki(widok);
  const marka = widok.marka;
  const zSeria = pozostaloZ(stan.limity.serie) > 0;

  const przejdz = (k: KrokMarki) => {
    setKrok(k);
    try {
      window.history.replaceState(null, '', adresMarki(widok.id, k));
    } catch {
      /* środowisko bez historii (testy) */
    }
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo({ top: 0 });
  };
  const odswiezStan = useCallback(async () => {
    const nr = ++numerStanu.current;
    try {
      const w = await stanKreatoraMarki();
      if (w.ok && nr === numerStanu.current) setStan(w.dane);
    } catch {
      /* liczniki zostają – operacja i tak się udała albo ma własny komunikat */
    }
    startTransition(() => router.refresh());
  }, [router]);

  const klawisz = (e: KeyboardEvent, i: number) => {
    const dostepne = kroki.map((k, j) => (k.dostepny ? j : -1)).filter((j) => j >= 0);
    const krokZ = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!krokZ) return;
    e.preventDefault();
    const poz = dostepne.indexOf(i);
    const nast = dostepne[(poz + krokZ + dostepne.length) % dostepne.length];
    if (nast === undefined) return;
    refy.current[nast]?.focus();
  };

  const wyslijBrief = async (brief: BriefMarki, zSeria: boolean) => {
    try {
      const w = await zmienBrief(widok.id, brief);
      if (!w.ok) return { blad: w.blad, bledy: w.bledy, kod: w.kod };
      setWidok(w.dane);
      setBladBriefu(null);
      if (!zSeria) return null;
      const s = await nowaSeria(widok.id);
      await odswiezStan();
      if (!s.ok) return { blad: s.blad };
      setWidok(s.dane);
      przejdz('propozycje');
      return null;
    } catch {
      return { blad: KOMUNIKAT_PO_AKTUALIZACJI };
    }
  };

  const nawigacja = (
    <nav aria-label="Etapy marki" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol className="m-0 flex list-none gap-1.5 p-0">
        {kroki.map((k, i) => (
          <li key={k.id} className="flex-none">
            <button
              ref={(el) => {
                refy.current[i] = el;
              }}
              type="button"
              disabled={!k.dostepny}
              aria-current={krok === k.id ? 'step' : undefined}
              onClick={() => przejdz(k.id)}
              onKeyDown={(e) => klawisz(e, i)}
              className={cx(
                'rounded-full border px-3 py-1.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-45 max-md:min-h-11',
                krok === k.id ? 'border-data bg-data-soft font-semibold text-foreground' : 'border-line text-foreground hover:border-line-strong',
              )}
            >
              <span className="font-mono text-[11.5px] text-muted-foreground">{i + 1}.</span> {k.nazwa}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );

  return (
    <div>
      <NaglowekMarki tytul={`Marka „${widok.brief.nazwa}”`} stan={stan} kroki={nawigacja} />
      {krok === 'brief' ? (
        <div className="flex flex-col gap-3">
          {bladBriefu ? <Komunikat rodzaj="ostrzezenie">{bladBriefu}</Komunikat> : null}
          <FormularzBriefu
            key={widok.wersja}
            poczatkowy={widok.brief}
            przycisk={zSeria ? (widok.serie.length ? 'Zapisz brief i pokaż nową serię' : 'Pokaż 6 propozycji') : 'Zapisz brief'}
            opisPrzycisku={
              zSeria
                ? 'Nowa seria zużywa 1 z limitu serii. Wcześniejsze serie zostają do wyboru.'
                : 'Wykorzystano limit serii propozycji – zapiszesz brief bez nowej serii. Nowe serie będą możliwe po odnowieniu limitu albo z Pakietem marki.'
            }
            onWyslij={(b) => wyslijBrief(b, zSeria)}
            dodatkoweAkcje={
              widok.serie.length ? (
                <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => przejdz('propozycje')}>
                  Wróć do propozycji
                </button>
              ) : null
            }
          />
        </div>
      ) : null}
      {krok === 'analiza' ? <Analiza widok={widok} stan={stan} onWidok={setWidok} onKrok={przejdz} onStan={odswiezStan} /> : null}
      {krok === 'propozycje' ? <Propozycje widok={widok} stan={stan} onWidok={setWidok} onKrok={przejdz} onStan={odswiezStan} /> : null}
      {krok === 'dopasuj' && marka ? (
        <KrokDopasuj
          marka={marka}
          onZapisz={async (p) => {
            try {
              const w = await zapiszProjekt(widok.id, p);
              if (!w.ok) return { blad: w.blad };
              setWidok(w.dane);
              return null;
            } catch {
              return { blad: KOMUNIKAT_PO_AKTUALIZACJI };
            }
          }}
        />
      ) : null}
      {krok === 'zasady' && marka ? <ZasadyMarki widok={widok} marka={marka} /> : null}
      {krok === 'materialy' && marka ? <Materialy widok={widok} marka={marka} stan={stan} onWidok={setWidok} onStan={odswiezStan} onKrok={przejdz} /> : null}
      {krok === 'eksport' && marka ? (
        <Eksport widok={widok} marka={marka} stan={stan} strony={strony} paynowDostepny={paynowDostepny} onWidok={setWidok} onKrok={przejdz} />
      ) : null}
    </div>
  );
}
