'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { CECHY_MARKI, RODZAJE_ZNAKU, type BriefMarki, type CechaMarki, type RodzajZnaku } from '@verris/kreator/klient';
import { cx } from '@/components/panel/cx';
import { bledyBriefu, ETYKIETY_CECH, ETYKIETY_RODZAJU, ODRZUCONY_BRIEF, type PoleBriefu } from '@/lib/kreator-marki';
import { Kafelki, Komunikat, Pole, klasaPola, klasaPrzyciskuGlownego } from '../kreator/wspolne';
import { ListaBarw } from './wybierak-barwy';

/**
 * Paczka 131 – brief „Nowa marka” (i zmiana briefu): nazwa, podpis, branża, jedno zdanie, rodzaj znaku (3 kafle),
 * do 3 cech charakteru (słownik CECHY_MARKI), barwy lubiane i odrzucone, uwagi. Walidacja jak zod BriefMarki w API;
 * błędy API (np. nazwa znanej marki – sprawdzBriefMarki) pokazujemy nad przyciskiem z podpowiedzią z projektu prawnego.
 */
export interface WynikWyslania {
  blad?: string;
  bledy?: string[];
  kod?: string;
}

const PUSTY: BriefMarki = { nazwa: '', branza: '', opis: '', rodzaj: 'znak-i-napis', cechy: [], barwyLubiane: [], barwyOdrzucone: [] };

