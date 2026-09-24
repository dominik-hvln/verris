import { DEFAULT_SIDEBAR_QUICK_LINKS } from '@verris/contracts';
import { sidebarTilesFromLinks } from './sidebar-tiles';

/**
 * X-05 — kafelki skrótów w menu bocznym.
 *
 * CO PILNUJE. Kafelek to link, więc podlega tym samym uprawnieniom co trasa:
 * subkonto bez `BILLING_*` nie może dostać kafelka „Płatności" (middleware i tak
 * odbije je na `/dashboard`, ale klient widziałby martwy przycisk). Z drugiej
 * strony właściciel ma zobaczyć wszystkie swoje cztery skróty — nic nie może
 * zniknąć po cichu, a zepsuta preferencja ma wrócić do domyślnych, nie do pustki.
 */

const hrefs = (tiles: { href: string }[]) => tiles.map((t) => t.href);

describe('X-05 sidebarTilesFromLinks', () => {
  it('brak lub zepsuta preferencja → cztery domyślne kafelki, każdy z nazwą i ikoną', () => {
    for (const links of [null, undefined, [], ['/dashboard/nie-istnieje', '/x', '/y', '/z']]) {
      const tiles = sidebarTilesFromLinks(links);
      expect(hrefs(tiles)).toEqual([...DEFAULT_SIDEBAR_QUICK_LINKS]);
      for (const t of tiles) {
        expect(t.name).toBeTruthy();
        expect(t.icon).toBeTruthy();
      }
    }
  });

  it('właściciel widzi dokładnie swoje cztery skróty w swojej kolejności', () => {
    const links = ['/dashboard/support', '/dashboard/billing', '/dashboard/calculator', '/dashboard/settings'];
    const owner = { isSubaccount: false, customerPermissions: null };
    expect(hrefs(sidebarTilesFromLinks(links, owner))).toEqual(links);
  });

  it('subkonto bez uprawnień do płatności nie dostaje kafelka „Płatności"', () => {
    const sub = { isSubaccount: true, customerPermissions: ['SERVICES_READ'] };
    const tiles = hrefs(sidebarTilesFromLinks(null, sub));
    expect(tiles).not.toContain('/dashboard/billing');
    expect(tiles).not.toContain('/dashboard/domains');
    expect(tiles).toEqual(['/dashboard', '/dashboard/services']);
  });

  it('subkonto nie dostaje narzędzi tylko dla właściciela (kalkulator, EKO)', () => {
    const links = ['/dashboard', '/dashboard/eco', '/dashboard/calculator', '/dashboard/settings'];
    const sub = { isSubaccount: true, customerPermissions: ['BILLING_READ'] };
    expect(hrefs(sidebarTilesFromLinks(links, sub))).toEqual(['/dashboard', '/dashboard/settings']);
  });
});
