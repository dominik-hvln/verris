/**
 * Zapis bloków WordPressa (format serializowany edytora blokowego): `<!-- wp:nazwa {"atrybut":…} -->HTML<!-- /wp:nazwa -->`.
 * HTML każdego bloku jest taki, jaki zapisuje funkcja `save()` bloku w edytorze (WordPress 6.6+), żeby edytor nie
 * zgłaszał „nieoczekiwanej treści”. Klasy i adresy przychodzą z konwertera (już po `esc()` renderera).
 * Format: https://developer.wordpress.org/block-editor/explanations/architecture/key-concepts/#serialization-and-parsing
 * (do sprawdzenia z dokumentacją przy wdrożeniu – sesja bez dostępu do sieci).
 */

/** Atrybuty komentarza bloku – jak `serializeAttributes` w @wordpress/blocks (bez „--”, <, >, & i \" w komentarzu). */
export function atrybutyBloku(atr: Record<string, unknown>): string {
  return JSON.stringify(atr)
    .replace(/--/g, '\\u002d\\u002d')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\\"/g, '\\u0022');
}

function bezPustych(atr: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(atr).filter(([, v]) => v !== undefined && v !== '' && v !== null));
}

/** Komentarz bloku z treścią (albo samozamykający, gdy `html === null`). Nazwa bez „core/”. */
export function blok(nazwa: string, atr: Record<string, unknown>, html: string | null): string {
  const a = bezPustych(atr);
  const json = Object.keys(a).length ? ` ${atrybutyBloku(a)}` : '';
  if (html === null) return `<!-- wp:${nazwa}${json} /-->`;
  return `<!-- wp:${nazwa}${json} -->\n${html}\n<!-- /wp:${nazwa} -->`;
}

const klasa = (bazowa: string, dodatkowa?: string) => `${bazowa}${dodatkowa ? ` ${dodatkowa}` : ''}`;
const atrKlasy = (k: string) => (k ? ` class="${k}"` : '');
const atrId = (id?: string) => (id ? ` id="${id}"` : '');

export interface OpcjeBloku {
  klasa?: string;
  kotwica?: string;
}

export type ZnacznikGrupy = 'div' | 'section' | 'header' | 'footer' | 'main' | 'article' | 'aside';

export function grupa(o: OpcjeBloku & { tag?: ZnacznikGrupy }, wnetrze: string): string {
  const tag = o.tag ?? 'div';
  return blok('group', { tagName: tag === 'div' ? undefined : tag, className: o.klasa, anchor: o.kotwica }, `<${tag} class="${klasa('wp-block-group', o.klasa)}"${atrId(o.kotwica)}>${wnetrze}</${tag}>`);
}

export function akapit(o: OpcjeBloku, tresc: string): string {
  return blok('paragraph', { className: o.klasa, anchor: o.kotwica }, `<p${atrKlasy(o.klasa ?? '')}${atrId(o.kotwica)}>${tresc}</p>`);
}

export function naglowek(poziom: number, o: OpcjeBloku, tresc: string): string {
  const p = Math.min(6, Math.max(1, poziom));
  return blok('heading', { level: p === 2 ? undefined : p, className: o.klasa, anchor: o.kotwica }, `<h${p} class="${klasa('wp-block-heading', o.klasa)}"${atrId(o.kotwica)}>${tresc}</h${p}>`);
}

export function przyciski(o: OpcjeBloku, lista: string[]): string {
  return blok('buttons', { className: o.klasa }, `<div class="${klasa('wp-block-buttons', o.klasa)}">${lista.join('\n')}</div>`);
}

export function przycisk(o: OpcjeBloku, href: string, tresc: string): string {
  return blok('button', { className: o.klasa }, `<div class="${klasa('wp-block-button', o.klasa)}"><a class="wp-block-button__link wp-element-button" href="${href}">${tresc}</a></div>`);
}

export function obraz(o: OpcjeBloku, src: string, alt: string, podpis?: string): string {
  const pod = podpis ? `<figcaption class="wp-element-caption">${podpis}</figcaption>` : '';
  return blok('image', { className: o.klasa }, `<figure class="${klasa('wp-block-image', o.klasa)}"><img src="${src}" alt="${alt}"/>${pod}</figure>`);
}

export function html(surowy: string): string {
  return blok('html', {}, surowy);
}

export function szczegoly(o: OpcjeBloku & { otwarte?: boolean }, podsumowanie: string, wnetrze: string): string {
  return blok(
    'details',
    { showContent: o.otwarte ? true : undefined, className: o.klasa },
    `<details class="${klasa('wp-block-details', o.klasa)}"${o.otwarte ? ' open' : ''}><summary>${podsumowanie}</summary>${wnetrze}</details>`,
  );
}

