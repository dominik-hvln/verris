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
