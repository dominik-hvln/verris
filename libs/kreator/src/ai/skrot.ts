import { jezykPodstrony } from '../jezyki.ts';
import { Firma, type Sekcja, type Strona } from '../model.ts';
import { kompaktujWg } from './kompakt.ts';

/**
 * Skrót strony (paczka 127) – kontekst zmiany jednej sekcji i tłumaczenia zamiast całej strony w bloku 3.
 *
 * Co zostaje: wszystkie fakty, z których model może korzystać w innych sekcjach (dane firmy, ceny z oferty, cennika
 * i produktów, osoby z zespołu), struktura (id, typ, wariant, tło, menu – do linków '#id' i rytmu teł), nagłówki
 * wszystkich sekcji (żeby nie powtarzać obietnic i tematów), obietnica z hero (nagłówek, podtytuł), pytania FAQ,
 * etapy procesu i cele przycisków. Czego nie ma: długich tekstów innych sekcji (akapity, opisy, odpowiedzi FAQ),
 * palety, zdjęć – zmiana jednej sekcji ich nie potrzebuje, a ton widać w pełnej treści zmienianej sekcji
 * (wiadomość) i w nagłówkach.
 *
 * Tylko podstrony języka głównego: skrót nie zmienia się, gdy tłumaczenie dokłada kolejne wersje językowe, więc
 * kolejne podstrony tłumaczenia i kolejne zmiany sekcji (bez zmiany nagłówka i faktów) czytają blok 3 z cache 5 min.
 */

const cena = (brutto: number | null, okres?: string) => (brutto === null ? 'wycena indywidualna' : `${brutto} zł${okres && okres !== 'jednorazowo' ? ` (${okres})` : ''}`);

/** Zarys sekcji: struktura, nagłówek i fakty (bez długich tekstów). */
export function zarysSekcji(s: Sekcja): Record<string, unknown> {
  const z: Record<string, unknown> = { id: s.id, typ: s.typ, wariant: s.wariant };
  if (s.tlo !== 'domyslne') z.tlo = s.tlo;
  if (s.wMenu) z.wMenu = s.wMenu;
  if (s.ukryta) z.ukryta = true;
  z.naglowek = s.dane.naglowek;
  switch (s.typ) {
    case 'hero':
      if (s.dane.podtytul) z.podtytul = s.dane.podtytul;
      if (s.dane.przyciski.length) z.przyciski = s.dane.przyciski.map((b) => `${b.etykieta} → ${b.cel}`);
      if (s.dane.fakty.length) z.fakty = s.dane.fakty.map((f) => `${f.etykieta}: ${f.wartosc}`);
      break;
    case 'oferta':
      z.pozycje = s.dane.pozycje.map((p) => (p.cena ? `${p.tytul} – ${p.cena}` : p.tytul));
      break;
    case 'cennik':
      z.pakiety = s.dane.pakiety.map((p) => `${p.nazwa} – ${cena(p.cenaBrutto, p.okres)}`);
      break;
    case 'produkty':
      z.produkty = s.dane.produkty.map((p) => `${p.nazwa} – ${p.cenaBrutto} zł`);
      break;
    case 'zespol':
      z.osoby = s.dane.osoby.map((o) => (o.rola ? `${o.imie} (${o.rola})` : o.imie));
      break;
    case 'kroki':
      z.kroki = s.dane.kroki.map((k) => k.tytul);
      break;
    case 'faq':
      z.pytania = s.dane.pytania.map((p) => p.pytanie);
      break;
    case 'onas':
      if (s.dane.wyrozniki.length) z.wyrozniki = s.dane.wyrozniki.map((w) => w.tytul);
      break;
    case 'cta':
      z.przyciski = s.dane.przyciski.map((b) => `${b.etykieta} → ${b.cel}`);
      break;
    case 'opinie':
      z.wpisow = s.dane.wpisy.length;
      break;
    case 'galeria':
      z.zdjec = s.dane.obrazy.length;
      break;
    case 'blog':
      z.wpisow = s.dane.wpisy.length;
      break;
    case 'kontakt':
      z.formularz = s.dane.formularz ? s.dane.pola : false;
      break;
  }
  return z;
}

export function skrotStrony(strona: Strona): Record<string, unknown> {
  const m = strona.motyw;
  return {
    jezyk: strona.jezyk,
    firma: kompaktujWg(Firma, strona.firma),
    seo: { tytul: strona.seo.tytul, opis: strona.seo.opis, ...(strona.seo.slowaKluczowe.length ? { slowaKluczowe: strona.seo.slowaKluczowe } : {}) },
    motyw: { styl: m.styl, fonty: m.fonty, skalaTypografii: m.skalaTypografii, animacje: m.animacje, efekty: m.efekty },
    strony: strona.strony
      .filter((p) => jezykPodstrony(strona, p) === strona.jezyk)
      .map((p) => ({ slug: p.slug, tytul: p.tytul, sekcje: p.sekcje.map(zarysSekcji) })),
  };
}
