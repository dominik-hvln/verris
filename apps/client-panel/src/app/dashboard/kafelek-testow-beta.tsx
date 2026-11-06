'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { ArrowRight, Download } from 'lucide-react';
import type { PostepBetaDto } from '@verris/contracts/klient';
import { Meter } from '@/components/panel/v2';
import { plForm } from '@/lib/pl';
import { ADRES_PRZEWODNIKA, podsumowanieTestera } from './beta/postep-beta';

/** Zwinięcie kafelka po ukończeniu testów — wygoda jednej przeglądarki, nie stan konta. */
export const KLUCZ_ZWINIECIA = 'verris.pulpit.testy-beta.zwiniety';

const BTN =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-line-strong bg-card px-3 py-2 text-sm font-medium text-foreground hover:border-primary';
const BTN_PRIMARY =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-primary bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground';

function czytajZwiniecie(): boolean {
  try {
    return window.localStorage.getItem(KLUCZ_ZWINIECIA) === '1';
  } catch {
    return zwinietyWPamieci;
  }
}

const ZDARZENIE = 'verris-testy-beta';
/** Bez localStorage (tryb prywatny, zablokowane dane strony) zwinięcie trzyma się do odświeżenia. */
let zwinietyWPamieci = false;

function zapiszZwiniecie(zwiniety: boolean) {
  zwinietyWPamieci = zwiniety;
  try {
    if (zwiniety) window.localStorage.setItem(KLUCZ_ZWINIECIA, '1');
    else window.localStorage.removeItem(KLUCZ_ZWINIECIA);
  } catch {
    // zostaje wartość w pamięci
  }
  window.dispatchEvent(new Event(ZDARZENIE));
}

function subskrybuj(onChange: () => void) {
  window.addEventListener(ZDARZENIE, onChange);
  return () => window.removeEventListener(ZDARZENIE, onChange);
}

const ZGLOS_UWAGE = 'Coś nie działa albo przeszkadza? Kliknij „Zgłoś uwagę” w prawym dolnym rogu panelu i opisz, co się stało.';

/**
 * Decyzja 06.11 — testerzy dostają instrukcje w panelu: postęp ze strony Testy (beta), następny scenariusz, przewodnik
 * PDF i jedno zdanie o „Zgłoś uwagę”. Konto z zaproszenia „tylko poczta” liczy scenariusze poczty. Po ukończeniu —
 * podziękowanie, które można zwinąć.
 */
export function KafelekTestowBeta({ postep }: { postep: PostepBetaDto }) {
  const { zrobione, wszystkie, nastepny } = podsumowanieTestera(postep);
  const gotowe = zrobione >= wszystkie;
  // Serwer i hydratacja: kafelek rozwinięty; potem wybór z tej przeglądarki (jak tryb prosty w layout.tsx).
  const zwiniety = useSyncExternalStore(subskrybuj, czytajZwiniecie, () => false);
  const przelacz = zapiszZwiniecie;
  const pct = wszystkie ? Math.round((zrobione / wszystkie) * 100) : 0;
  const liczba = `${zrobione} z ${wszystkie} ${plForm(wszystkie, 'kroku', 'kroków', 'kroków')}`;

  if (gotowe && zwiniety) {
    return (
      <section
        aria-labelledby="testy-beta-tytul"
        data-kafelek-testow="zwiniety"
        className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-card px-4 py-2.5"
      >
        <h2 id="testy-beta-tytul" className="m-0 text-[14px] font-semibold text-foreground">
          Testy (beta): wszystkie kroki odhaczone – dziękujemy!
        </h2>
        <button type="button" aria-expanded={false} onClick={() => przelacz(false)} className="text-[13px] font-semibold text-primary underline underline-offset-[3px]">
          Rozwiń
        </button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="testy-beta-tytul"
      data-kafelek-testow={gotowe ? 'ukonczone' : 'w-toku'}
      className="flex flex-col gap-3 rounded-[10px] border border-primary/40 bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="testy-beta-tytul" className="m-0 font-display text-[16px] font-bold text-foreground">
            {gotowe ? 'Testy (beta) – dziękujemy!' : 'Testy (beta)'}
          </h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {gotowe
              ? 'Wszystkie kroki odhaczone. Uwagi do scenariuszy możesz dopisywać do końca testów.'
              : postep.tylkoPoczta
                ? 'Testujesz pocztę – liczymy tylko scenariusze oznaczone „Też przy samej poczcie”, resztę możesz pominąć.'
                : 'Odhaczaj kroki scenariuszy – zapisują się na Twoim koncie, możesz przerwać i wrócić w dowolnej chwili.'}
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-[22px] font-bold leading-none text-foreground tabular-nums" data-postep-pulpit>
            {zrobione} <span className="text-[13.5px] font-semibold text-muted-foreground">z {wszystkie} {plForm(wszystkie, 'kroku', 'kroków', 'kroków')}</span>
          </div>
        </div>
      </div>
      <Meter pct={pct} tipText={liczba} />
      {nastepny ? (
        <p className="m-0 text-[14px] text-foreground" data-nastepny-scenariusz={nastepny.id}>
          Następny scenariusz:{' '}
          <Link href={`/dashboard/beta#${nastepny.id}`} className="font-semibold text-data-hi hover:underline">
            {nastepny.tytul}
          </Link>{' '}
          <span className="text-muted-foreground">({nastepny.czas})</span>
        </p>
      ) : null}
      <p className="m-0 text-[13.5px] text-muted-foreground">{ZGLOS_UWAGE}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/dashboard/beta" className={gotowe ? BTN : BTN_PRIMARY}>
          Przejdź do scenariuszy <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        {/* Zwykły <a>: to plik z trasy serwera, nie strona — bez nawigacji klienta i prefetchu. */}
        <a href={ADRES_PRZEWODNIKA} download className={BTN}>
          <Download className="h-4 w-4" aria-hidden /> Pobierz przewodnik (PDF)
        </a>
        {gotowe ? (
          <button type="button" aria-expanded onClick={() => przelacz(true)} className="ml-auto text-[13px] font-semibold text-muted-foreground underline underline-offset-[3px] hover:text-foreground">
            Zwiń
          </button>
        ) : null}
      </div>
    </section>
  );
}
