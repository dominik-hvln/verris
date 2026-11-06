import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service.js';

/** P5-06 (paczka 109) — „Wyloguj wszystkie inne urządzenia”: wszystkie aktywne sesje konta poza bieżącą. */
function zbuduj(count: number) {
  const prisma = { userSession: { updateMany: vi.fn(async () => ({ count })) } };
  const audit = { record: vi.fn(async () => undefined) };
  const n = {} as never;
  return { svc: new AuthService(prisma as never, n, n, n, n, n, audit as never, n, n, n, n, n, n), prisma, audit };
}

describe('AuthService.revokeOtherSessions', () => {
  it('unieważnia aktywne sesje konta oprócz bieżącej i zapisuje w dzienniku liczbę', async () => {
    const { svc, prisma, audit } = zbuduj(11);
    await expect(svc.revokeOtherSessions('u1', 'sess-ja')).resolves.toEqual({ ok: true, wylogowane: 11 });
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null, NOT: { id: 'sess-ja' } },
      data: { revokedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'SESSIONS_REVOKED_OTHERS', details: { wylogowane: 11 } }));
  });

  it('bez bieżącej sesji (np. sesja wsparcia) – odmowa zamiast wylogowania wszystkich', async () => {
    const { svc, prisma } = zbuduj(0);
    await expect(svc.revokeOtherSessions('u1', undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
  });
});
