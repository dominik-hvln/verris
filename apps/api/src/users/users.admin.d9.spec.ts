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

function serwis(cel: Record<string, unknown> = KLIENT, mailer = { send: vi.fn(async () => undefined) }, o: { zmianaEmaila?: boolean } = {}) {
  const audit = { record: vi.fn(async () => undefined) };
  const pusto = { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) };
  // Audyt Fal 2 — zmiany e-maila przez obsługę w ostatnich 24 h (dziennik ADMIN_CUSTOMER_EMAIL_CHANGED), z aktorem.
  const auditLog = { ...pusto, findMany: vi.fn(async (a: { where?: { action?: string } }) => (a.where?.action === 'ADMIN_CUSTOMER_EMAIL_CHANGED' && o.zmianaEmaila ? [{ actorUserId: 'zmienil' }] : [])) };
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
    auditLog,
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
    const r = await svc.resetCustomerPassword('u1', 'op1', { reason: 'zgłoszenie #12: nie pamięta hasła' }, {}, { role: Role.STAFF });
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
    expect(await svc.resetCustomerPassword('u1', 'op1', { reason: 'zgłoszenie #12' }, {}, { role: Role.STAFF })).toMatchObject({ linkWyslany: false });
  });

  it('audyt Fal 2: e-mail zmieniony przez obsługę w ostatnich 24 h — STAFF dostaje 403 WYMAGA_WNIOSKU, nic się nie zmienia; ADMIN i akceptacja wniosku przechodzą', async () => {
    const { svc, prisma, mailer } = serwis(KLIENT, undefined, { zmianaEmaila: true });
    const blad = await svc.resetCustomerPassword('u1', 'op1', { reason: 'zgłoszenie #12' }, {}, { role: Role.STAFF }).catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(ForbiddenException);
    expect((blad as ForbiddenException).getResponse()).toMatchObject({ code: 'WYMAGA_WNIOSKU', operacja: 'CUSTOMER_PASSWORD_RESET' });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', action: 'ADMIN_CUSTOMER_EMAIL_CHANGED' }) }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();

    await svc.resetCustomerPassword('u1', 'adm', { reason: 'zgłoszenie #12' }, {}, { role: Role.ADMIN });
    await svc.resetCustomerPassword('u1', 'kier', { reason: 'zgłoszenie #12' }, {}, { role: Role.STAFF, zWniosku: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('przegląd poprawek: wniosek o reset nie zatwierdza ten, kto w ostatnich 24 h zmienił e-mail klienta (STAFF); ADMIN tak', async () => {
    const { svc, prisma, mailer } = serwis(KLIENT, undefined, { zmianaEmaila: true });
    await expect(svc.resetCustomerPassword('u1', 'zmienil', { reason: 'zgłoszenie #12' }, {}, { role: Role.STAFF, zWniosku: true })).rejects.toThrow(
      /zatwierdza inna osoba/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
    await svc.resetCustomerPassword('u1', 'zmienil', { reason: 'zgłoszenie #12' }, {}, { role: Role.ADMIN });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('konto operatora — 403 (tylko konta klientów)', async () => {
    const { svc } = serwis({ ...KLIENT, role: Role.STAFF });
    await expect(svc.resetCustomerPassword('u1', 'adm', { reason: 'zgłoszenie #12' }, {}, { role: Role.ADMIN })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('audyt Fal 2 — zmiana e-maila klienta przez obsługę', () => {
  function zmiana() {
    const audit = { record: vi.fn(async () => undefined) };
    const mailer = { send: vi.fn(async () => undefined) };
    const prisma = {
      user: {
        findUnique: vi.fn(async (a: { where: { id?: string; email?: string } }) => (a.where.email ? null : { ...KLIENT, stripeCustomerId: null })),
        update: vi.fn(async () => ({})),
      },
    };
    const stripe = { isConfigured: () => false };
    const config = { get: () => 'https://panel.test' };
    const svc = new UsersAdminService(prisma as never, {} as never, audit as never, config as never, {} as never, stripe as never, mailer as never);
    return { svc, prisma, mailer, audit };
  }

  it('alert na STARY adres („Obsługa Verris”, bez nazwiska) i wylogowanie sesji (tokenVersion)', async () => {
    const { svc, prisma, mailer } = zmiana();
    await expect(svc.changeCustomerEmail('u1', 'op1', 'Nowy@Example.com', 'zgłoszenie #7', {})).resolves.toEqual({ ok: true, email: 'nowy@example.com' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { email: 'nowy@example.com', tokenVersion: { increment: 1 } } });
    await new Promise((r) => setImmediate(r));
    expect(mailer.send).toHaveBeenCalledTimes(1);
    const m = (mailer.send.mock.calls[0] as unknown as [{ to: string; text: string; userId: string; fromRole: string }])[0];
    expect(m).toMatchObject({ to: 'anna@test.pl', userId: 'u1', fromRole: 'SECURITY' });
    expect(m.text).toContain('Obsługa Verris zmieniła adres e-mail');
    expect(m.text).toContain('nowy@example.com');
    expect(m.text).not.toContain('op1');
  });
});
