import { createHash } from 'node:crypto';
import { AccountDeletionService } from './account-deletion.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';

/**
 * P-02 — anonimizacja konta (art. 17): operacja nieodwracalna. Pilnujemy, co znika, co zostaje
 * (faktury), że subkonta tracą dostęp razem z właścicielem i że w dzienniku nie zostaje jawny e-mail.
 */
function stanowisko(opts: { juzZanonimizowany?: boolean; subkonta?: string[] } = {}) {
  const kolejnosc: string[] = [];
  const tx = {
    subscription: { update: jest.fn(async () => kolejnosc.push('sub')) },
    subscriptionEvent: { create: jest.fn(async () => ({})) },
    account: { updateMany: jest.fn(async () => kolejnosc.push('accounts-db')) },
    user: {
      update: jest.fn(async () => ({})),
      findMany: jest.fn(async () => (opts.subkonta ?? []).map((id) => ({ id }))),
    },
    paymentMethod: { deleteMany: jest.fn(async () => ({})) },
    walletAutoTopup: { deleteMany: jest.fn(async () => ({})) },
    accountDeletionRequest: { update: jest.fn(async () => ({})) },
    invoice: { deleteMany: jest.fn() },
  };
  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({
        id: 'u1', email: 'Jan@Firma.pl', firstName: 'Jan', anonymizedAt: opts.juzZanonimizowany ? new Date() : null,
      })),
    },
    subscription: { findMany: jest.fn(async () => [{ id: 's1' }]) },
    account: { findMany: jest.fn(async () => [{ id: 'a1', daUsername: 'jan1', serverId: 'n1' }]) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => {
      await fn(tx);
      kolejnosc.push('commit');
    }),
  };
  const suspend = jest.fn(async () => {
    kolejnosc.push('da-suspend');
    return { success: true };
  });
  const da = { getClientForServer: jest.fn(async () => ({ suspendAccount: suspend, suspendUser: suspend })) };
  const audit = { record: jest.fn(async () => undefined) };
  const mailer = { send: jest.fn(async () => undefined) };
  const svc = new AccountDeletionService(prisma as never, audit as never, da as never, mailer as never, { get: () => undefined } as never);
  return { svc, tx, prisma, audit, kolejnosc };
}

describe('AccountDeletionService.executeAnonymization (P-02)', () => {
  it('dane osobowe znikają, usługi anulowane, metody płatności usunięte; faktury zostają', async () => {
    const s = stanowisko();
    await s.svc.executeAnonymization('u1');
    const dane = (s.tx.user.update.mock.calls as unknown as [{ where: { id: string }; data: Record<string, unknown> }][])
      .find(([a]) => a.where.id === 'u1')![0].data;
    expect(dane).toMatchObject({
      email: 'deleted-u1@verris.local', firstName: null, lastName: null, nip: null, address: null,
      passwordHash: '', twoFactorSecret: null, stripeCustomerId: null,
    });
    expect(dane.anonymizedAt).toBeInstanceOf(Date);
    expect(s.tx.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' } }));
    expect(s.tx.paymentMethod.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(s.tx.invoice.deleteMany).not.toHaveBeenCalled();
  });

  it('subkonta: wyłączone, zanonimizowane i wylogowane razem z właścicielem', async () => {
    const s = stanowisko({ subkonta: ['sk1', 'sk2'] });
    await s.svc.executeAnonymization('u1');
    expect(s.tx.user.findMany).toHaveBeenCalledWith({ where: { customerOwnerId: 'u1' }, select: { id: true } });
    for (const id of ['sk1', 'sk2']) {
      const d = (s.tx.user.update.mock.calls as unknown as [{ where: { id: string }; data: Record<string, unknown> }][])
        .find(([a]) => a.where.id === id)![0].data;
      expect(d).toMatchObject({ email: `deleted-${id}@verris.local`, passwordHash: '', tokenVersion: { increment: 1 } });
      expect(d.subaccountDisabledAt).toBeInstanceOf(Date);
    }
  });

  it('dziennik: bez jawnego e-maila, tylko skrót; zawieszenie na serwerze dopiero po zapisie w bazie', async () => {
    const s = stanowisko();
    await s.svc.executeAnonymization('u1');
    const wpis = (s.audit.record.mock.calls as unknown as [{ details: Record<string, unknown> }][])[0][0];
    expect(JSON.stringify(wpis)).not.toMatch(/jan@firma\.pl/i);
    expect(wpis.details.previousEmailSha256).toBe(createHash('sha256').update('jan@firma.pl').digest('hex'));
    expect(s.kolejnosc.indexOf('commit')).toBeLessThan(s.kolejnosc.indexOf('da-suspend'));
  });

  it('drugi raz nic nie robi (idempotencja)', async () => {
    const s = stanowisko({ juzZanonimizowany: true });
    await s.svc.executeAnonymization('u1');
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
    expect(s.audit.record).not.toHaveBeenCalled();
  });
});

describe('JwtStrategy — subkonto zanonimizowanego lub zablokowanego właściciela', () => {
  const strategia = (owner: { anonymizedAt: Date | null; loginBlocked: boolean }) =>
    new JwtStrategy({ get: () => 'sekret-testowy' } as never, {
      user: {
        findUnique: jest.fn(async () => ({
          id: 'sk1', email: 'sk@firma.pl', role: 'USER', loginBlocked: false, anonymizedAt: null, tokenVersion: 0,
          customerOwnerId: 'u1', customerPermissions: [], subaccountDisabledAt: null, customerOwner: owner,
        })),
      },
    } as never);

  it('właściciel aktywny → subkonto działa w jego kontekście', async () => {
    await expect(strategia({ anonymizedAt: null, loginBlocked: false }).validate({ sub: 'sk1', email: '', role: 'USER' })).resolves.toMatchObject({
      userId: 'u1', principalUserId: 'sk1',
    });
  });
  it.each([
    ['zanonimizowany', { anonymizedAt: new Date(), loginBlocked: false }],
    ['zablokowany', { anonymizedAt: null, loginBlocked: true }],
  ])('właściciel %s → 401', async (_n, owner) => {
    await expect(strategia(owner).validate({ sub: 'sk1', email: '', role: 'USER' })).rejects.toThrow('Owner account is not available');
  });
});
