import { BadRequestException } from '@nestjs/common';

/**
 * A-06 — blok Verris w Custom HTTPD domeny (DirectAdmin). Token `|?DOCROOT=…|` w `|*if !SUB|`
 * zmienia DocumentRoot domeny (http i https), subdomeny zostają (dokumentacja DA „Customizing Apache”).
 */
const START = '# verris-docroot-start';
const KONIEC = '# verris-docroot-end';
const BLOK = new RegExp(`${START}[\\s\\S]*?${KONIEC}\\n?`, 'g');
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/;

/** Podkatalog public_html: do 4 poziomów, bez `..`, kropki na początku i znaków spoza [A-Za-z0-9._-]. */
export function normalizujKatalogDocroot(wejscie: string): string {
  const k = String(wejscie ?? '').trim().replace(/^\/+|\/+$/g, '').replace(/^public_html(\/|$)/, '');
  if (!k) return '';
  const czesci = k.split('/');
  if (czesci.length > 4 || !czesci.every((c) => SEGMENT.test(c) && !c.includes('..'))) {
    throw new BadRequestException('Katalog: litery, cyfry, kropka, myślnik i podkreślnik, do 4 poziomów (np. public lub app/public).');
  }
  return czesci.join('/');
}

/** Podkatalog z bloku Verris albo '' (public_html). */
export function odczytajDocroot(config: string): string {
  const m = /\|\?DOCROOT=\/home\/[^/|]+\/domains\/[^/|]+\/public_html\/([^|\s]+)\|/.exec(
    (config.match(BLOK) ?? []).join('\n'),
  );
  return m ? m[1] : '';
}

/** Konfiguracja bez starego bloku Verris, z nowym na końcu (albo bez żadnego, gdy `sciezka` = null). */
export function zapiszDocroot(config: string, sciezka: string | null): string {
  const reszta = config.replace(/\r\n/g, '\n').replace(BLOK, '').replace(/\n+$/, '');
  if (!sciezka) return reszta ? `${reszta}\n` : '';
  const blok = `${START}\n|*if !SUB|\n|?DOCROOT=${sciezka}|\n|*endif|\n${KONIEC}\n`;
  return reszta ? `${reszta}\n${blok}` : blok;
}
