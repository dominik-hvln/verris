import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ZawieszenieOperatoraService } from './zawieszenie-operatora.service.js';

/** F2.3 (D2/D3, 10.10) — zawieszenie przez operatora: numer zgłoszenia musi być zgłoszeniem właściciela usługi. */
describe('ZawieszenieOperatoraService', () => {
  const ID = 'ab12cd34-1111-4222-8333-444455556666';
  function serwis(
    zgloszenia: { id: string; userId: string }[] = [{ id: ID, userId: 'k1' }],
    o: { powodZawieszenia?: string; aktor?: { role: string; uprawnienia?: string[] }; wlasciciel?: string } = {},
  ) {
    const prisma = {
      subscription: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 's1' ? { id: 's1', userId: 'k1', status: 'ACTIVE', user: { role: o.wlasciciel ?? 'USER' } } : null)) },
      subscriptionEvent: { findFirst: vi.fn(async () => (o.powodZawieszenia ? { details: { reason: o.powodZawieszenia } } : null)) },
      user: {
        findUnique: vi.fn(async (a: { select?: { staffRole?: unknown } }) =>
          a.select?.staffRole
            ? { staffRole: { id: 'r', name: 'r', permissions: o.aktor?.uprawnienia ?? [] } }
            : { role: o.aktor?.role ?? 'STAFF' },
        ),
      },
      ticket: {
        findMany: vi.fn(async ({ where }: { where: { userId: string; id: string | { startsWith: string } } }) =>
          zgloszenia.filter((t) => t.userId === where.userId && (typeof where.id === 'string' ? t.id === where.id : t.id.startsWith(where.id.startsWith))),
        ),
      },
    };
    const subs = { suspend: vi.fn(async () => ({ status: 'SUSPENDED' })), unsuspend: vi.fn(async () => ({ status: 'ACTIVE' })) };
    return { svc: new ZawieszenieOperatoraService(prisma as never, subs as never), subs, prisma };
  }

  it('skrót z panelu (#ab12cd34), sam skrót i pełne id → pełne id zgłoszenia; puste → null', async () => {
    const { svc } = serwis();
    await expect(svc.zgloszenieKlienta('k1', '#AB12CD34')).resolves.toBe(ID);
    await expect(svc.zgloszenieKlienta('k1', 'ab12cd34')).resolves.toBe(ID);
    await expect(svc.zgloszenieKlienta('k1', ID)).resolves.toBe(ID);
    await expect(svc.zgloszenieKlienta('k1', '  ')).resolves.toBeNull();
    await expect(svc.zgloszenieKlienta('k1', undefined)).resolves.toBeNull();
  });

  it('zgłoszenie innego klienta, nieistniejące, zły format albo niejednoznaczny skrót → 400', async () => {
    await expect(serwis().svc.zgloszenieKlienta('k2', '#ab12cd34')).rejects.toThrow(/Nie ma takiego zgłoszenia/);
    await expect(serwis().svc.zgloszenieKlienta('k1', '#ffffffff')).rejects.toThrow(BadRequestException);
    await expect(serwis().svc.zgloszenieKlienta('k1', '1234')).rejects.toThrow(/#ab12cd34/);
    await expect(serwis().svc.zgloszenieKlienta('k1', "ab12cd34' OR 1=1")).rejects.toThrow(BadRequestException);
    const dwa = serwis([{ id: ID, userId: 'k1' }, { id: 'ab12cd34-9999-4222-8333-444455556666', userId: 'k1' }]);
    await expect(dwa.svc.zgloszenieKlienta('k1', 'ab12cd34')).rejects.toThrow(/kilku zgłoszeń/);
  });

  it('zawieszenie: istniejący SubscriptionsService.suspend z powodem jako notatką i pełnym id zgłoszenia', async () => {
    const { svc, subs } = serwis();
    await svc.zawies({ subscriptionId: 's1', aktorUserId: 'op', aktorRola: 'STAFF', reason: 'ABUSE', powod: ' phishing ', zgloszenie: '#ab12cd34' });
    expect(subs.suspend).toHaveBeenCalledWith({ subscriptionId: 's1', reason: 'ABUSE', note: 'phishing', actorUserId: 'op', zgloszenieId: ID, bladWezlaPrzerywa: true });
  });

  it('zgłoszenie obcego klienta zatrzymuje zawieszenie przed węzłem; brak usługi → 404', async () => {
    const { svc, subs } = serwis([{ id: ID, userId: 'inny' }]);
    await expect(svc.zawies({ subscriptionId: 's1', aktorUserId: 'op', aktorRola: 'STAFF', reason: 'ABUSE', zgloszenie: '#ab12cd34' })).rejects.toThrow(BadRequestException);
    await expect(svc.odwies({ subscriptionId: 'brak', aktorUserId: 'op', aktorRola: 'STAFF' })).rejects.toThrow(NotFoundException);
    expect(subs.suspend).not.toHaveBeenCalled();
    expect(subs.unsuspend).not.toHaveBeenCalled();
  });

  it('przegląd: zawieszenie operatora przerywa się na błędzie węzła (bladWezlaPrzerywa), nie oznacza usługi jako zawieszonej', async () => {
    const { svc, subs } = serwis();
    await svc.zawies({ subscriptionId: 's1', aktorUserId: 'op', aktorRola: 'STAFF', reason: 'MANUAL_ADMIN' });
    expect(subs.suspend).toHaveBeenCalledWith(expect.objectContaining({ bladWezlaPrzerywa: true }));
  });

  it.each(['PAYMENT_FAILED', 'GRACE_EXPIRED'])(
    'przegląd: usługa zawieszona za brak płatności (%s) — STAFF bez BILLING_MANAGE nie odwiesza (403), z nim i ADMIN tak',
    async (powod) => {
      const l3 = serwis(undefined, { powodZawieszenia: powod, aktor: { role: 'STAFF', uprawnienia: ['SUBSCRIPTIONS_SUSPEND'] } });
      await expect(l3.svc.odwies({ subscriptionId: 's1', aktorUserId: 'op', aktorRola: 'STAFF', powod: 'klient obiecał zapłacić' })).rejects.toThrow(ForbiddenException);
      expect(l3.subs.unsuspend).not.toHaveBeenCalled();
      const l4 = serwis(undefined, { powodZawieszenia: powod, aktor: { role: 'STAFF', uprawnienia: ['SUBSCRIPTIONS_SUSPEND', 'BILLING_MANAGE'] } });
      await l4.svc.odwies({ subscriptionId: 's1', aktorUserId: 'op', aktorRola: 'STAFF' });
      expect(l4.subs.unsuspend).toHaveBeenCalled();
      const adm = serwis(undefined, { powodZawieszenia: powod, aktor: { role: 'ADMIN' } });
      await adm.svc.odwies({ subscriptionId: 's1', aktorUserId: 'adm', aktorRola: 'ADMIN' });
      expect(adm.subs.unsuspend).toHaveBeenCalled();
    },
  );

  it('przegląd: zawieszenie z innego powodu (nadużycie) — L3 odwiesza bez BILLING_MANAGE', async () => {
    const { svc, subs } = serwis(undefined, { powodZawieszenia: 'ABUSE', aktor: { role: 'STAFF', uprawnienia: ['SUBSCRIPTIONS_SUSPEND'] } });
    await svc.odwies({ subscriptionId: 's1', aktorUserId: 'op', aktorRola: 'STAFF' });
    expect(subs.unsuspend).toHaveBeenCalled();
  });

  it.each(['ADMIN', 'STAFF'])(
    'audyt Fal 2: STAFF nie zawiesza ani nie odwiesza usługi konta zespołu (%s) — 403 przed węzłem; ADMIN tak',
    async (wlasciciel) => {
      const { svc, subs } = serwis(undefined, { wlasciciel, aktor: { role: 'STAFF', uprawnienia: ['SUBSCRIPTIONS_SUSPEND'] } });
      await expect(svc.zawies({ subscriptionId: 's1', aktorUserId: 'op', aktorRola: 'STAFF', reason: 'ABUSE', powod: 'phishing na stronie' })).rejects.toThrow(/usługę konta zespołu/);
      await expect(svc.odwies({ subscriptionId: 's1', aktorUserId: 'op', aktorRola: 'STAFF', powod: 'wyjaśnione' })).rejects.toThrow(ForbiddenException);
      // Brak roli (np. wołający jej nie przekazał) = jak STAFF.
      await expect(svc.zawies({ subscriptionId: 's1', aktorUserId: 'op', aktorRola: undefined, reason: 'ABUSE' })).rejects.toThrow(ForbiddenException);
      expect(subs.suspend).not.toHaveBeenCalled();
      expect(subs.unsuspend).not.toHaveBeenCalled();
      const adm = serwis(undefined, { wlasciciel, aktor: { role: 'ADMIN' } });
      await adm.svc.zawies({ subscriptionId: 's1', aktorUserId: 'adm', aktorRola: 'ADMIN', reason: 'MANUAL_ADMIN' });
      await adm.svc.odwies({ subscriptionId: 's1', aktorUserId: 'adm', aktorRola: 'ADMIN' });
      expect(adm.subs.suspend).toHaveBeenCalled();
      expect(adm.subs.unsuspend).toHaveBeenCalled();
    },
  );

  it('odwieszenie: unsuspend z obciążeniem tylko, gdy wołający o nie poprosił', async () => {
    const { svc, subs } = serwis();
    await svc.odwies({ subscriptionId: 's1', aktorUserId: 'op', aktorRola: 'STAFF', powod: 'klient usunął pliki' });
    expect(subs.unsuspend).toHaveBeenCalledWith({ subscriptionId: 's1', note: 'klient usunął pliki', chargeRenewal: undefined, actorUserId: 'op', zgloszenieId: null });
  });
});
