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

/**
 * Odpowiedź GET `CMD_API_CUSTOM_HTTPD?domain=` → treść Custom HTTPD domeny. Wg dokumentacji DirectAdmin
 * (changelog 1.26.0) GET „dumps the contents” pliku `domain.cust_httpd` — surowy tekst, pusty dla świeżej
 * domeny. Wcześniej czytaliśmy pole `config=` z odpowiedzi urlencoded, więc na t1 (28.09) każda świeża
 * domena kończyła się błędem odczytu. Urlencoded `config=` i JSON `{config}` przyjmujemy dalej.
 * `blad` = odpowiedź, która nie jest konfiguracją (błąd DA, strona HTML).
 */
export function trescCustomHttpd(data: unknown): { config: string } | { blad: string } {
  if (data && typeof data === 'object') {
    const o = data as { config?: unknown; error?: unknown; text?: unknown };
    if (o.error && String(o.error) !== '0') return { blad: String(o.text ?? 'DirectAdmin error') };
    return typeof o.config === 'string' ? { config: o.config } : { blad: 'brak pola config' };
  }
  const s = typeof data === 'string' ? data : '';
  if (/^\s*<(!doctype|html)/i.test(s)) return { blad: 'DirectAdmin zwrócił stronę HTML zamiast konfiguracji' };
  if (/^(error|config)=/.test(s)) {
    const p = new URLSearchParams(s);
    if (p.get('error') && p.get('error') !== '0') return { blad: p.get('text') || 'DirectAdmin error' };
    // „error=0” bez pola config nie mówi, co jest w pliku — nie zgadujemy, żeby zapis nie skasował wpisów administratora.
    const c = p.get('config');
    return c === null ? { blad: 'odpowiedź bez pola config' } : { config: c };
  }
  return { config: s };
}
