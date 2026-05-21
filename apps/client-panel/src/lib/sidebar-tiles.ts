import type { ComponentType } from 'react';
import {
  Calculator,
  CreditCard,
  Globe,
  HelpCircle,
  LayoutDashboard,
  Leaf,
  Server,
  Settings,
} from 'lucide-react';
import {
  DEFAULT_SIDEBAR_QUICK_LINKS,
  resolveSidebarQuickLinks,
  type SidebarTileHref,
} from '@verris/contracts';
import { clientFeatures } from './client-features';

export type SidebarTileDef = {
  href: SidebarTileHref;
  name: string;
  icon: ComponentType<{ className?: string }>;
};

const TILE_DEFS: Record<SidebarTileHref, Omit<SidebarTileDef, 'href'>> = {
  '/dashboard': { name: 'Dashboard', icon: LayoutDashboard },
  '/dashboard/services': { name: 'Serwery', icon: Server },
  '/dashboard/billing': { name: 'Płatności', icon: CreditCard },
  '/dashboard/domains': { name: 'Domeny', icon: Globe },
  '/dashboard/eco': { name: 'Program EKO', icon: Leaf },
  '/dashboard/support': { name: 'Centrum Pomocy', icon: HelpCircle },
  '/dashboard/settings': { name: 'Ustawienia', icon: Settings },
  '/dashboard/calculator': { name: 'Kalkulator', icon: Calculator },
};

export function sidebarTilesFromLinks(links: string[] | null | undefined): SidebarTileDef[] {
  return resolveSidebarQuickLinks(links)
    .filter((href) => (href === '/dashboard/eco' ? clientFeatures.eco : true))
    .map((href) => ({
      href,
      ...TILE_DEFS[href],
    }));
}

export { DEFAULT_SIDEBAR_QUICK_LINKS, SIDEBAR_TILE_OPTIONS } from '@verris/contracts';
