'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

/** Strony bez paska (formalne albo z własnym formularzem w centrum uwagi). */
export const BEZ_PASKA = ['/kontakt', '/dokumenty', '/zglos-naduzycie'];

const KLUCZ_UKRYCIA = 'verris:mobilny-pasek-ukryty';

/** Czy pasek ma być widoczny przy danej pozycji przewinięcia (pokazany po ~1,5 ekranu, schowany na ostatnim). */
export function pasekWidoczny(y: number, wysokoscEkranu: number, wysokoscStrony: number): boolean {
  return y > wysokoscEkranu * 1.5 && y + wysokoscEkranu < wysokoscStrony - wysokoscEkranu * 0.9;
}

/**
 * Pasek zakupu na telefonie (do 900 px; makieta 1.11 — zastąpił StickyBuy). Treść z propsów, ceny strona bierze
 * z API (lib/ceny-api.ts). Pojawia się po przewinięciu za hero, chowa się na ostatnim ekranie (pas końcowy, stopka),
 * przy otwartym banerze cookies (CSS: body:has(.cc-bar)) i po kliknięciu „×” do końca wizyty (sessionStorage).
 * Wstaw raz na stronie, najlepiej jako ostatnie dziecko <main>.
 */
export function MobilnyPasek({
  tytul,
  podpis,
  przycisk,
  href,
  cta = 'mobilny-pasek',
  conv = 'checkout_intent',
}: {
  /** Np. cena miesięczna z lib/ceny (zl()) albo „Przeniesienie 0 zł”. */
  tytul: string;
  podpis?: string;
  przycisk: string;
  href: string;
  cta?: string;
  /** Zdarzenie konwersji przycisku; null — przycisk nie jest zamiarem zakupu. */
  conv?: string | null;
}) {
  const sciezka = usePathname();
  const [widoczny, setWidoczny] = useState(false);
  const [ukryty, setUkryty] = useState(false);

  useEffect(() => {
    let zapamietany = false;
    try {
      zapamietany = window.sessionStorage.getItem(KLUCZ_UKRYCIA) === '1';
    } catch {
      /* prywatne okno albo zablokowane dane strony — pasek po prostu się pokazuje */
    }
    const onScroll = () => {
      if (zapamietany) setUkryty(true);
      else setWidoczny(pasekWidoczny(window.scrollY, window.innerHeight, document.documentElement.scrollHeight));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  if (ukryty || BEZ_PASKA.some((p) => sciezka?.startsWith(p))) return null;

  const ukryj = () => {
    setUkryty(true);
    try {
      window.sessionStorage.setItem(KLUCZ_UKRYCIA, '1');
    } catch {
      /* bez zapamiętania — pasek wróci po przeładowaniu */
    }
  };

  return (
    <div className={`mpasek${widoczny ? ' on' : ''}`} aria-hidden={!widoczny} inert={!widoczny}>
      <p>
        <strong>{tytul}</strong>
        {podpis && <span>{podpis}</span>}
      </p>
      <a className="btn btn-primary btn-sm" href={href} data-event="cta_click" data-cta={cta} data-conv={conv ?? undefined}>
        {przycisk}
      </a>
      <button type="button" className="mpasek-x" aria-label="Ukryj pasek" onClick={ukryj}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
