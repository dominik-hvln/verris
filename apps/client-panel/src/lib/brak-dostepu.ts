import { canAccessDashboardRoute, type ClientNavContext } from './client-nav-access';

/**
 * P3-08 — wejście z adresu na stronę, do której subkonto nie ma uprawnienia, kończyło się cichym przekierowaniem na
 * pulpit. Teraz przekierowanie niesie ścieżkę w parametrze, a pulpit pokazuje komunikat „Nie masz uprawnienia do …”.
 * Wspólne dla middleware (wejście z adresu) i layoutu (nawigacja w przeglądarce).
 */
export const PARAM_BRAK_DOSTEPU = 'brak_dostepu';

export function adresBrakuDostepu(sciezka: string): string {
  return `/dashboard?${PARAM_BRAK_DOSTEPU}=${encodeURIComponent(sciezka)}`;
}

/** Od najdłuższego prefiksu (np. /dashboard/services/new przed /dashboard/services). Nazwy jak w menu panelu. */
const SEKCJE: Array<[string, string]> = [
  ['/dashboard/services/new', 'zamawiania nowych usług'],
  ['/dashboard/domains/buy', 'zakupu domen'],
  ['/dashboard/billing', 'Płatności'],
  ['/dashboard/iam', 'IAM i subkont'],
  ['/dashboard/api-tokens', 'API i integracji'],
  ['/dashboard/referral', 'Programu poleceń'],
  ['/dashboard/eco', 'Programu EKO'],
  ['/dashboard/beta', 'Testów (beta)'],
  ['/dashboard/reseller', 'Resellera (white-label)'],
  ['/dashboard/calculator', 'Kalkulatora'],
  ['/dashboard/migrations', 'Migracji'],
  ['/dashboard/autoscaling', 'Autoskalowania'],
  ['/dashboard/addons', 'Dodatków'],
  ['/dashboard/services', 'Usług'],
  ['/dashboard/domains', 'Domen'],
  ['/dashboard/dns', 'DNS'],
  ['/dashboard/email', 'Poczty'],
  ['/dashboard/file-manager', 'Menedżera plików'],
  ['/dashboard/ftp', 'FTP'],
  ['/dashboard/cron', 'Zadań cron'],
  ['/dashboard/backups', 'Kopii zapasowych'],
  ['/dashboard/databases', 'Baz danych'],
  ['/dashboard/ssl', 'Certyfikatów SSL'],
  ['/dashboard/support', 'Pomocy i zgłoszeń'],
  ['/dashboard/vps', 'VPS / Cloud'],
  ['/dashboard/php', 'Ustawień PHP'],
  ['/dashboard/apps', 'Instalatora aplikacji'],
];

/** Nazwa sekcji w dopełniaczu („Nie masz uprawnienia do …”); nieznana ścieżka → „tej strony”. */
export function nazwaSekcji(sciezka: string): string {
  const s = sciezka.split(/[?#]/)[0] ?? '';
  return SEKCJE.find(([p]) => s === p || s.startsWith(`${p}/`))?.[1] ?? 'tej strony';
}

/**
 * Treść komunikatu albo null (brak parametru, adres spoza panelu, strona jednak dostępna — np. uprawnienie nadane
 * po przekierowaniu). Subkonto: prośba do właściciela; konto rozliczane poza Verris (PB-28): bez tej prośby.
 */
export function komunikatBrakuDostepu(sciezka: string | null | undefined, ctx: ClientNavContext | null): string | null {
  if (!sciezka || !sciezka.startsWith('/dashboard/') || sciezka.startsWith('//')) return null;
  if (ctx && canAccessDashboardRoute(sciezka, ctx)) return null;
  const sekcja = nazwaSekcji(sciezka);
  return ctx?.isSubaccount
    ? `Nie masz uprawnienia do ${sekcja}. Poproś właściciela konta o dostęp.`
    : `Nie masz dostępu do ${sekcja} na tym koncie.`;
}
