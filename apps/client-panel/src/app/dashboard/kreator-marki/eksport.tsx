'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Check, CheckCircle2, Copy, Download, FileArchive, LayoutTemplate, Loader2, Lock, Mail } from 'lucide-react';
import type { Marka, PlikMarki, StanKreatoraMarki, StopkaEmailWynik, WidokMarki } from '@verris/kreator/klient';
import { Checkbox } from '@/components/panel/checkbox';
import { cx } from '@/components/panel/cx';
import { KOMUNIKAT_PO_AKTUALIZACJI } from '@/lib/akcja';
import type { PozycjaListyKreatora } from '@/lib/kreator';
import {
  adresPliku,
  adresStronyZMarka,
  adresZip,
  grupujPliki,
  INFORMACJA_EKSPORTU,
  liczbaPlikow,
  opisBlokady,
  opisCeny,
  TEKST_ZGODY_TMVIEW,
  type KrokMarki,
} from '@/lib/kreator-marki';
import { Komunikat, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego } from '../kreator/wspolne';
import { stopkaEmail, zapiszZgody } from './akcje';
import { InstrukcjaTmview } from './wspolne-marki';
import { ZakupMarki } from './zakup-marki';

/**
 * Paczka 131 – eksport: pliki marki w grupach z dostępnością wg wersji konta (blokady: Pakiet marki → zakup;
 * TMVIEW_WYMAGANY → instrukcja TMview i potwierdzenie (POST …/zgody); okres próbny → opłać hosting), ZIP, stopka
 * e-mail (podgląd HTML w ramce bez skryptów, kopiowanie, instrukcje dla programów) i „Użyj w Kreatorze stron”.
 */

export interface PodsumowaniePlikow {
  dostepne: number;
  pakiet: boolean;
  tmview: boolean;
  proba: boolean;
}

export function podsumujPliki(pliki: PlikMarki[]): PodsumowaniePlikow {
  return {
    dostepne: pliki.filter((p) => p.dostepny).length,
    pakiet: pliki.some((p) => p.blokada === 'PAKIET_WYMAGANY'),
    tmview: pliki.some((p) => p.blokada === 'TMVIEW_WYMAGANY'),
    proba: pliki.some((p) => p.blokada === 'PROBA'),
  };
}

/** Stan strony z Kreatora stron względem tej marki (lista stron konta + `strony` z widoku marki). */
export function stanStrony(s: Pick<PozycjaListyKreatora, 'id'>, widok: Pick<WidokMarki, 'strony' | 'wersja'>): 'brak' | 'aktualna' | 'starsza' {
  const n = widok.strony.find((x) => x.id === s.id);
  if (!n || n.wersjaNaStronie === null) return 'brak';
  return n.wersjaNaStronie >= widok.wersja ? 'aktualna' : 'starsza';
}

async function kopiuj(tekst: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(tekst);
    return true;
  } catch {
    return false;
  }
}

