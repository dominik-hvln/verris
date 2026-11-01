import Link from 'next/link';
import { ArrowLeftRight, BookOpen, ChartColumn, Globe, ListChecks, Mail } from 'lucide-react';
import type { ReactNode } from 'react';

/*
 * Bloki „W tym samym panelu” i „Poradniki” z makiety 1.11 — cross-sell na stronach usług.
 * Komponenty nie mają własnej sekcji: strona wstawia je w <section className="sec"> (razem albo osobno)
 * i pomija swoją usługę przez `pomin` (np. /poczta pomija kartę poczty).
 */

export type KluczUslugi = 'domeny' | 'poczta' | 'przeniesienie' | 'statystyki';

const USLUGI: { klucz: KluczUslugi; eyebrow: string; tytul: string; tekst: string; link: string; href: string; ikona: ReactNode }[] = [
  {
    klucz: 'domeny',
    eyebrow: 'Domeny',
    tytul: 'Adres dla Twojej firmy',
    tekst: 'Rejestracja i transfer, DNS i DNSSEC w panelu. Domena nie odnowi się bez Ciebie.',
    link: 'Sprawdź domenę',
    href: '/domeny',
    ikona: <Globe aria-hidden="true" />,
  },
  {
    klucz: 'poczta',
    eyebrow: 'Poczta',
    tytul: 'Firmowy e-mail',
    tekst: 'Skrzynki w Twojej domenie, webmail i konfiguracja telefonu w kilka minut.',
    link: 'Zobacz pocztę',
    href: '/poczta',
    ikona: <Mail aria-hidden="true" />,
  },
  {
    klucz: 'przeniesienie',
    eyebrow: 'Przeniesienie',
    tytul: 'Przeprowadzka za 0 zł',
    tekst: 'Strona, bazy i poczta z cPanel, Plesk albo przez FTP. Stara strona działa do końca.',
    link: 'Jak to działa',
    href: '/przenies-strone',
    ikona: <ArrowLeftRight aria-hidden="true" />,
  },
  {
    klucz: 'statystyki',
    eyebrow: 'Statystyki',
    tytul: 'Ruch bez cookies',
    tekst: 'Odwiedziny, źródła i urządzenia w panelu, bez banera zgody na Twojej stronie.',
    link: 'Jak działają',
    href: '/funkcje/statystyki',
    ikona: <ChartColumn aria-hidden="true" />,
  },
];

export function KartyUslug({ pomin = [], tytul = 'W tym samym panelu' }: { pomin?: KluczUslugi[]; tytul?: string }) {
  const lista = USLUGI.filter((u) => !pomin.includes(u.klucz));
  return (
    <div className="powiaz">
      <div className="powiaz-g">
        <h2>{tytul}</h2>
        <Link href="/funkcje">Wszystkie funkcje →</Link>
      </div>
      <ul className={`powiaz-karty n${lista.length}`}>
        {lista.map((u) => (
          <li key={u.klucz}>
            <Link className="card kusl" href={u.href} data-event="cta_click" data-cta={`karty-uslug-${u.klucz}`}>
              <span className="kusl-ik">{u.ikona}</span>
              <span className="kicker">{u.eyebrow}</span>
              <h3>{u.tytul}</h3>
              <p>{u.tekst}</p>
              <span className="kusl-link">{u.link} →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type KluczPoradnika = 'jak-wybrac' | 'z-cpanel' | 'z-plesk' | 'z-ftp';

const PORADNIKI: { klucz: KluczPoradnika; eyebrow: string; tytul: string; href: string; ikona: ReactNode }[] = [
  { klucz: 'jak-wybrac', eyebrow: 'Lista kontrolna', tytul: 'Jak wybrać hosting i nie żałować za rok', href: '/jak-wybrac-hosting', ikona: <ListChecks aria-hidden="true" /> },
  { klucz: 'z-cpanel', eyebrow: 'Przeniesienie', tytul: 'Jak przenieść stronę z cPanel krok po kroku', href: '/przenies-strone/z-cpanel', ikona: <BookOpen aria-hidden="true" /> },
  { klucz: 'z-plesk', eyebrow: 'Przeniesienie', tytul: 'Jak przenieść stronę z Plesk krok po kroku', href: '/przenies-strone/z-plesk', ikona: <BookOpen aria-hidden="true" /> },
  { klucz: 'z-ftp', eyebrow: 'Przeniesienie', tytul: 'Jak przenieść stronę przez FTP krok po kroku', href: '/przenies-strone/z-ftp', ikona: <BookOpen aria-hidden="true" /> },
];

/** Trzy poradniki (domyślnie: jak wybrać, z cPanel, z Plesk); `pomin` wyłącza wybrane, kolejne wchodzą na ich miejsce. */
export function Poradniki({ pomin = [], ile = 3 }: { pomin?: KluczPoradnika[]; ile?: number }) {
  const lista = PORADNIKI.filter((p) => !pomin.includes(p.klucz)).slice(0, ile);
  return (
    <div className="powiaz">
      <div className="powiaz-g">
        <h2>Poradniki</h2>
        <Link href="/blog">Wszystkie poradniki →</Link>
      </div>
      <ul className={`powiaz-karty n${lista.length}`}>
        {lista.map((p) => (
          <li key={p.klucz}>
            <Link className="card porad" href={p.href} data-event="cta_click" data-cta={`poradnik-${p.klucz}`}>
              <span className="porad-ik">{p.ikona}</span>
              <span className="kicker">{p.eyebrow}</span>
              <h3>{p.tytul}</h3>
              <span className="kusl-link">Czytaj →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
