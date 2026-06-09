import type { ComponentType } from 'react';
import { Calculator } from 'lucide-react';
import {
  VerrisDomenyIcon,
  VerrisEkoIcon,
  VerrisPortfelIcon,
  VerrisSerweryIcon,
  VerrisStatystykiIcon,
  VerrisSupportIcon,
  VerrisUstawieniaIcon,
} from '@/components/icons';
import {
  DEFAULT_SIDEBAR_QUICK_LINKS,
  resolveSidebarQuickLinks,
  type SidebarTileHref,
} from '@verris/contracts';
import { clientFeatures } from './client-features';
import {
  canAccessDashboardRoute,
  type ClientNavContext,
} from './client-nav-access';

export type SidebarTileDef = {
  href: SidebarTileHref;
  name: string;
  icon: ComponentType<{ className?: string }>;
};

const TILE_DEFS: Record<SidebarTileHref, Omit<SidebarTileDef, 'href'>> = {
  '/dashboard': { name: 'Dashboard', icon: VerrisStatystykiIcon },
  '/dashboard/services': { name: 'Serwery', icon: VerrisSerweryIcon },
  '/dashboard/billing': { name: 'Płatności', icon: VerrisPortfelIcon },
  '/dashboard/domains': { name: 'Domeny', icon: VerrisDomenyIcon },
  '/dashboard/eco': { name: 'Program EKO', icon: VerrisEkoIcon },
  '/dashboard/support': { name: 'Centrum Pomocy', icon: VerrisSupportIcon },
  '/dashboard/settings': { name: 'Ustawienia', icon: VerrisUstawieniaIcon },
  '/dashboard/calculator': { name: 'Kalkulator', icon: Calculator },
};

export function sidebarTilesFromLinks(
  links: string[] | null | undefined,
  nav?: ClientNavContext | null,
): SidebarTileDef[] {
  return resolveSidebarQuickLinks(links)
    .filter((href) => (href === '/dashboard/eco' ? clientFeatures.eco : true))
    .filter((href) => !nav || canAccessDashboardRoute(href, nav))
    .map((href) => ({
      href,
      ...TILE_DEFS[href],
    }));
}

export { DEFAULT_SIDEBAR_QUICK_LINKS, SIDEBAR_TILE_OPTIONS } from '@verris/contracts';