function StopkaEmail({ markaId }: { markaId: string }) {
  const id = useId();
  const [stopka, setStopka] = useState<StopkaEmailWynik | null>(null);
  const [trwa, setTrwa] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [skopiowano, setSkopiowano] = useState<'html' | 'tekst' | null>(null);
  const przygotuj = async () => {
    setBlad(null);
    setTrwa(true);
    try {
      const w = await stopkaEmail(markaId);
      if (!w.ok) setBlad(w.blad);
      else setStopka(w.dane);
    } catch {
      setBlad(KOMUNIKAT_PO_AKTUALIZACJI);
    } finally {
      setTrwa(false);
    }
  };
  const kopiujCo = async (co: 'html' | 'tekst') => {
    if (!stopka) return;
    if (await kopiuj(co === 'html' ? stopka.html : stopka.tekst)) setSkopiowano(co);
    else setBlad('Nie udało się skopiować – zaznacz tekst ręcznie.');
  };
  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-3 rounded-[10px] border border-line bg-card p-4">
      <h3 id={`${id}-t`} className="m-0 flex items-center gap-2 font-display text-[15px] font-bold text-foreground">
        <Mail className="h-4 w-4 text-data-hi" aria-hidden /> Stopka e-mail
      </h3>
      {!stopka ? (
        <>
          <p className="text-[12.5px] text-muted-foreground">HTML zgodny z programami pocztowymi: logo, imię, stanowisko i kontakt z Materiałów.</p>
          <button type="button" className={cx(klasaPrzyciskuDrugiego, 'w-fit')} onClick={() => void przygotuj()} disabled={trwa}>
            {trwa ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Przygotuj stopkę
          </button>
        </>
      ) : (
        <>
          {/* Ramka bez uprawnień (sandbox=""): HTML stopki nie uruchomi skryptów ani formularzy. */}
          <iframe title="Podgląd stopki e-mail" sandbox="" srcDoc={stopka.html} className="h-48 w-full rounded-[8px] border border-line bg-[#ffffff]" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => void kopiujCo('html')}>
              {skopiowano === 'html' ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} Kopiuj HTML
            </button>
            <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => void kopiujCo('tekst')}>
              {skopiowano === 'tekst' ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} Kopiuj wersję tekstową
            </button>
            <span role="status" className="self-center text-[12px] text-data-hi">
              {skopiowano ? 'Skopiowano do schowka.' : ''}
            </span>
          </div>
          {stopka.instrukcje.length ? (
            <div className="flex flex-col gap-1.5">
              <p className="m-0 text-[12.5px] font-semibold text-foreground">Jak wstawić stopkę</p>
              {stopka.instrukcje.map((i) => (
                <details key={i.program} className="rounded-[8px] border border-line px-3 py-2">
                  <summary className="cursor-pointer text-[13px] text-foreground">
                    {i.program}
                    {!i.sprawdzone ? <span className="ml-2 text-[11.5px] text-muted-foreground">(kroki ogólne – nazwy opcji mogą się różnić)</span> : null}
                  </summary>
                  <ol className="m-0 mt-2 flex list-decimal flex-col gap-1 pl-5 text-[12.5px] text-foreground">
                    {i.kroki.map((k) => (
                      <li key={k}>{k}</li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          ) : null}
        </>
      )}
      {blad ? <Komunikat rodzaj="blad">{blad}</Komunikat> : null}
    </section>
  );
}

export function Eksport({
  widok,
  marka,
  stan,
  strony,
  paynowDostepny,
  onWidok,
  onKrok,
}: {
  widok: WidokMarki;
  marka: Marka;
  stan: StanKreatoraMarki;
  /** Strony z Kreatora stron (null = kreator niedostępny). */
  strony: PozycjaListyKreatora[] | null;
  paynowDostepny: boolean;
  onWidok: (w: WidokMarki) => void;
  onKrok: (k: KrokMarki) => void;
}) {
  const id = useId();
  const pod = podsumujPliki(widok.pliki);
  const [zakup, setZakup] = useState(false);
  const [zgoda, setZgoda] = useState(false);
  const [trwa, setTrwa] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const sprawdzil = marka.zgody.sprawdzilemTmview;

  const potwierdzTmview = async () => {
    if (!zgoda) return;
    setBlad(null);
    setTrwa(true);
    try {
      const w = await zapiszZgody(widok.id, { sprawdzilemTmview: true });
      if (!w.ok) setBlad(w.blad);
      else onWidok(w.dane);
    } catch {
      setBlad(KOMUNIKAT_PO_AKTUALIZACJI);
    } finally {
      setTrwa(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <section aria-labelledby={`${id}-pliki`} className="flex min-w-0 flex-col gap-4 rounded-[10px] border border-line bg-card p-4 sm:p-5">
        <h2 id={`${id}-pliki`} className="m-0 break-words font-display text-[19px] font-bold text-foreground">
          Pliki marki „{marka.brief.nazwa}”
        </h2>
        {pod.proba ? (
          <Komunikat rodzaj="info" tytul="Pliki po opłaceniu hostingu">
            W okresie próbnym projektujesz markę i oglądasz wszystkie warianty. Pobieranie i użycie na stronie włączą się po opłaceniu hostingu.{' '}
            <Link href="/dashboard/billing" className="font-semibold text-foreground underline underline-offset-2">
              Płatności
            </Link>
          </Komunikat>
        ) : null}
        {grupujPliki(widok.pliki).map((g) => (
          <div key={g.grupa} className="flex flex-col gap-1.5">
            <h3 className="m-0 font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{g.nazwa}</h3>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {g.pliki.map((p) => (
                <li key={p.plik} className={cx('flex items-center gap-3 rounded-[8px] border border-line px-3 py-2', !p.dostepny && 'bg-raised')}>
                  <span className="min-w-0 flex-1">
                    <span className="block break-all font-mono text-[12.5px] text-foreground">{p.plik}</span>
                    <span className="block text-[12px] text-muted-foreground">{p.opis}</span>
                  </span>
                  {p.dostepny ? (
                    <a href={adresPliku(widok.id, p.plik)} download className={cx(klasaPrzyciskuDrugiego, 'flex-none px-2.5 py-1.5 text-[12.5px]')}>
                      <Download className="h-3.5 w-3.5" aria-hidden /> Pobierz<span className="sr-only"> {p.plik}</span>
                    </a>
                  ) : p.blokada ? (
                    <span className="inline-flex flex-none items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11.5px] text-muted-foreground" title={opisBlokady(p.blokada).opis}>
                      <Lock className="h-3 w-3" aria-hidden /> {opisBlokady(p.blokada).etykieta}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-[12px] text-muted-foreground">{INFORMACJA_EKSPORTU}</p>
        <div className="flex flex-wrap gap-2">
          {pod.dostepne > 0 ? (
            <a href={adresZip(widok.id)} download className={klasaPrzyciskuGlownego}>
              <FileArchive className="h-4 w-4" aria-hidden /> Pobierz ZIP ({liczbaPlikow(pod.dostepne)})
            </a>
          ) : (
            <button type="button" disabled className={klasaPrzyciskuGlownego}>
              <FileArchive className="h-4 w-4" aria-hidden /> Pobierz ZIP
            </button>
          )}
          {pod.pakiet && !stan.pakiet.kupiony ? (
            <button type="button" className={klasaPrzyciskuDrugiego} aria-expanded={zakup} aria-controls={`${id}-zakup`} onClick={() => setZakup((z) => !z)}>
              Pakiet marki – {opisCeny(stan.pakiet.cena)}
            </button>
          ) : null}
        </div>
        {zakup ? (
          <div id={`${id}-zakup`} className="rounded-[10px] border border-data/40 p-4">
            <ZakupMarki rodzaj="pakiet" cena={stan.pakiet.cena} zawiera={stan.pakiet.zawiera} paynowDostepny={paynowDostepny} />
          </div>
        ) : null}
      </section>

      <div className="flex flex-col gap-4">
        <section aria-labelledby={`${id}-uzyj`} className="flex flex-col gap-3 rounded-[10px] border border-data/40 bg-card p-4">
          <h2 id={`${id}-uzyj`} className="m-0 flex items-center gap-2 font-display text-[16px] font-bold text-foreground">
            <LayoutTemplate className="h-4 w-4 text-data-hi" aria-hidden /> Użyj w Kreatorze stron
          </h2>
          <p className="text-[12.5px] text-muted-foreground">
            Logo w nagłówku i stopce, paleta i kroje w motywie, favicon i obraz do udostępnień. Otwórz stronę – w zakładce Motyw sekcja „Marka” pokaże podgląd zmian. Nic nie zmienia się samo.
          </p>
          {strony?.length ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {strony.map((s) => {
                const st = stanStrony(s, widok);
                return (
                  <li key={s.id} className="flex items-center gap-2 rounded-[8px] border border-line px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[13px] font-semibold text-foreground">{s.nazwa}</span>
                      <span className={cx('block text-[11.5px]', st === 'starsza' ? 'text-warn' : 'text-muted-foreground')}>
                        {st === 'aktualna' ? 'Używa tej marki' : st === 'starsza' ? 'Używa starszej wersji marki – zaktualizuj' : 'Bez tej marki'}
                      </span>
                    </span>
                    <Link href={adresStronyZMarka(s.id)} className={cx(klasaPrzyciskuDrugiego, 'flex-none px-2.5 py-1.5 text-[12.5px]')}>
                      {st === 'brak' ? 'Użyj marki' : 'Otwórz'}
                      <span className="sr-only"> – {s.nazwa}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Link href={strony ? '/dashboard/kreator/nowa' : '/dashboard/kreator'} className={cx(klasaPrzyciskuGlownego, 'w-fit')}>
              {strony ? 'Zbuduj stronę w Kreatorze stron' : 'Otwórz Kreator stron'}
            </Link>
          )}
        </section>

        {pod.tmview || sprawdzil ? (
          <section aria-labelledby={`${id}-tmview`} className="flex flex-col gap-3 rounded-[10px] border border-warn/40 bg-warn-soft p-4">
            <h2 id={`${id}-tmview`} className="m-0 font-display text-[16px] font-bold text-foreground">
              Zanim zarejestrujesz znak albo zamówisz szyld
            </h2>
            <InstrukcjaTmview />
            {sprawdzil ? (
              <p className="flex items-center gap-1.5 text-[12.5px] text-foreground">
                <CheckCircle2 className="h-4 w-4 text-data-hi" aria-hidden />
                Potwierdzone {new Date(sprawdzil).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'long', year: 'numeric' })} – pliki do druku są odblokowane.
              </p>
            ) : (
              <>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-[8px] border border-line bg-card px-3 py-2.5 text-[12.5px] leading-snug text-foreground">
                  <Checkbox className="mt-0.5 h-5 w-5" checked={zgoda} onChange={(e) => setZgoda(e.target.checked)} />
                  <span>{TEKST_ZGODY_TMVIEW}</span>
                </label>
                <button type="button" className={cx(klasaPrzyciskuGlownego, 'w-fit')} disabled={!zgoda || trwa} onClick={() => void potwierdzTmview()}>
                  {trwa ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Potwierdzam – odblokuj pliki do druku
                </button>
              </>
            )}
            {blad ? <Komunikat rodzaj="blad">{blad}</Komunikat> : null}
          </section>
        ) : null}

        <section className="flex flex-col gap-2 rounded-[10px] border border-line bg-card p-4">
          <h2 className="m-0 font-display text-[15px] font-bold text-foreground">Prawa do logo z kreatora</h2>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Logo powstało z pomocą AI na podstawie Twoich wyborów. Prawo autorskie chroni utwory stworzone przez człowieka, więc taki projekt może nie mieć ochrony autorskiej – nie przeszkadza to w
            rejestracji znaku towarowego, która daje wyłączność w wybranych klasach. Kroje w logo są na licencji SIL OFL 1.1, która pozwala używać ich w logo.
          </p>
        </section>

        <StopkaEmail markaId={widok.id} />

        <div className="flex flex-wrap gap-2">
          <button type="button" className={klasaPrzyciskuDrugiego} onClick={() => onKrok('materialy')}>
            Wróć do materiałów
          </button>
        </div>
      </div>
    </div>
  );
}
