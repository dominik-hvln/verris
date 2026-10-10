import { SubscriptionsService } from './subscriptions.service.js';

/** Szczegóły usługi dla panelu nie niosą zaszyfrowanego hasła konta hostingowego. */
it('getForUser: konto bez daPasswordEnc, reszta danych zostaje', async () => {
  const svc = Object.create(SubscriptionsService.prototype) as SubscriptionsService;
  Object.assign(svc, {
    prisma: {
      subscription: {
        findFirst: vi.fn(async () => ({ id: 's1', plan: {}, account: { id: 'a1', daUsername: 'klient1', daPasswordEnc: 'enc:x', domain: 'firma.pl' } })),
      },
    },
  });
  const r = (await svc.getForUser('u1', 's1')) as { account: Record<string, unknown> };
  expect(r.account).toEqual({ id: 'a1', daUsername: 'klient1', domain: 'firma.pl' });
  expect(JSON.stringify(r)).not.toContain('enc:x');
});

/**
 * Przegląd F3.1 — powód blokady wysyłki i identyfikator operatora to notatka zespołu (D3: klient widzi „obsługa
 * Verris”, bez nazwiska i powodu wewnętrznego). Szczegóły usługi dla klienta niosą tylko fakt blokady (mailBlockedAt).
 */
it('getForUser: bez mailBlockedReason i mailBlockedById, z mailBlockedAt', async () => {
  const svc = Object.create(SubscriptionsService.prototype) as SubscriptionsService;
  const od = new Date('2026-10-10T10:00:00Z');
  Object.assign(svc, {
    prisma: {
      subscription: {
        findFirst: vi.fn(async () => ({
          id: 's1',
          plan: {},
          account: { id: 'a1', domain: 'firma.pl', daPasswordEnc: 'enc:x', mailBlockedAt: od, mailBlockedById: 'staff-l3', mailBlockedReason: 'Nadużycie #r1: notatka zespołu' },
        })),
      },
    },
  });
  const r = (await svc.getForUser('u1', 's1')) as { account: Record<string, unknown> };
  expect(r.account).toEqual({ id: 'a1', domain: 'firma.pl', mailBlockedAt: od });
  expect(JSON.stringify(r)).not.toMatch(/staff-l3|notatka zespołu/);
});
