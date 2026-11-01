/**
 * Filtr white label na WYJŚCIU asystenta www (1.11.2026). Działa niezależnie od promptu: nawet jeśli model
 * „wygada się” nazwą oprogramowania serwera, adresem albo lokalizacją, odpowiedź nie trafia do klienta.
 *
 * Zasady (CLAUDE.md + decyzja 14.10): klient nie widzi DirectAdmin/DA/CustomBuild, portu 2222, adresów węzłów;
 * nie eksponujemy lokalizacji serwerów (wystarczy „dane w UE”). Wolno: LiteSpeed, ImunifyAV, NVMe, Redis, PHP,
 * WAF — są na stronie. CloudLinux nie jest wymieniany (decyzja 07.10: „izolacja kont”).
 */

/** Publiczne hosty, które asystent może podać (linki do źródeł). */
const PUBLICZNE_HOSTY = new Set([
  'verris.pl',
  'www.verris.pl',
  'panel.verris.pl',
  'pomoc.verris.pl',
  'status.verris.pl',
  'webmail.verris.pl',
]);

/** Ujednolicenie: małe litery, bez polskich znaków, separatory (spacje, kropki, myślniki, podkreślenia) usunięte. */
function zlep(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[\s._\-·•*/\\|]+/g, '');
}

/** Słowa zakazane po „zlepieniu” — łapią też „D i r e c t A d m i n”, „Cloud-Linux”, „HETZNER”. */
const ZAKAZANE_ZLEPIONE: Array<[string, string]> = [
  ['directadmin', 'nazwa oprogramowania panelu'],
  ['custombuild', 'nazwa oprogramowania serwera'],
  ['cloudlinux', 'nazwa systemu serwera'],
  ['cagefs', 'nazwa oprogramowania serwera'],
  ['imunify360', 'nazwa oprogramowania serwera'],
  ['hetzner', 'dostawca serwerów'],
  ['contabo', 'dostawca serwerów'],
  ['leaseweb', 'dostawca serwerów'],
  ['falkenstein', 'lokalizacja serwerów'],
  ['nuremberg', 'lokalizacja serwerów'],
  ['norymberga', 'lokalizacja serwerów'],
  ['helsinki', 'lokalizacja serwerów'],
  ['finlandi', 'lokalizacja serwerów'],
  ['niemczech', 'lokalizacja serwerów'],
  ['niemcy', 'lokalizacja serwerów'],
  ['germany', 'lokalizacja serwerów'],
  ['finland', 'lokalizacja serwerów'],
];

/** Wzorce na tekście oryginalnym (granice słów są tu ważne). */
const ZAKAZANE_WZORCE: Array<[RegExp, string]> = [
  [/\bDA\b/, 'skrót nazwy panelu'],
  [/\b2222\b/, 'port panelu serwera'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/, 'adres IPv4'],
  // IPv6: co najmniej 4 grupy (godziny „20:00:00” mają 3) albo skrót „::”.
  [/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b|\b[0-9a-f]{1,4}::(?:[0-9a-f]{1,4})?\b/i, 'adres IPv6'],
  [/\bOVH\b[^.]{0,40}\b(serwer|hosting|centrum|data ?center)/i, 'dostawca serwerów'],
  [/\b(serwer|hosting|centrum danych|data ?center)\b[^.]{0,40}\bOVH\b/i, 'dostawca serwerów'],
  [/\bt\d{1,2}(?:\.verris\.pl)?\b(?=[\s.,;:)!?]|$)/i, 'nazwa serwera'],
];

/** Hosty *.verris.pl spoza listy publicznej (np. t1.verris.pl, mail.verris.pl, node-2.verris.pl). */
const HOST_VERRIS = /\b((?:[a-z0-9-]+\.)+verris\.pl)\b/gi;

export interface WynikFiltra {
  ok: boolean;
  powody: string[];
}

export function sprawdzWhiteLabel(tekst: string): WynikFiltra {
  const powody = new Set<string>();
  const zlepiony = zlep(tekst);
  for (const [slowo, powod] of ZAKAZANE_ZLEPIONE) if (zlepiony.includes(slowo)) powody.add(powod);
  for (const [re, powod] of ZAKAZANE_WZORCE) if (re.test(tekst)) powody.add(powod);
  for (const m of tekst.matchAll(HOST_VERRIS)) {
    if (!PUBLICZNE_HOSTY.has(m[1].toLowerCase())) powody.add('wewnętrzny adres serwera');
  }
  return { ok: powody.size === 0, powody: [...powody] };
}

/** Bezpieczna formuła, gdy także druga odpowiedź nie przeszła filtra. */
export const BEZPIECZNA_ODPOWIEDZ =
  'Tę część wolę przekazać człowiekowi, żeby niczego nie pomylić. Zostaw numer w „Poproś o telefon” — oddzwonimy w dni robocze 9–17.';

/** Dopisek do drugiej próby po trafieniu filtra (bez ujawniania listy zakazanych słów). */
export const DOPISEK_PONOWNEJ_PROBY =
  'Poprzednia wersja odpowiedzi zawierała informacje, których nie podajemy klientom (nazwy oprogramowania serwera, dostawców, adresy lub lokalizacje serwerów). Odpowiedz jeszcze raz bez nich: mów o „panelu Verris”, „serwerach w Unii Europejskiej” i funkcjach ze źródeł.';
