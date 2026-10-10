import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ZawieszenieOperatoraService } from './zawieszenie-operatora.service.js';

/** F2.3 (D2/D3, 10.10) — zawieszenie przez operatora: numer zgłoszenia musi być zgłoszeniem właściciela usługi. */
describe('ZawieszenieOperatoraService', () => {
  const ID = 'ab12cd34-1111-4222-8333-444455556666';
  function serwis(zgloszenia: { id: string; userId: string }[] = [{ id: ID, userId: 'k1' }]) {
    const prisma = {
      subscription: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 's1' ? { id: 's1', userId: 'k1', status: 'ACTIVE' } : null)) },
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
    await svc.zawies({ subscriptionId: 's1', aktorUserId: 'op', reason: 'ABUSE', powod: ' phishing ', zgloszenie: '#ab12cd34' });
    expect(subs.suspend).toHaveBeenCalledWith({ subscriptionId: 's1', reason: 'ABUSE', note: 'phishing', actorUserId: 'op', zgloszenieId: ID });
  });

  it('zgłoszenie obcego klienta zatrzymuje zawieszenie przed węzłem; brak usługi → 404', async () => {
    const { svc, subs } = serwis([{ id: ID, userId: 'inny' }]);
    await expect(svc.zawies({ subscriptionId: 's1', aktorUserId: 'op', reason: 'ABUSE', zgloszenie: '#ab12cd34' })).rejects.toThrow(BadRequestException);
    await expect(svc.odwies({ subscriptionId: 'brak', aktorUserId: 'op' })).rejects.toThrow(NotFoundException);
    expect(subs.suspend).not.toHaveBeenCalled();
    expect(subs.unsuspend).not.toHaveBeenCalled();
  });

  it('odwieszenie: unsuspend z obciążeniem tylko, gdy wołający o nie poprosił', async () => {
    const { svc, subs } = serwis();
    await svc.odwies({ subscriptionId: 's1', aktorUserId: 'op', powod: 'klient usunął pliki' });
    expect(subs.unsuspend).toHaveBeenCalledWith({ subscriptionId: 's1', note: 'klient usunął pliki', chargeRenewal: undefined, actorUserId: 'op', zgloszenieId: null });
  });
});
