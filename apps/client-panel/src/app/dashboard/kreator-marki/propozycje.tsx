'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { ProjektLogo, SeriaMarki, StanKreatoraMarki, WidokMarki } from '@verris/kreator/klient';
import { Select } from '@/components/panel/select';
import { cx } from '@/components/panel/cx';
import { KOMUNIKAT_PO_AKTUALIZACJI } from '@/lib/akcja';
import {
  ETYKIETY_CECH,
  ETYKIETY_ODSWIEZENIA,
  nazwaBarwy,
  nazwaKierunku,
  opisPozostalo,
  ostatniaSeria,
  oznaczenieZnaku,
  pozostaloZ,
  seriaDodana,
  serieChronologicznie,
  type KrokMarki,
} from '@/lib/kreator-marki';
import { Komunikat, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego } from '../kreator/wspolne';
import { kierunkiOdswiezenia, nowaSeria, wybierzKierunek } from './akcje';
import { ListaOceny, PanelDopasuj, useOcena } from './dopasuj';
import { LogoNaZywo } from './logo';

type Kierunek = SeriaMarki['kierunki'][number];

/** Komunikat 409 PODOBNY_ZNAK – co zrobić dalej (API podaje własny opis, dokładamy wskazówkę). */
export const RADA_PODOBNY_ZNAK =
  'Zmień parametry znaku w „Dopasuj” (np. liczbę elementów albo grubość) albo wybierz inną propozycję – kolor i krój nie wystarczą.';