export function cytat(o: OpcjeBloku, wnetrze: string): string {
  return blok('quote', { className: o.klasa }, `<blockquote class="${klasa('wp-block-quote', o.klasa)}">${wnetrze}</blockquote>`);
}

export function kolumny(o: OpcjeBloku, wnetrze: string[]): string {
  return blok('columns', { className: o.klasa }, `<div class="${klasa('wp-block-columns', o.klasa)}">${wnetrze.join('\n')}</div>`);
}

export function kolumna(o: OpcjeBloku, wnetrze: string): string {
  return blok('column', { className: o.klasa }, `<div class="${klasa('wp-block-column', o.klasa)}">${wnetrze}</div>`);
}

export function galeria(o: OpcjeBloku, obrazy: string[]): string {
  return blok(
    'gallery',
    { linkTo: 'none', className: o.klasa },
    `<figure class="${klasa('wp-block-gallery has-nested-images columns-default is-cropped', o.klasa)}">${obrazy.join('\n')}</figure>`,
  );
}

export function lista(o: OpcjeBloku & { numerowana?: boolean }, elementy: string[]): string {
  const tag = o.numerowana ? 'ol' : 'ul';
  const el = elementy.map((e) => blok('list-item', {}, `<li>${e}</li>`)).join('\n');
  return blok('list', { ordered: o.numerowana ? true : undefined, className: o.klasa }, `<${tag} class="${klasa('wp-block-list', o.klasa)}">${el}</${tag}>`);
}

// ---------------------------------------------------------------------------
// Odczyt (testy, kontrola paczki przed wysłaniem)
// ---------------------------------------------------------------------------

export interface BlokOdczytany {
  nazwa: string;
  atrybuty: Record<string, unknown>;
  dzieci: BlokOdczytany[];
  /** HTML bloku bez komentarzy bloków wewnętrznych. */
  html: string;
}

const KOMENTARZ = /<!--\s+(\/)?wp:([a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?)(\s+(\{[\s\S]*?\}))?\s+(\/)?-->/g;

/**
 * Parsuje zapis bloków jak parser WordPressa (komentarze sparowane, atrybuty jako JSON). Rzuca błąd z opisem przy
 * niesparowanym komentarzu, złym JSON-ie albo komentarzu „wp:” w złym formacie.
 */
export function parsujBloki(zapis: string): BlokOdczytany[] {
  const korzen: BlokOdczytany = { nazwa: '#root', atrybuty: {}, dzieci: [], html: '' };
  const stos: BlokOdczytany[] = [korzen];
  let ostatni = 0;
  for (const m of zapis.matchAll(KOMENTARZ)) {
    const [calosc, zamkniecie, nazwa, , json, samo] = m;
    stos[stos.length - 1]!.html += zapis.slice(ostatni, m.index);
    ostatni = m.index! + calosc.length;
    if (zamkniecie) {
      const gora = stos.pop()!;
      if (gora.nazwa !== nazwa) throw new Error(`Bloki: zamknięcie wp:${nazwa} bez otwarcia (otwarty: ${gora.nazwa})`);
      continue;
    }
    let atrybuty: Record<string, unknown> = {};
    if (json) {
      try {
        atrybuty = JSON.parse(json) as Record<string, unknown>;
      } catch {
        throw new Error(`Bloki: atrybuty wp:${nazwa} to nie JSON: ${json.slice(0, 80)}`);
      }
    }
    const b: BlokOdczytany = { nazwa: nazwa!, atrybuty, dzieci: [], html: '' };
    stos[stos.length - 1]!.dzieci.push(b);
    if (!samo) stos.push(b);
  }
  stos[stos.length - 1]!.html += zapis.slice(ostatni);
  if (stos.length !== 1) throw new Error(`Bloki: niezamknięty wp:${stos[stos.length - 1]!.nazwa}`);
  // Komentarz wyglądający jak blok, którego wyrażenie nie złapało (np. literówka) – parser WordPressa zrobiłby z niego HTML.
  const wszystkie = (zapis.match(/<!--\s*\/?wp:/g) ?? []).length;
  const sparowane = [...zapis.matchAll(KOMENTARZ)].length;
  if (wszystkie !== sparowane) throw new Error('Bloki: komentarz wp: w nieprawidłowym formacie');
  return korzen.dzieci;
}

/** Wszystkie bloki (w głąb). */
export function splaszcz(bloki: BlokOdczytany[]): BlokOdczytany[] {
  return bloki.flatMap((b) => [b, ...splaszcz(b.dzieci)]);
}
