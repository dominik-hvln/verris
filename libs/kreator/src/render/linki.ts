import type { Przycisk } from '../model.ts';
import { esc } from './esc.ts';
import type { KontekstPodstrony } from './kontekst.ts';

/** Ścieżka do podstrony z bieżącej strony (względna – strona działa w podglądzie i pod domeną). */
export function hrefPodstrony(k: KontekstPodstrony, slug: string): string {
  if (!slug) return k.prefix || './';
  return `${k.prefix}${slug}/`;
}

/**
 * Cel linku z modelu → href. Kotwica: na tej stronie zostaje, z podstrony prowadzi do strony głównej.
 * Ścieżka „/x”: podstrona kreatora → katalog podstrony; inna → względnie od korzenia.
 */
export function hrefCelu(k: KontekstPodstrony, cel: string): string {
  if (cel.startsWith('#')) {
    const id = cel.slice(1);
    if (k.idTutaj.has(id)) return cel;
    if (k.s.idGlownej.has(id)) return `${k.prefix || './'}${cel}`;
    return cel;
  }
  if (cel.startsWith('/')) {
    const sciezka = cel.replace(/^\/+/, '');
    const bezSlasha = sciezka.replace(/\/$/, '');
    if (k.s.strona.strony.some((p) => p.slug === bezSlasha)) return hrefPodstrony(k, bezSlasha);
    return `${k.prefix}${sciezka}` || './';
  }
  return cel;
}

export function czyZewnetrzny(href: string): boolean {
  return /^https:\/\//i.test(href);
}

/** Atrybuty linku: zewnętrzne dostają rel="noopener" (bez target – użytkownik decyduje sam). */
export function atrLinku(href: string): string {
  return `href="${esc(href)}"${czyZewnetrzny(href) ? ' rel="noopener"' : ''}`;
}

export function przycisk(k: KontekstPodstrony, p: Przycisk, dodatkowaKlasa = ''): string {
  const klasa = `btn ${p.styl === 'drugi' ? 'btn-2' : 'btn-1'}${dodatkowaKlasa ? ' ' + dodatkowaKlasa : ''}`;
  return `<a class="${klasa}" ${atrLinku(hrefCelu(k, p.cel))}>${esc(p.etykieta)}</a>`;
}

/**
 * Czy cel prowadzi do czegoś, co istnieje: kotwica musi wskazywać sekcję renderowaną na tej stronie
 * albo na stronie głównej (sekcja Pro usunięta w hosting, ukryta albo pusta – link byłby martwy).
 */
export function celDostepny(k: KontekstPodstrony, cel: string): boolean {
  if (!cel.startsWith('#')) return true;
  const id = cel.slice(1);
  return k.idTutaj.has(id) || k.s.idGlownej.has(id);
}

/** Przyciski z modelu; prowadzące do niewidocznej sekcji są pomijane (z ostrzeżeniem dla klienta). */
export function przyciski(k: KontekstPodstrony, lista: Przycisk[]): string {
  const dostepne = lista.filter((p) => {
    if (celDostepny(k, p.cel)) return true;
    k.s.ostrzezenia.push(`Przycisk „${p.etykieta}” prowadzi do sekcji, której nie ma na stronie – pominięto go.`);
    return false;
  });
  if (!dostepne.length) return '';
  return `<div class="akcje">${dostepne.map((p) => przycisk(k, p)).join('')}</div>`;
}

export function telHref(tel: string): string {
  const cyfry = tel.replace(/[^0-9+]/g, '');
  return `tel:${cyfry.startsWith('+') ? cyfry : cyfry.length === 9 ? '+48' + cyfry : cyfry}`;
}
