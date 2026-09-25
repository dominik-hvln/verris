import { RetentionScheduler } from './retention.scheduler';

/**
 * P-08 — retencja: co i po ilu dniach znika albo traci IP. Dotąd zero testów.
 */
const DAY = 24 * 60 * 60 * 1000;

function zbuduj(liczby: { login?: number; audit?: number; eksporty?: number; stripe?: number; ai?: number } = {}) {
  const prisma = {
    loginAttempt: { deleteMany: jest.fn(async () => ({ count: liczby.login ?? 0 })) },
    auditLog: { updateMany: jest.fn(async () => ({ count: liczby.audit ?? 0 })) },
    stripeWebhookEvent: { deleteMany: jest.fn(async () => ({ count: liczby.stripe ?? 0 })) },
    aiInteractionLog: { deleteMany: jest.fn(async () => ({ count: liczby.ai ?? 0 })) },
  };
  const audit = { record: jest.fn(async () => undefined) };
  const dataExport = { expireDueExports: jest.fn(async () => liczby.eksporty ?? 0) };
  return { s: new RetentionScheduler(prisma as never, audit as never, dataExport as never), prisma, audit, dataExport };
}

const odcieciePrzed = (mock: jest.Mock) => {
  const arg = (mock.mock.calls as unknown[][])[0][0] as { where: { createdAt: { lt: Date } } };
  return Math.round((Date.now() - arg.where.createdAt.lt.getTime()) / DAY);
};

describe('RetentionScheduler (P-08)', () => {
  it('progi: logowania 180 dni, IP w dzienniku ~24 mies., zdarzenia Stripe 90 dni, dziennik AI rok', async () => {
    const t = zbuduj();
    await t.s.run();
    expect(odcieciePrzed(t.prisma.loginAttempt.deleteMany)).toBe(180);
    expect(odcieciePrzed(t.prisma.auditLog.updateMany)).toBe(720);
    expect(odcieciePrzed(t.prisma.stripeWebhookEvent.deleteMany)).toBe(90);
    expect(odcieciePrzed(t.prisma.aiInteractionLog.deleteMany)).toBe(365);
    expect(t.dataExport.expireDueExports).toHaveBeenCalled();
  });

  it('dziennik audytu: czyści tylko IP i user-agent, wpis (akcja, cele) zostaje', async () => {
    const t = zbuduj();
    await t.s.run();
    const arg = (t.prisma.auditLog.updateMany.mock.calls as unknown[][])[0][0] as unknown as { where: { OR: unknown[] }; data: object };
    expect(arg.data).toEqual({ ipAddress: null, userAgent: null });
    expect(arg.where.OR).toHaveLength(2);
    expect(t.prisma.auditLog).not.toHaveProperty('deleteMany');
  });

  it('coś usunięto → jeden wpis RETENTION_PURGE z liczbami; nic → bez wpisu', async () => {
    const t = zbuduj({ login: 3, eksporty: 1 });
    await t.s.run();
    expect(t.audit.record).toHaveBeenCalledTimes(1);
    expect((t.audit.record.mock.calls as unknown[][])[0]).toEqual([
      expect.objectContaining({
        details: expect.objectContaining({ loginAttemptsPurged: 3, exportsExpired: 1, auditLogIpsAnonymized: 0 }),
      }),
    ]);
    const pusto = zbuduj();
    await pusto.s.run();
    expect(pusto.audit.record).not.toHaveBeenCalled();
  });
});
