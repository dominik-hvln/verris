import { ForbiddenException } from '@nestjs/common';
import { Role } from '@verris/database';
import { UsersAdminService } from './users.admin.service.js';
import { hashAuthToken } from '../auth/auth-token.util.js';

/**
 * D9 (decyzja 10.10) — historia logowań klienta dla STAFF z CUSTOMERS_VIEW (każdy odczyt w dzienniku) oraz
 * reset hasła, w którym operator nie widzi hasła: klient dostaje link (D3).
 */

const KLIENT = {
  id: 'u1',
  email: 'anna@test.pl',
  firstName: 'Anna',
  role: Role.USER,
  loginBlocked: false,
  loginBlockedReason: null,
  anonymizedAt: null,
  isTwoFactorEnabled: true,
};

function serwis(cel: Record<string, unknown> = KLIENT, mailer = { send: vi.fn(async () => undefined) }) {
  const audit = { record: vi.fn(async () => undefined) };
  const pusto = { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) };
  const tx = {
    update: vi.fn((a: unknown) => ({ op: 'user.update', a })),
    updateMany: vi.fn((a: unknown) => ({ op: 'token.updateMany', a })),
    create: vi.fn((a: unknown) => ({ op: 'token.create', a })),
  };
  const prisma = {
    user: { findUnique: vi.fn(async () => cel), update: tx.update },
    userAuthToken: { updateMany: tx.updateMany, create: tx.create },
    loginEvent: pusto,
    loginAttempt: pusto,
    auditLog: pusto,
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  const config = { get: () => 'https://panel.test' };
  const svc = new UsersAdminService(prisma as never, {} as never, audit as never, config as never, {} as never, {} as never, mailer as never);
  return { svc, audit, prisma, mailer };
}

describe('D9 — historia logowań klienta', () => {
  it('STAFF na koncie klienta: dane + wpis w dzienniku (zakładka logowania)', async () => {
    const { svc, audit } = serwis();
    const r = await svc.getLoginHistory('u1', { actorUserId: 'op1', actorRole: Role.STAFF });
    expect(r.user.id).toBe('u1');
    expect(audit.record).toHaveBeenCalledWith({
      action: 'OPERATOR_CUSTOMER_CARD_VIEWED',
      userId: 'u1',
      actorUserId: 'op1',
      details: { sekcja: 'logowania' },
    });
  });

  it('STAFF na koncie operatora — 403 bez wpisu (historia zespołu zostaje dla ADMIN-a)', async () => {
    const { svc, audit } = serwis({ ...KLIENT, role: Role.STAFF });
    await expect(svc.getLoginHistory('u1', { actorUserId: 'op1', actorRole: Role.STAFF })).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('ADMIN widzi każde konto, odczyt też w dzienniku', async () => {
    const { svc, audit } = serwis({ ...KLIENT, role: Role.STAFF });
    await svc.getLoginHistory('u1', { actorUserId: 'adm', actorRole: Role.ADMIN });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'adm', details: { sekcja: 'logowania' } }));
  });
});

describe('D9/D3 — reset hasła klienta przez operatora', () => {
  it('odpowiedź bez hasła; klient dostaje link z tokenem, który trafia do bazy jako hash', async () => {
    const { svc, prisma, mailer, audit } = serwis();
    const r = await svc.resetCustomerPassword('u1', 'op1', { reason: 'zgłoszenie #12: nie pamięta hasła' }, {});
    expect(r).toEqual({ ok: true, linkWyslany: true, email: 'anna@test.pl' });
    expect(JSON.stringify(r)).not.toMatch(/password|haslo/i);

    const wyslany = (mailer.send.mock.calls[0] as unknown as [{ to: string; text: string; userId: string }])[0];
    expect(wyslany.to).toBe('anna@test.pl');
    expect(wyslany.userId).toBe('u1');
    const token = /reset-password\?token=([^\s)"]+)/.exec(wyslany.text)?.[1];
    expect(token).toBeTruthy();
    expect(wyslany.text).toContain('Obsługa Verris');
    expect(wyslany.text).toMatch(/Weryfikacja dwuetapowa została wyłączona/);

    const zapis = prisma.userAuthToken.create.mock.calls[0]?.[0] as { data: { purpose: string; tokenHash: string; userId: string } };
    expect(zapis.data).toMatchObject({ userId: 'u1', purpose: 'PASSWORD_RESET', tokenHash: hashAuthToken(decodeURIComponent(token!)) });
    // Poprzednie linki unieważnione, stare hasło i 2FA wyczyszczone.
    expect(prisma.userAuthToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', purpose: 'PASSWORD_RESET', usedAt: null } }));
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ isTwoFactorEnabled: false, twoFactorSecret: null }) }),
    );
    // Przegląd Fali 2A — „dotychczasowe hasło już nie działa”, więc otwarte sesje (np. przejętego konta) też nie.
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tokenVersion: { increment: 1 } }) }));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_CUSTOMER_PASSWORD_RESET_BY_ADMIN', actorUserId: 'op1', details: { reason: 'zgłoszenie #12: nie pamięta hasła', linkDoKlienta: true } }),
    );
  });

  it('mail nie wyszedł — wynik to mówi (operator poleci „Nie pamiętasz hasła?”), bez wyjątku', async () => {
    const { svc } = serwis(KLIENT, { send: vi.fn(async () => Promise.reject(new Error('smtp'))) });
    expect(await svc.resetCustomerPassword('u1', 'op1', { reason: 'zgłoszenie #12' }, {})).toMatchObject({ linkWyslany: false });
  });

  it('konto operatora — 403 (tylko konta klientów)', async () => {
    const { svc } = serwis({ ...KLIENT, role: Role.STAFF });
    await expect(svc.resetCustomerPassword('u1', 'adm', { reason: 'zgłoszenie #12' }, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
});
