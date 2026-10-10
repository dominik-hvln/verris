import { SearchService, typyDozwolone, UPRAWNIENIA_WYSZUKIWARKI } from './search.service.js';

/**
 * 10.10 (plan E, patch 5) — wyszukiwarka zwraca tylko typy, do których operator ma uprawnienie; węzły,
 * zgłoszenia i migracje dochodzą do klientów, usług, domen i faktur.
 */
function stanowisko(uprawnienia: string[]) {
  const prisma = {
    user: {
      findUnique: vi.fn(async () => ({ staffRole: { id: 'r', name: 'r', permissions: uprawnienia } })),
      findMany: vi.fn(async () => [{ id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', lastName: null, companyName: null }]),
    },
    account: { findMany: vi.fn(async () => []) },
    subscription: { findMany: vi.fn(async () => []) },
    invoice: { findMany: vi.fn(async () => [{ id: 'f1', number: 'FV/1/2026', userId: 'u1' }]) },
    server: { findMany: vi.fn(async () => [{ id: 'n1', name: 't1', hostname: 't1.verris.net', ipAddress: '10.0.0.1', status: 'ACTIVE' }]) },
    ticket: { findMany: vi.fn(async () => [{ id: 'abcd1234-0000', subject: 'Nie działa poczta', userId: 'u1', user: { email: 'jan@firma.pl' } }]) },
    migrationRequest: { findMany: vi.fn(async () => [{ id: 'm1', targetDomain: 'sklep.pl', status: 'ATTENTION', userId: 'u1' }]) },
  };
  return { svc: new SearchService(prisma as never), prisma };
}

describe('SearchService — typy według uprawnień', () => {
  it('admin: wszystkie typy, węzeł ze statusem i linkiem do karty', async () => {
    const s = stanowisko([]);
    const r = await s.svc.search('t1', { role: 'ADMIN', userId: 'a' });
    expect(r.pominiete).toEqual([]);
    expect(new Set(r.results.map((x) => x.type))).toEqual(new Set(['user', 'invoice', 'node', 'ticket', 'migration']));
    expect(r.results.find((x) => x.type === 'node')).toMatchObject({ title: 't1', href: '/nodes/n1', status: 'ACTIVE', subtitle: 'Węzeł · t1.verris.net · 10.0.0.1' });
    expect(r.results.find((x) => x.type === 'ticket')).toMatchObject({ subtitle: 'Zgłoszenie #abcd1234 · jan@firma.pl', href: '/customers/u1?sekcja=zgloszenia' });
    expect(r.results.find((x) => x.type === 'migration')).toMatchObject({ href: '/migrations/m1', subtitle: 'Migracja · wymaga uwagi' });
    expect(s.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('operator floty (NODES_VIEW): tylko węzły, bez zapytań o klientów; pominięte typy w odpowiedzi', async () => {
    const s = stanowisko(['NODES_VIEW']);
    const r = await s.svc.search('t1', { role: 'STAFF', userId: 'op' });
    expect(r.results.map((x) => x.type)).toEqual(['node']);
    expect(r.pominiete).toEqual(['user', 'service', 'domain', 'invoice', 'ticket', 'migration']);
    expect(s.prisma.user.findMany).not.toHaveBeenCalled();
    expect(s.prisma.invoice.findMany).not.toHaveBeenCalled();
    expect(s.prisma.server.findMany).toHaveBeenCalled();
  });

  it('uprawnienia liczone dla principalUserId (jak w StaffPermissionsGuard)', async () => {
    const s = stanowisko(['TICKETS_VIEW']);
    await s.svc.search('poczta', { role: 'STAFF', userId: 'sub', principalUserId: 'op' });
    expect(s.prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'op' } }));
  });

  it('faktura prowadzi do strony faktury (BILLING_VIEW); z samym CUSTOMERS_VIEW — do rozliczeń klienta', async () => {
    const r = await stanowisko(['BILLING_VIEW']).svc.search('FV/1', { role: 'STAFF', userId: 'op' });
    expect(r.results).toEqual([expect.objectContaining({ type: 'invoice', href: '/invoices/f1' })]);
    const zKlientami = await stanowisko(['CUSTOMERS_VIEW']).svc.search('FV/1', { role: 'STAFF', userId: 'op' });
    expect(zKlientami.results.find((x) => x.type === 'invoice')?.href).toBe('/customers/u1?sekcja=rozliczenia');
    const admin = await stanowisko([]).svc.search('FV/1', { role: 'ADMIN', userId: 'a' });
    expect(admin.results.find((x) => x.type === 'invoice')?.href).toBe('/invoices/f1');
  });

  it('zgłoszenie z samym TICKETS_VIEW prowadzi do listy zgłoszeń, nie do karty klienta (CUSTOMERS_VIEW)', async () => {
    const r = await stanowisko(['TICKETS_VIEW']).svc.search('poczta', { role: 'STAFF', userId: 'op' });
    expect(r.results).toEqual([expect.objectContaining({ type: 'ticket', href: '/tickets' })]);
    const zKlientami = await stanowisko(['TICKETS_VIEW', 'CUSTOMERS_VIEW']).svc.search('poczta', { role: 'STAFF', userId: 'op' });
    expect(zKlientami.results.find((x) => x.type === 'ticket')?.href).toBe('/customers/u1?sekcja=zgloszenia');
  });

  it('zgłoszenie po numerze „#abcd1234” szuka po początku ID; zwykły tekst — tylko po temacie', async () => {
    const s = stanowisko(['TICKETS_VIEW']);
    await s.svc.search('#ABCD1234', { role: 'STAFF', userId: 'op' });
    expect(s.prisma.ticket.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { OR: [{ subject: { contains: '#ABCD1234', mode: 'insensitive' } }, { id: { startsWith: 'abcd1234' } }] } }),
    );
    await s.svc.search('poczta', { role: 'STAFF', userId: 'op' });
    expect(s.prisma.ticket.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { OR: [{ subject: { contains: 'poczta', mode: 'insensitive' } }] } }));
  });

  it('krótkie zapytanie — bez zapytań do bazy, ale z listą pominiętych typów', async () => {
    const s = stanowisko(['NODES_VIEW']);
    expect(await s.svc.search('t', { role: 'STAFF', userId: 'op' })).toEqual({ results: [], pominiete: ['user', 'service', 'domain', 'invoice', 'ticket', 'migration'] });
    expect(s.prisma.server.findMany).not.toHaveBeenCalled();
  });

  it('typyDozwolone i lista uprawnień wejścia do endpointu', () => {
    expect([...typyDozwolone(false, ['SUBSCRIPTIONS_MANAGE'])]).toEqual(['service', 'domain']);
    expect(typyDozwolone(false, ['DASHBOARD_VIEW']).size).toBe(0);
    expect(typyDozwolone(true, []).size).toBe(7);
    expect([...UPRAWNIENIA_WYSZUKIWARKI].sort()).toEqual(
      ['BILLING_VIEW', 'CUSTOMERS_VIEW', 'MIGRATIONS_MANAGE', 'NODES_VIEW', 'SUBSCRIPTIONS_MANAGE', 'TICKETS_VIEW'].sort(),
    );
  });
});