export function KartaKierunku({
  k,
  nazwa,
  podpis,
  wybrany,
  onWybierz,
  zapas = false,
}: {
  k: Kierunek;
  nazwa: string;
  podpis?: string;
  wybrany: boolean;
  onWybierz: () => void;
  /** Seria zapasowa (AI niedostępne) – karta oznaczona „Propozycja zastępcza”. */
  zapas?: boolean;
}) {
  const oznaczenie = oznaczenieZnaku(k, zapas);
  const zastepcza = zapas || k.zrodloZnaku === 'zamiennik';
  const o = k.odswiezenie;
  return (
    <li className="flex">
      <button
        type="button"
        aria-pressed={wybrany}
        onClick={onWybierz}
        className={cx(
          'flex w-full flex-col overflow-hidden rounded-[10px] border bg-card text-left transition-colors',
          wybrany ? 'border-data ring-2 ring-data/40' : 'border-line hover:border-line-strong',
        )}
      >
        <span className="flex h-36 w-full items-center justify-center bg-[#ffffff] p-5">
          <LogoNaZywo projekt={k.projekt} nazwa={nazwa} podpis={podpis} className="h-full w-full" />
        </span>
        <span className="flex flex-1 flex-col gap-1.5 p-3">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-display text-[14.5px] font-bold text-foreground">{o ? ETYKIETY_ODSWIEZENIA[o.typ] : nazwaKierunku(k)}</span>
            <span className="break-words text-[11.5px] text-muted-foreground">{k.projekt.napis.font}</span>
          </span>
          {k.koncepcja ? (
            <span className="text-[12.5px] leading-snug text-foreground">
              <b>Znak:</b> {k.koncepcja}
            </span>
          ) : null}
          {o ? (
            <span className="flex flex-col gap-1 text-[12px] leading-snug text-foreground">
              <span className="text-[11.5px] text-muted-foreground">Rozpoznawalność: {o.rozpoznawalnosc}</span>
              <span>
                <b>Zostaje:</b> {o.coZostaje}
              </span>
              <span>
                <b>Zmienia się:</b> {o.coSieZmienia}
              </span>
            </span>
          ) : k.dlaczego ? (
            <span className="text-[12.5px] leading-snug text-muted-foreground">{k.dlaczego}</span>
          ) : null}
          {oznaczenie ? (
            <span
              className={cx(
                'mt-auto w-fit rounded-full border px-2 py-0.5 text-[11px]',
                zastepcza ? 'border-line-strong text-foreground' : k.zrodloZnaku === 'ai' ? 'border-warn/50 text-warn' : 'border-line text-muted-foreground',
              )}
            >
              {oznaczenie}
            </span>
          ) : null}
          {k.ostrzezenia.length ? (
            <span className="flex gap-1 text-[11.5px] text-muted-foreground">
              <AlertTriangle className="mt-px h-3.5 w-3.5 flex-none text-warn" aria-hidden />
              <span>
                <span className="sr-only">Uwagi: </span>
                {k.ostrzezenia.join(' ')}
              </span>
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/** Panel „Dopasuj” jest pod listą (jedna kolumna < 1280 px) – po wyborze karty przewijamy do niego i przenosimy fokus. */
export function przewinDoDopasuj(panel: HTMLElement | null, okno: Pick<Window, 'matchMedia'> | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  if (!panel || !okno?.matchMedia?.('(max-width: 1279px)').matches) return false;
  const tylkoRuch = okno.matchMedia('(prefers-reduced-motion: reduce)').matches;
  panel.scrollIntoView?.({ behavior: tylkoRuch ? 'auto' : 'smooth', block: 'start' });
  panel.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  return true;
}

/** Co uwzględniono w serii (cechy i barwy z briefu) – linia pod tytułem jak w makiecie. */
export function opisDopasowania(w: Pick<WidokMarki, 'brief'>): string {
  const b = w.brief;
  const czesci: string[] = [];
  if (b.cechy.length) czesci.push(b.cechy.map((c) => ETYKIETY_CECH[c].toLocaleLowerCase('pl-PL')).join(', '));
  if (b.barwyLubiane.length) czesci.push(`lubiane: ${b.barwyLubiane.map(nazwaBarwy).join(', ')}`);
  if (b.barwyOdrzucone.length) czesci.push(`bez: ${b.barwyOdrzucone.map(nazwaBarwy).join(', ')}`);
  return czesci.length ? `Dobrane do: ${czesci.join(' · ')}` : '';
}

export function Propozycje({
  widok,
  stan,
  onWidok,
  onKrok,
  onStan,
}: {
  widok: WidokMarki;
  stan: StanKreatoraMarki;
  onWidok: (w: WidokMarki) => void;
  onKrok: (k: KrokMarki) => void;
  onStan: () => Promise<void> | void;
}) {
  const id = useId();
  const panelDopasuj = useRef<HTMLElement | null>(null);
  const odswiezenie = widok.zrodlo === 'odswiezenie';
  // API oddaje serie od najnowszej – wszędzie (numer, lista, „ostatnia”) liczymy po dacie utworzenia.
  const serie = serieChronologicznie(widok.serie);
  const [seriaId, setSeriaId] = useState(ostatniaSeria(widok.serie)?.id ?? '');
  const seria = serie.find((s) => s.id === seriaId) ?? serie[serie.length - 1] ?? null;
  const [wybranyId, setWybranyId] = useState<string | null>(seria?.kierunki[0]?.id ?? null);
  const wybrany: Kierunek | null = seria?.kierunki.find((k) => k.id === wybranyId) ?? null;
  const [edycje, setEdycje] = useState<Record<string, ProjektLogo>>({});
  const projekt = wybrany ? (edycje[`${seria!.id}/${wybrany.id}`] ?? wybrany.projekt) : null;
  const [trwa, setTrwa] = useState<'seria' | 'wybor' | null>(null);
  const [blad, setBlad] = useState<{ tekst: string; rada?: string } | null>(null);
  /** Wynik „Nowa seria” – przy przycisku (503 = AI chwilowo niedostępne: nic nie dodano, limit bez zmian). */
  const [bladSerii, setBladSerii] = useState<{ tekst: string; niedostepne: boolean } | null>(null);
  const wToku = useRef(false);
  const naglowekSerii = useRef<HTMLHeadingElement | null>(null);
  const [przewin, setPrzewin] = useState(0);
  const nazwa = widok.brief.nazwa;
  const podpis = widok.brief.podpis;
  const ocena = useOcena(projekt ?? (seria?.kierunki[0]?.projekt as ProjektLogo), nazwa);
  const zostalo = pozostaloZ(stan.limity.serie);

  // Nowa seria: nagłówek serii na ekran i fokus (czytnik ekranu słyszy „… · seria N”).
  useEffect(() => {
    if (!przewin) return;
    const h = naglowekSerii.current;
    const tylkoRuch = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    h?.scrollIntoView?.({ behavior: tylkoRuch ? 'auto' : 'smooth', block: 'start' });
    h?.focus({ preventScroll: true });
  }, [przewin]);

  const nowa = async () => {
    if (wToku.current) return; // podwójne kliknięcie zanim przycisk się wyłączy
    wToku.current = true;
    setBlad(null);
    setBladSerii(null);
    setTrwa('seria');
    try {
      const przed = widok.serie;
      const w = odswiezenie ? await kierunkiOdswiezenia(widok.id) : await nowaSeria(widok.id);
      if (w.ok) {
        onWidok(w.dane);
        const dodana = seriaDodana(przed, w.dane.serie);
        if (dodana) {
          setSeriaId(dodana.id);
          setWybranyId(dodana.kierunki[0]?.id ?? null);
          setPrzewin((n) => n + 1);
        }
      } else {
        setBladSerii({ tekst: w.blad, niedostepne: w.status === 503 });
      }
      // Liczniki od nowa po każdej próbie (także 402/503) – przycisk „trwa”, dopóki ich nie ma.
      await onStan();
    } catch {
      setBladSerii({ tekst: KOMUNIKAT_PO_AKTUALIZACJI, niedostepne: false });
    } finally {
      wToku.current = false;
      setTrwa(null);
    }
  };

  const komunikatSerii = bladSerii ? (
    <Komunikat rodzaj={bladSerii.niedostepne ? 'ostrzezenie' : 'blad'} tytul={bladSerii.niedostepne ? 'Nie udało się teraz przygotować nowej serii' : bladSerii.tekst}>
      {bladSerii.niedostepne ? `${bladSerii.tekst} Limit serii się nie zmienił.` : null}
    </Komunikat>
  ) : null;

  const wybierz = async () => {
    if (!seria || !wybrany || !projekt) return;
    setBlad(null);
    setTrwa('wybor');
    try {
      const edytowany = edycje[`${seria.id}/${wybrany.id}`];
      const w = await wybierzKierunek(widok.id, { seriaId: seria.id, kierunekId: wybrany.id, ...(edytowany ? { projekt: edytowany } : {}) });
      if (!w.ok) {
        setBlad(w.status === 409 && w.kod === 'PODOBNY_ZNAK' ? { tekst: w.blad, rada: RADA_PODOBNY_ZNAK } : { tekst: w.blad });
        return;
      }
      onWidok(w.dane);
      onKrok('dopasuj');
    } catch {
      setBlad({ tekst: KOMUNIKAT_PO_AKTUALIZACJI });
    } finally {
      setTrwa(null);
    }
  };

  if (!seria) {
    return (
      <Komunikat rodzaj="info" tytul="Brak propozycji">
        <div className="flex flex-col items-start gap-2">
          <span>{odswiezenie ? 'Pokażemy 3 kierunki odświeżenia Twojego logo.' : 'Asystent ułoży 6 kierunków z Twojego briefu.'}</span>
          <button type="button" className={klasaPrzyciskuGlownego} disabled={trwa !== null || zostalo <= 0} aria-busy={trwa === 'seria'} onClick={() => void nowa()}>
            {trwa === 'seria' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {trwa === 'seria' ? 'Asystent układa propozycje…' : odswiezenie ? 'Pokaż 3 kierunki' : 'Pokaż 6 propozycji'}
          </button>
          {komunikatSerii}
        </div>
      </Komunikat>
    );
  }

  const numer = serie.indexOf(seria) + 1;
  const zapas = seria.zrodlo === 'zapas';
  const dopasowanie = opisDopasowania(widok);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 ref={naglowekSerii} tabIndex={-1} className="m-0 scroll-mt-4 break-words font-display text-[20px] font-bold text-foreground outline-none">
              {odswiezenie ? 'Trzy kierunki odświeżenia' : `${seria.kierunki.length} propozycji dla „${nazwa}”`} · seria {numer}
            </h2>
            {odswiezenie ? (
              <p className="text-[12.5px] text-muted-foreground">Im dalej od obecnego logo, tym więcej pracy, żeby stali klienci rozpoznali firmę. Każdy kierunek dopracujesz tak samo jak nową markę.</p>
            ) : dopasowanie ? (
              <p className="text-[12.5px] text-muted-foreground">{dopasowanie}</p>
            ) : null}
          </div>
          {serie.length > 1 ? (
            <div className="flex flex-none items-center gap-2">
              <label htmlFor={`${id}-seria`} className="text-[12.5px] text-muted-foreground">
                Seria
              </label>
              <Select
                id={`${id}-seria`}
                className="w-40"
                value={seria.id}
                options={serie.map((s, i) => ({ value: s.id, label: `Seria ${i + 1}${s.rodzaj === 'odswiezenie' ? ' (odświeżenie)' : ''}${s.zrodlo === 'zapas' ? ' (zastępcza)' : ''}` }))}
                onChange={(v) => {
                  setSeriaId(v);
                  setWybranyId(serie.find((s) => s.id === v)?.kierunki[0]?.id ?? null);
                }}
              />
            </div>
          ) : null}
        </div>
        {zapas ? (
          <Komunikat rodzaj="ostrzezenie" tytul="Propozycje zastępcze – nie z asystenta AI">
            {seria.komunikat || 'Asystent AI był chwilowo niedostępny, dlatego pokazujemy propozycje z biblioteki Verris. Ta seria nie zużyła limitu – nową serię od AI możesz poprosić za chwilę.'}
          </Komunikat>
        ) : null}
        {seria.strategia && (seria.strategia.grupa || seria.strategia.cecha || seria.strategia.skojarzenie) ? (
          <p className="rounded-[8px] border border-line bg-raised px-3 py-2 text-[12.5px] text-foreground">
            <b>Strategia:</b> {[seria.strategia.grupa, seria.strategia.cecha, seria.strategia.skojarzenie].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        <ul key={seria.id} aria-label={`Propozycje – seria ${numer}`} className={cx('m-0 grid list-none gap-3 p-0 sm:grid-cols-2', odswiezenie ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
          {odswiezenie && widok.analiza?.oryginal?.startsWith('data:image/') ? (
            <li className="flex flex-col overflow-hidden rounded-[10px] border border-line bg-card">
              <span className="flex h-36 items-center justify-center bg-[#ffffff] p-5">
                {/* eslint-disable-next-line @next/next/no-img-element -- oryginał z analizy (data URI PNG z API) */}
                <img src={widok.analiza.oryginal} alt="Obecne logo" className="max-h-full w-auto max-w-full" />
              </span>
              <span className="p-3 text-[12.5px] text-muted-foreground">
                <b className="block font-mono text-[11px] uppercase tracking-[0.08em] text-foreground">Obecne logo</b>
                {widok.analiza.elementy.length ? `Klienci kojarzą: ${widok.analiza.elementy.join(', ')}.` : null}
              </span>
            </li>
          ) : null}
          {seria.kierunki.map((k) => (
            <KartaKierunku key={k.id} k={k} nazwa={nazwa} podpis={podpis} zapas={zapas} wybrany={k.id === wybranyId} onWybierz={() => {
                setWybranyId(k.id);
                // po renderze panelu z nowym kierunkiem
                setTimeout(() => przewinDoDopasuj(panelDopasuj.current), 0);
              }}
            />
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={klasaPrzyciskuDrugiego} disabled={trwa !== null || zostalo <= 0} aria-busy={trwa === 'seria'} onClick={() => void nowa()}>
            {trwa === 'seria' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            {trwa === 'seria' ? 'Układamy nową serię…' : `Nowa seria – ${opisPozostalo(stan.limity.serie, 'serie').toLocaleLowerCase('pl-PL')}`}
          </button>
          {widok.zrodlo === 'nowa' ? (
            <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => onKrok('brief')}>
              Zmień brief
            </button>
          ) : (
            <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => onKrok('analiza')}>
              Wróć do analizy
            </button>
          )}
          {trwa === 'seria' ? (
            <span role="status" className="text-[12.5px] text-muted-foreground">
              Asystent układa nowe kierunki – to trwa do minuty.
            </span>
          ) : null}
        </div>
        {komunikatSerii}
        {odswiezenie ? <p className="text-[12px] text-muted-foreground">Odświeżenie zmienia wygląd, nie prawa: jeśli stary znak jest zarejestrowany, nowy zgłasza się osobno.</p> : null}
      </div>

      <aside ref={panelDopasuj} className="flex scroll-mt-4 flex-col gap-4 rounded-[10px] border border-line bg-card p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto" aria-labelledby={`${id}-dopasuj`}>
        {wybrany && projekt ? (
          <>
            <h2 id={`${id}-dopasuj`} tabIndex={-1} className="m-0 font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Dopasuj: {wybrany.odswiezenie ? ETYKIETY_ODSWIEZENIA[wybrany.odswiezenie.typ] : nazwaKierunku(wybrany)}
            </h2>
            <div className="flex h-28 items-center justify-center rounded-[8px] bg-[#ffffff] p-4">
              <LogoNaZywo projekt={projekt} nazwa={nazwa} podpis={podpis} className="h-full w-full" />
            </div>
            <div className="flex h-24 items-center justify-center rounded-[8px] p-4" style={{ background: projekt.kolory.glowny }}>
              <LogoNaZywo projekt={projekt} nazwa={nazwa} podpis={podpis} wariant="negatyw" tlo={false} className="h-full w-full" />
            </div>
            <PanelDopasuj projekt={projekt} nazwa={nazwa} podpis={podpis} onZmiana={(p) => setEdycje((e) => ({ ...e, [`${seria.id}/${wybrany.id}`]: p }))} />
            <ListaOceny ocena={ocena} />
            {blad ? (
              <Komunikat rodzaj="blad" tytul={blad.tekst}>
                {blad.rada}
              </Komunikat>
            ) : null}
            <button type="button" className={klasaPrzyciskuGlownego} disabled={trwa !== null || ocena.bledy.length > 0} onClick={() => void wybierz()}>
              {trwa === 'wybor' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Wybieram – zbuduj markę
            </button>
            <p className="text-[12px] text-muted-foreground">Zmiana koloru, kroju i układu nie zużywa limitu AI.</p>
          </>
        ) : (
          <p id={`${id}-dopasuj`} className="text-[13px] text-muted-foreground">
            Wybierz propozycję, żeby ją dopasować.
          </p>
        )}
      </aside>
    </div>
  );
}
