import { NotFoundException } from '@nestjs/common';
import { DirectAdminApiError } from '@verris/directadmin-sdk';
import { AccountDeletionService, zwolnionaDomena } from './account-deletion.service.js';

/**
 * Usunięcie konta DA po anonimizacji (RODO). Konto w bazie idzie na DELETED (i zwalnia pojemność
 * węzła) tylko wtedy, gdy DA je usunął albo SAM powiedział, że użytkownika już nie ma.
 */
function stanowisko(blad?: Error) {
  const acc = { id: 'a1', daUsername: 'klient1', domain: 'klient.pl', serverId: 'n1', status: 'SUSPENDED', userId: 'u1', cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 10240 };
  const tx = { account: { update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 1 })) }, server: { update: vi.fn(async () => ({})) } };
  const prisma = {
    account: { findUnique: vi.fn(async () => acc) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const deleteAccount = vi.fn(async () => (blad ? Promise.reject(blad) : { success: true }));
  const da = { getClientForServer: vi.fn(async () => ({ deleteAccount })) };
  const audit = { record: vi.fn(async () => undefined) };
  const svc = new AccountDeletionService(prisma as never, audit as never, da as never, {} as never, { get: () => undefined } as never);
  return { svc, tx, da, audit };
}

describe('AccountDeletionService.purgeAccountOnDa', () => {
  it('DA usunął konto → DELETED, zwolnienie pojemności i zwolnienie domeny (oryginał w audycie)', async () => {
    const s = stanowisko();
    expect(await s.svc.purgeAccountOnDa('a1')).toEqual({ ok: true });
    expect(s.tx.account.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', status: { not: 'DELETED' } },
      data: { status: 'DELETED', domain: 'klient.pl~usuniete-a1' },
    });
    expect(s.tx.server.update).toHaveBeenCalled();
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ domain: 'klient.pl' }) }));
  });

  it('zwolniona domena nie jest prawidłową nazwą i nie koliduje z nową rejestracją tej samej domeny', () => {
    const zwolniona = zwolnionaDomena('klient.pl', 'a1');
    expect(zwolniona).not.toBe('klient.pl');
    expect(zwolniona.startsWith('klient.pl')).toBe(true);
    // Ten sam wzorzec co normaliseDomain w provisioning.service.ts — zwolniona domena go nie spełnia.
    expect(/^[a-z0-9.-]+\.[a-z]{2,}$/.test(zwolniona)).toBe(false);
    expect(zwolnionaDomena('klient.pl', 'a2')).not.toBe(zwolniona);
  });

  it('DA: użytkownik nie istnieje → też DELETED (idempotencja)', async () => {
    const s = stanowisko(new DirectAdminApiError('DirectAdmin API Error: User klient1 does not exist', 'User klient1 does not exist'));
    await s.svc.purgeAccountOnDa('a1');
    expect(s.tx.account.updateMany).toHaveBeenCalled();
  });

  it.each([
    ['węzeł zniknął z bazy', new NotFoundException('Server not found')],
    ['404 z proxy przed DA', new Error('Request failed with status code 404 Not Found')],
    ['polski błąd z „brak”', new DirectAdminApiError('DirectAdmin API Error: Brak uprawnień', 'Brak uprawnień')],
    ['sieć', new Error('connect ECONNREFUSED 10.0.0.1:2222')],
  ])('%s → konto NIE jest oznaczane jako usunięte (ponowienie w następnym przebiegu)', async (_n, blad) => {
    const s = stanowisko(blad);
    await s.svc.purgeAccountOnDa('a1');
    expect(s.tx.account.updateMany).not.toHaveBeenCalled();
    expect(s.tx.server.update).not.toHaveBeenCalled();
  });
});
