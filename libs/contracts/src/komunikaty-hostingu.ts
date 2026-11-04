/**
 * Mapowanie surowych błędów API / panelu serwera na przyjazne komunikaty PL.
 *
 * Mieszka w `libs/contracts`, bo korzystają z niego OBA końce: API czyści pola zwracane klientowi
 * w JSON-ie (`fetchError`, `error` zadań, `lastError` zamówień — filtr wyjątków ich nie widzi), a panel
 * — dla błędów z własnych akcji i sieci. White label: klient nie widzi nazwy DirectAdmin, portu 2222
 * ani adresów węzłów.
 *
 * P5-01 — tylko kod serwerowy (API, `apiFetch` panelu): wzorzec niżej wylicza ukrywane nazwy, więc nie może trafić do
 * przeglądarki. Panel klienta w przeglądarce używa `bledy-klienta.ts` (wejście `@verris/contracts/klient`).
 */
import { HOSTING_FETCH_UNAVAILABLE, KOMUNIKAT_OPERACJI_OGOLNY, przetlumaczBlad, sladTechniczny } from './bledy-klienta.ts';

/**
 * Nazwa panelu serwera (DirectAdmin/DA/CustomBuild — także rozdzielone spacją), jego komendy (`CMD_API_*`), ścieżki,
 * port 2222, kolejka zadań DA i oprogramowanie węzła (CloudLinux, CageFS, LVE, narzędzia LiteSpeed, LSWS). Nazwa
 * wtyczki „LiteSpeed Cache” zostaje (to wtyczka WordPressa). „DA” i „LVE” tylko wielkimi literami jako osobne
 * słowo — `/\bDA\b/i` łapał polskie „nie da się”.
 */
const PANEL_SERWERA =
  /Direct\s*Admin|Custom\s*Build|CMD_API|task\.queue|\/usr\/local\/|\/opt\/alt\/|:2222\b|\bpor(?:t\w*|cie)\s*2222\b|Cloud\s*Linux|CageFS|selectorctl|lswsctrl|\blsws\b|Lite\s*Speed(?! Cache)/i;
const SKROTY_PANELU = /\bDA\b|\bLVE\b/;

export function zdradzaPanelSerwera(tekst: string): boolean {
  return PANEL_SERWERA.test(tekst) || SKROTY_PANELU.test(tekst);
}

/**
 * Infrastruktura poza panelem (D3, white label): MTA i poczta (exim i jego odmiany — „exima”, Dovecot, Rspamd),
 * fail2ban, Imunify, zapora aplikacyjna (ModSecurity, mod_security, modsec), narzędzia LVE (lvectl, lvetop,
 * lve-stats — także małymi literami) i dostawca serwerów. OpenLiteSpeed łapie wzorzec LiteSpeed (bez \b na początku).
 */
const INFRASTRUKTURA = /\bexim\w*|dovecot|rspamd|fail2ban|imunify|mod_?security|\bmodsec\b|\blve[\w-]*|hetzner/i;
/**
 * Adresy IP (IPv4, IPv6). IPv6 tylko z „::” na granicy słowa albo w pełnej postaci (8 grup) — godzina „12:30:00”
 * i „self::” nie pasują.
 */
const ADRES_IP = /\b\d{1,3}(?:\.\d{1,3}){3}\b|\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b|\b(?:[0-9a-f]{1,4}:){1,7}:/i;

/**
 * Audyt Fali 3 — jeden filtr white label (D3) dla wszystkiego, co pisze zespół do klienta (komunikaty serwisowe,
 * mail z szablonu) i co trafia do klienta z systemu (raport pomigracyjny, eksport RODO). Zwraca pierwszy fragment,
 * który zdradza panel serwera, infrastrukturę, adres IP albo węzeł (`wezly` — nazwy, hosty, host panelu węzła,
 * IPv4 i IPv6 z bazy, dopasowanie całego słowa: „sklep.t1.verris.pl” klienta nie jest węzłem „t1.verris.pl”),
 * albo null. `adresyIp: false` — dowolny adres IP spoza węzłów przechodzi (mail do jednego klienta z jego adresem).
 */
export function fragmentInfrastruktury(
  tekst: string | null | undefined,
  wezly: readonly (string | null | undefined)[] = [],
  opcje: { adresyIp?: boolean } = {},
): string | null {
  const t = tekst ?? '';
  const m = PANEL_SERWERA.exec(t) ?? SKROTY_PANELU.exec(t) ?? INFRASTRUKTURA.exec(t) ?? (opcje.adresyIp === false ? null : ADRES_IP.exec(t));
  if (m) return m[0];
  const maly = t.toLowerCase();
  for (const w of wezly) {
    const x = w?.trim().toLowerCase();
    if (!x || x.length < 2) continue;
    const esc = x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?<![\\w.:-])${esc}(?![\\w:-]|\\.\\w)`).test(maly)) return w!.trim();
  }
  return null;
}

/** Tekst, który trafia do klienta (raport, eksport RODO), zdradza panel serwera, infrastrukturę albo węzeł. */
export function zdradzaInfrastrukture(tekst: string, wezly: readonly (string | null | undefined)[] = []): boolean {
  return fragmentInfrastruktury(tekst, wezly) !== null;
}

/** Ślady techniczne: panel serwera i oprogramowanie węzła (white label) albo ogólne (stos, IP, URL — `bledy-klienta.ts`). */
function techniczny(text: string): boolean {
  return zdradzaPanelSerwera(text) || sladTechniczny(text);
}

export { HOSTING_FETCH_UNAVAILABLE };

/**
 * Zwraca przyjazny komunikat dla błędu operacji (mutacji). Nigdy nie zwraca pustego. Wersja serwerowa: reguły jak
 * w `bledy-klienta.ts` (wersja dla przeglądarki), a oryginał z nazwą panelu serwera nie przechodzi.
 */
export function daErrorMessage(raw: string | null | undefined): string {
  return przetlumaczBlad(raw, techniczny);
}

/** Wariant dla banera „nie udało się pobrać": null gdy brak błędu. */
export function hostingFetchErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const mapped = daErrorMessage(raw);
  return mapped === KOMUNIKAT_OPERACJI_OGOLNY ? HOSTING_FETCH_UNAVAILABLE : mapped;
}
