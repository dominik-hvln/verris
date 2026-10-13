import { AdminDashboardService } from './admin-dashboard.service.js';

/**
 * Audyt 13.10 (admin-dashboard.service.ts:overview, dane-klientow-bez-CUSTOMERS_VIEW) — pulpit z samym
 * DASHBOARD_VIEW (np. rola Marketing) zwracał e-maile, imiona i firmy klientów, domeny oraz tematy i ID zgłoszeń.
 */
const KLIENT = { id: 'k1', email: 'jan@klient.pl', firstName: 'Jan', lastName: 'Kowalski', companyName: 'Firma Jana' };
const TEMAT = 'TAJNY-TEMAT-ZGLOSZENIA';

function prisma(uprawnienia: string[]) {
  const zgloszenie = { id: 'tk-123456789', subject: TEMAT, slaResponseDueAt: new Date(Date.now() - 3_600_000), user: KLIENT };
  const usluga = {
    id: 's1', status: 'ACTIVE', provisioningStage: null, interval: 'MONTH', individualPrice: null, createdAt: new Date(),
    priceAmount: 45, currency: 'PLN', plan: { name: 'Pakiet', slug: 'pakiet' }, user: KLIENT,
    account: { domain: 'jan-klient.pl', server: null },
  };
  const zdarzenie = { id: 'a1', action: 'SUBSCRIPTION_CREATED', createdAt: new Date(), details: {}, actorUserId: null, user: KLIENT };
  return {
    user: {
      groupBy: vi.fn(async () => []), count: vi.fn(async () => 1),
      findMany: vi.fn(async () => []),
    },
    subscription: {
      groupBy: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      // Atrapa zwraca tylko pola, o które pyta zapytanie (jak Prisma przy `select`).
      findMany: vi.fn(async ({ select }: { select: Record<string, unknown> }) => [
        Object.fromEntries(Object.entries(usluga).filter(([k]) => k in select)),
      ]),
    },
    server: { groupBy: vi.fn(async () => []), findMany: vi.fn(async () => []) },
    ticket: { count: vi.fn(async () => 1), findMany: vi.fn(async () => [zgloszenie]) },
    walletTransaction: { groupBy: vi.fn(async () => []) },
    account: { count: vi.fn(async () => 1) },
    migrationRequest: { count: vi.fn(async () => 0) },
    platformSetting: { findUnique: vi.fn(async () => null) },
    auditLog: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => [zdarzenie]) },
    invoice: { aggregate: vi.fn(async () => ({ _count: { id: 0 }, _sum: {} })), findMany: vi.fn(async () => []) },
    stripeWebhookEvent: { count: vi.fn(async () => 0) },
    plan: { findMany: vi.fn(async () => []) },
    staffRoleAssignment: { findMany: vi.fn(async () => []) },
    $queryRaw: vi.fn(async () => []),
    __uprawnienia: uprawnienia,
  };
}

async function pulpit(zakres: { metryki: boolean; klienci: boolean; zgloszenia: boolean }) {
  const svc = new AdminDashboardService(prisma([]) as never);
  return JSON.stringify(await svc.overview(zakres));
}

describe('Pulpit operatora — zakres danych wg uprawnień', () => {
  it('bez CUSTOMERS_VIEW i TICKETS_VIEW: brak e-maili, imion, firm, domen, tematów i ID zgłoszeń', async () => {
    const out = await pulpit({ metryki: false, klienci: false, zgloszenia: false });
    for (const tajne of ['jan@klient.pl', 'Kowalski', 'Firma Jana', 'jan-klient.pl', TEMAT, 'tk-12345', '/customers/k1']) {
      expect(out).not.toContain(tajne);
    }
    expect(out).toContain('zgłoszeń po terminie SLA');
  });

  it('z TICKETS_VIEW bez CUSTOMERS_VIEW: temat zgłoszenia tak, klient nie', async () => {
    const out = await pulpit({ metryki: false, klienci: false, zgloszenia: true });
    expect(out).toContain(TEMAT);
    expect(out).not.toContain('Firma Jana');
    expect(out).not.toContain('jan@klient.pl');
  });

  it('z kompletem (ADMIN): klient, domena i zgłoszenie jak dotąd', async () => {
    const out = await pulpit({ metryki: true, klienci: true, zgloszenia: true });
    for (const jawne of ['jan@klient.pl', 'Firma Jana', 'jan-klient.pl', TEMAT, '/customers/k1']) expect(out).toContain(jawne);
  });
});
