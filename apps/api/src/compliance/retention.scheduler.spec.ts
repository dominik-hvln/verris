import type { Mock } from 'vitest';
import { RetentionScheduler } from './retention.scheduler.js';

/**
 * P-08 — retencja: co i po ilu dniach znika albo traci IP. Dotąd zero testów.
 */
const DAY = 24 * 60 * 60 * 1000;

function zbuduj(liczby: { login?: number; audit?: number; eksporty?: number; stripe?: number; ai?: number; kolejka?: number; zadania?: number } = {}) {
  const prisma = {
    loginAttempt: { deleteMany: vi.fn(async () => ({ count: liczby.login ?? 0 })) },
    auditLog: { updateMany: vi.fn(async () => ({ count: liczby.audit ?? 0 })) },
    stripeWebhookEvent: { deleteMany: vi.fn(async () => ({ count: liczby.stripe ?? 0 })) },
    aiInteractionLog: { deleteMany: vi.fn(async () => ({ count: liczby.ai ?? 0 })) },
    nodeTask: { updateMany: vi.fn(async () => ({ count: liczby.kolejka ?? 0 })) },
    // Audyt Fali 3 — wyniki zadań węzła (30 dni) i IP w szczegółach dziennika (~24 mies.).
    $executeRaw: vi.fn(async (t: TemplateStringsArray) => (t.join('?').includes('"NodeTask"') ? (liczby.zadania ?? 0) : 0)),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const dataExport = { expireDueExports: vi.fn(async () => liczby.eksporty ?? 0) };
  return { s: new RetentionScheduler(prisma as never, audit as never, dataExport as never), prisma, audit, dataExport };
}

const odcieciePrzed = (mock: Mock) => {
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

  it('audyt Fal 2: nagłówki podglądu kolejki poczty (MAIL_QUEUE list) czyszczone po dobie; zadanie zostaje', async () => {
    const t = zbuduj({ kolejka: 4 });
    await t.s.run();
    expect(odcieciePrzed(t.prisma.nodeTask.updateMany)).toBe(1);
    const arg = (t.prisma.nodeTask.updateMany.mock.calls as unknown[][])[0][0] as { where: Record<string, unknown>; data: object };
    expect(arg.where).toMatchObject({ kind: 'MAIL_QUEUE', outputLog: { not: null }, payload: { path: ['mode'], equals: 'list' } });
    expect(arg.data).toEqual({ outputLog: null });
    expect(t.prisma.nodeTask).not.toHaveProperty('deleteMany');
    expect((t.audit.record.mock.calls as unknown[][])[0]).toEqual([expect.objectContaining({ details: expect.objectContaining({ mailQueueHeadersPurged: 4 }) })]);
  });

  it('audyt Fali 3: wyniki zadań węzła z danymi osobowymi czyszczone po 30 dniach (bez zadań w toku i bez limitu kolejki)', async () => {
    const t = zbuduj({ zadania: 7 });
    await t.s.run();
    const wywolania = (t.prisma.$executeRaw.mock.calls as unknown as [TemplateStringsArray, ...unknown[]][]).map(([sz, ...v]) => ({ sql: sz.join('?'), v }));
    const zadania = wywolania.find((w) => w.sql.includes('UPDATE "NodeTask"'))!;
    expect(zadania.sql).toMatch(/"outputLog" = NULL/);
    expect(zadania.sql).toMatch(/'IP_BLOCKS', 'WAF_HITS', 'MAIL_LOG'/);
    expect(zadania.sql).toMatch(/'MAIL_QUEUE' AND COALESCE\("payload" ->> 'mode', ''\) <> 'limit'/);
    expect(zadania.sql).toMatch(/'NODE_SERVICES' AND "payload" ->> 'mode' = 'log'/);
    expect(zadania.sql).toMatch(/NOT IN \('QUEUED', 'RUNNING'\)/);
    const granica = zadania.v.find((x): x is Date => x instanceof Date)!;
    expect(Math.round((Date.now() - granica.getTime()) / DAY)).toBe(30);
    expect(zadania.v).toContainEqual(['ip', 'address', 'szukaj', 'filter']);
    expect((t.audit.record.mock.calls as unknown[][])[0]).toEqual([expect.objectContaining({ details: expect.objectContaining({ nodeTaskOutputsPurged: 7 }) })]);
  });

  it('audyt Fali 3: adres IP w szczegółach wpisów F3.2 znika po ~24 mies., jak kolumna ipAddress', async () => {
    const t = zbuduj();
    await t.s.run();
    const wywolania = (t.prisma.$executeRaw.mock.calls as unknown as [TemplateStringsArray, ...unknown[]][]).map(([sz, ...v]) => ({ sql: sz.join('?'), v }));
    const dziennik = wywolania.filter((w) => w.sql.includes('UPDATE "AuditLog"'));
    expect(dziennik.map((w) => [w.v[0], w.v[2]])).toEqual([
      ['ip', ['OPERATOR_ACCOUNT_VIEWED', 'OPERATOR_ACCOUNT_CHANGED', 'NODE_IP_UNBLOCK_QUEUED', 'NODE_IP_ALLOWLIST_CHANGED']],
      ['target', ['HOSTING_IP_UNBLOCK_QUEUED']],
    ]);
    for (const w of dziennik) expect(Math.round((Date.now() - (w.v[1] as Date).getTime()) / DAY)).toBe(720);
  });
});
