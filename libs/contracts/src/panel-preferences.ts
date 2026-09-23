/** Domyślne 4 kafelki w sidebarze panelu klienta. */
export const DEFAULT_SIDEBAR_QUICK_LINKS = [
  '/dashboard',
  '/dashboard/services',
  '/dashboard/billing',
  '/dashboard/domains',
] as const;

/** Dozwolone skróty do wyboru w ustawieniach (href musi być unikalny w zestawie 4). */
export const SIDEBAR_TILE_OPTIONS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/services', label: 'Serwery' },
  { href: '/dashboard/billing', label: 'Płatności' },
  { href: '/dashboard/domains', label: 'Domeny' },
  { href: '/dashboard/eco', label: 'Program EKO' },
  { href: '/dashboard/support', label: 'Centrum Pomocy' },
  { href: '/dashboard/settings', label: 'Ustawienia' },
  { href: '/dashboard/calculator', label: 'Kalkulator' },
] as const;

export type SidebarTileHref = (typeof SIDEBAR_TILE_OPTIONS)[number]['href'];

const ALLOWED = new Set<string>(SIDEBAR_TILE_OPTIONS.map((o) => o.href));

export function isSidebarTileHref(href: string): href is SidebarTileHref {
  return ALLOWED.has(href);
}

export function resolveSidebarQuickLinks(links: string[] | null | undefined): SidebarTileHref[] {
  const source = links?.length === 4 && links.every(isSidebarTileHref) ? links : [...DEFAULT_SIDEBAR_QUICK_LINKS];
  const unique = [...new Set(source)];
  if (unique.length === 4 && unique.every(isSidebarTileHref)) {
    return unique as SidebarTileHref[];
  }
  return [...DEFAULT_SIDEBAR_QUICK_LINKS];
}

/**
 * N-12 — flagi funkcji sterujące modułami panelu klienta. Brak flagi w bazie =
 * moduł działa jak dotąd (zgodnie z przełącznikiem NEXT_PUBLIC_FEATURE_*); flaga
 * założona przez operatora (Admin → Operacje produktowe) włącza/wyłącza moduł bez
 * przebudowy, globalnie, per plan, per klient albo procentowo.
 */
export const FLAGI_MODULOW = {
  'modul.eco': 'Punkty EKO',
  'modul.referral': 'Program partnerski',
  'modul.iam': 'Subkonta (IAM)',
} as const;
export type FlagaModulu = keyof typeof FLAGI_MODULOW;
