/** Runtime copy of @verris/contracts panel-preferences (API webpack externalizes contracts). */

const DEFAULT_SIDEBAR_QUICK_LINKS = [
  '/dashboard',
  '/dashboard/services',
  '/dashboard/billing',
  '/dashboard/domains',
] as const;

const ALLOWED = new Set<string>([
  '/dashboard',
  '/dashboard/services',
  '/dashboard/billing',
  '/dashboard/domains',
  '/dashboard/eco',
  '/dashboard/support',
  '/dashboard/settings',
  '/dashboard/calculator',
]);

export function isSidebarTileHref(href: string): boolean {
  return ALLOWED.has(href);
}

export function resolveSidebarQuickLinks(links: string[] | null | undefined): string[] {
  const source =
    links?.length === 4 && links.every(isSidebarTileHref) ? links : [...DEFAULT_SIDEBAR_QUICK_LINKS];
  const unique = [...new Set(source)];
  if (unique.length === 4 && unique.every(isSidebarTileHref)) {
    return unique;
  }
  return [...DEFAULT_SIDEBAR_QUICK_LINKS];
}