export function FormularzBriefu({
  poczatkowy,
  onWyslij,
  przycisk,
  opisPrzycisku,
  zablokowany = null,
  dodatkoweAkcje,
}: {
  poczatkowy?: BriefMarki;
  onWyslij: (brief: BriefMarki) => Promise<WynikWyslania | null>;
  przycisk: string;
  opisPrzycisku?: ReactNode;
  /** Powód, dla którego nie można wysłać (limit) – przycisk wyłączony z opisem. */
  zablokowany?: string | null;
  dodatkoweAkcje?: ReactNode;
}) {
  const [b, setB] = useState<BriefMarki>(poczatkowy ?? PUSTY);
  const [pasekLubiane, setPasekLubiane] = useState(200);
  const [pasekOdrzucone, setPasekOdrzucone] = useState(330);
  const [bledyPol, setBledyPol] = useState<Partial<Record<PoleBriefu, string>>>({});
  const [bladApi, setBladApi] = useState<WynikWyslania | null>(null);
  const [wysylanie, setWysylanie] = useState(false);
  const ustaw = <K extends keyof BriefMarki>(k: K, v: BriefMarki[K]) => setB((s) => ({ ...s, [k]: v }));

  const wyslij = async (e: FormEvent) => {
    e.preventDefault();
    if (zablokowany || wysylanie) return;
    const czysty: BriefMarki = {
      ...b,
      nazwa: b.nazwa.trim(),
      branza: b.branza.trim(),
      opis: b.opis.trim(),
      podpis: b.podpis?.trim() || undefined,
      uwagi: b.uwagi?.trim() || undefined,
    };
    const bl = bledyBriefu(czysty);
    setBledyPol(bl);
    if (Object.keys(bl).length) return;
    setBladApi(null);
    setWysylanie(true);
    try {
      const w = await onWyslij(czysty);
      if (w) setBladApi(w);
    } finally {
      setWysylanie(false);
    }
  };

  const przelaczCeche = (c: CechaMarki) =>
    ustaw('cechy', b.cechy.includes(c) ? b.cechy.filter((x) => x !== c) : b.cechy.length >= 3 ? b.cechy : [...b.cechy, c]);

  const znanaMarka = bladApi?.kod === 'ZNANA_MARKA' || /znan|cudz/i.test(`${bladApi?.blad ?? ''} ${(bladApi?.bledy ?? []).join(' ')}`);

  return (
    <form onSubmit={(e) => void wyslij(e)} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-card p-4 sm:p-5">
        <h2 className="m-0 font-display text-[18px] font-bold text-foreground">O firmie</h2>
        <Pole etykieta="Nazwa w logo" podpowiedz="Dokładnie tak, jak ma być widoczna – z wielkimi literami i polskimi znakami." blad={bledyPol.nazwa} licznik={{ ile: b.nazwa.length, max: 60 }}>
          {(a) => <input {...a} className={klasaPola} value={b.nazwa} maxLength={60} autoComplete="organization" onChange={(e) => ustaw('nazwa', e.target.value)} />}
        </Pole>
        <Pole etykieta="Podpis pod nazwą (opcjonalnie)" podpowiedz="Np. „Biuro rachunkowe”. W małych rozmiarach logo podpis znika." blad={bledyPol.podpis}>
          {(a) => <input {...a} className={klasaPola} value={b.podpis ?? ''} maxLength={60} onChange={(e) => ustaw('podpis', e.target.value)} />}
        </Pole>
        <Pole etykieta="Branża" blad={bledyPol.branza}>
          {(a) => <input {...a} className={klasaPola} value={b.branza} maxLength={80} placeholder="np. szkoła żeglarstwa i SUP" onChange={(e) => ustaw('branza', e.target.value)} />}
        </Pole>
        <Pole etykieta="Jednym zdaniem: co robicie i dla kogo?" blad={bledyPol.opis} licznik={{ ile: b.opis.length, max: 240 }}>
          {(a) => <textarea {...a} className={cx(klasaPola, 'min-h-[84px]')} value={b.opis} maxLength={240} onChange={(e) => ustaw('opis', e.target.value)} />}
        </Pole>
        <Kafelki<RodzajZnaku>
          etykieta="Rodzaj znaku"
          wartosc={b.rodzaj}
          kolumny="grid-cols-1 sm:grid-cols-3"
          opcje={RODZAJE_ZNAKU.map((r) => ({ wartosc: r, nazwa: ETYKIETY_RODZAJU[r].nazwa, opis: ETYKIETY_RODZAJU[r].opis }))}
          onZmiana={(r) => ustaw('rodzaj', r)}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-card p-4 sm:p-5">
        <h2 className="m-0 font-display text-[18px] font-bold text-foreground">Charakter marki</h2>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-describedby="brief-cechy-opis">
          <legend className="p-0 text-[13px] font-medium text-foreground">Cechy</legend>
          <p id="brief-cechy-opis" className="text-[12.5px] text-muted-foreground">
            Wybierz do 3 cech. Od nich zależą kształty, kroje i kolory propozycji. Wybrane: {b.cechy.length} z 3.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CECHY_MARKI.map((c) => {
              const wybrana = b.cechy.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={wybrana}
                  disabled={!wybrana && b.cechy.length >= 3}
                  onClick={() => przelaczCeche(c)}
                  className={cx(
                    'rounded-full border px-3 py-1.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 max-md:min-h-11',
                    wybrana ? 'border-data bg-data-soft font-semibold text-foreground' : 'border-line bg-card text-foreground hover:border-line-strong',
                  )}
                >
                  {ETYKIETY_CECH[c]}
                </button>
              );
            })}
          </div>
          {bledyPol.cechy ? <p className="text-[12px] font-medium text-crit">{bledyPol.cechy}</p> : null}
        </fieldset>
        <div className="grid gap-4 xl:grid-cols-2">
          <ListaBarw
            etykieta="Kolory, które lubisz"
            wybrane={b.barwyLubiane}
            zablokowane={b.barwyOdrzucone}
            onZmiana={(v) => ustaw('barwyLubiane', v)}
            barwaPaska={pasekLubiane}
            onBarwaPaska={setPasekLubiane}
          />
          <ListaBarw
            etykieta="Kolory, których nie chcesz"
            wybrane={b.barwyOdrzucone}
            zablokowane={b.barwyLubiane}
            onZmiana={(v) => ustaw('barwyOdrzucone', v)}
            barwaPaska={pasekOdrzucone}
            onBarwaPaska={setPasekOdrzucone}
          />
        </div>
        <Pole etykieta="Uwagi (opcjonalnie)" podpowiedz="Np. „kojarzy nam się łódka”, „bez zielonego”." blad={bledyPol.uwagi} licznik={{ ile: (b.uwagi ?? '').length, max: 300 }}>
          {(a) => <textarea {...a} className={cx(klasaPola, 'min-h-[64px]')} value={b.uwagi ?? ''} maxLength={300} onChange={(e) => ustaw('uwagi', e.target.value)} />}
        </Pole>

        {bladApi ? (
          <Komunikat rodzaj="blad" tytul={bladApi.blad || 'Nie udało się zapisać briefu.'}>
            {bladApi.bledy?.length ? (
              <ul className="m-0 list-disc pl-5">
                {bladApi.bledy.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : null}
            {znanaMarka ? <p className="mt-1">{ODRZUCONY_BRIEF}</p> : null}
          </Komunikat>
        ) : null}

        <div className="flex flex-wrap items-center gap-2.5">
          <button type="submit" disabled={!!zablokowany || wysylanie} className={klasaPrzyciskuGlownego} aria-describedby={zablokowany ? 'brief-blokada' : undefined}>
            {wysylanie ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {wysylanie ? 'Asystent przygotowuje propozycje…' : przycisk}
          </button>
          {dodatkoweAkcje}
        </div>
        {zablokowany ? (
          <p id="brief-blokada" className="text-[12.5px] text-warn">
            {zablokowany}
          </p>
        ) : null}
        {opisPrzycisku ? <p className="text-[12px] text-muted-foreground">{opisPrzycisku}</p> : null}
        <p className="text-[12px] text-muted-foreground">Nie wpisuj nazw cudzych marek jako wzoru („jak logo X”) – asystent ich nie naśladuje.</p>
        {wysylanie ? (
          <p role="status" className="sr-only">
            Asystent przygotowuje propozycje – to trwa do minuty.
          </p>
        ) : null}
      </section>
    </form>
  );
}
