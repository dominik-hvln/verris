import { NotFoundException } from '@nestjs/common';
import { DirectAdminApiError } from '@verris/directadmin-sdk';
import { AccountDeletionService } from './account-deletion.service.js';

/**
 * Usunięcie konta DA po anonimizacji (RODO). Konto w bazie idzie na DELETED (i zwalnia pojemność
 * węzła) tylko wtedy, gdy DA je usunął albo SAM powiedział, że użytkownika już nie ma.
 */
function stanowisko(blad?: Error) {
  const acc = { id: 'a1', daUsername: 'klient1', serverId: 'n1', status: 'SUSPENDED', userId: 'u1', cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 10240 };
  const tx = { account: { update: vi.fn(async () => ({})) }, server: { update: vi.fn(async () => ({})) } };
  const prisma = {
    account: { findUnique: vi.fn(async () => acc) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const deleteAccount = vi.fn(async () => (blad ? Promise.reject(blad) : { success: true }));
  const da = { getClientForServer: vi.fn(async () => ({ deleteAccount })) };
  const svc = new AccountDeletionService(prisma as never, { record: vi.fn(async () => undefined) } as never, da as never, {} as never, { get: () => undefined } as never);
  return { svc, tx, da };
}

describe('AccountDeletionService.purgeAccountOnDa', () => {
  it('DA usunął konto → DELETED i zwolnienie pojemności', async () => {
    const s = stanowisko();
    await s.svc.purgeAccountOnDa('a1');
    expect(s.tx.account.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: 'DELETED' } });
    expect(s.tx.server.update).toHaveBeenCalled();
  });

  it('DA: użytkownik nie istnieje → też DELETED (idempotencja)', async () => {
    const s = stanowisko(new DirectAdminApiError('DirectAdmin API Error: User klient1 does not exist', 'User klient1 does not exist'));
    await s.svc.purgeAccountOnDa('a1');
    expect(s.tx.account.update).toHaveBeenCalled();
  });

  it.each([
    ['węzeł zniknął z bazy', new NotFoundException('Server not found')],
    ['404 z proxy przed DA', new Error('Request failed with status code 404 Not Found')],
    ['polski błąd z „brak”', new DirectAdminApiError('DirectAdmin API Error: Brak uprawnień', 'Brak uprawnień')],
    ['sieć', new Error('connect ECONNREFUSED 10.0.0.1:2222')],
  ])('%s → konto NIE jest oznaczane jako usunięte (ponowienie w następnym przebiegu)', async (_n, blad) => {
    const s = stanowisko(blad);
    await s.svc.purgeAccountOnDa('a1');
    expect(s.tx.account.update).not.toHaveBeenCalled();
    expect(s.tx.server.update).not.toHaveBeenCalled();
  });
});
