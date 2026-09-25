import { SubscriptionsService } from './subscriptions.service';

/** Szczegóły usługi dla panelu nie niosą zaszyfrowanego hasła konta hostingowego. */
it('getForUser: konto bez daPasswordEnc, reszta danych zostaje', async () => {
  const svc = Object.create(SubscriptionsService.prototype) as SubscriptionsService;
  Object.assign(svc, {
    prisma: {
      subscription: {
        findFirst: jest.fn(async () => ({ id: 's1', plan: {}, account: { id: 'a1', daUsername: 'klient1', daPasswordEnc: 'enc:x', domain: 'firma.pl' } })),
      },
    },
  });
  const r = (await svc.getForUser('u1', 's1')) as { account: Record<string, unknown> };
  expect(r.account).toEqual({ id: 'a1', daUsername: 'klient1', domain: 'firma.pl' });
  expect(JSON.stringify(r)).not.toContain('enc:x');
});
