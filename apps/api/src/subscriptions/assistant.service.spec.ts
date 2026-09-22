import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AssistantService } from './assistant.service';

/** PB-17 — naprawy asystenta: tylko odwracalne, z audytem, cofnięcie z danych audytu. */
function setup(opts: { report?: unknown; log?: unknown; undone?: unknown } = {}) {
  const prisma = {
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      findFirst: jest.fn().mockImplementation(({ where }: { where: { action: string } }) =>
        Promise.resolve(where.action === 'ASSISTANT_FIX_APPLIED' ? (opts.log ?? null) : (opts.undone ?? null)),
      ),
    },
  };
  const audit = { record: jest.fn() };
  const da = { createHostingDnsRecord: jest.fn().mockResolvedValue({ ok: true }), deleteHostingDnsRecord: jest.fn().mockResolvedValue({ ok: true }) };
  const deliverability = { forSubscription: jest.fn().mockResolvedValue(opts.report) };
  const svc = new (AssistantService as unknown as new (...a: unknown[]) => AssistantService)(prisma, audit, da, deliverability, {});
  return { svc, prisma, audit, da };
}

const report = (suggestion: unknown, usesPlatformDns: boolean | null = true) => ({
  domain: 'firma.pl',
  usesPlatformDns,
  checks: [{ key: 'spf', status: 'fail', detail: '', suggestion }],
});
const old = { name: 'firma.pl.', type: 'TXT', value: '"v=spf1 include:_spf.verris.pl ~all"' };

describe('PB-17 AssistantService — naprawy', () => {
  it('dodaje rekord i zapisuje wpis audytu z danymi do cofnięcia', async () => {
    const { svc, da, prisma } = setup({ report: report({ host: '@', type: 'TXT', value: 'v=spf1 a mx ~all' }) });
    await expect(svc.applyFix('s1', 'u1', 'u1', 'spf')).resolves.toMatchObject({ ok: true, undoId: 'log-1' });
    expect(da.createHostingDnsRecord).toHaveBeenCalledWith('s1', 'u1', { domain: 'firma.pl', name: '@', type: 'TXT', value: 'v=spf1 a mx ~all', ttl: 3600 });
    expect(da.deleteHostingDnsRecord).not.toHaveBeenCalled();
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'ASSISTANT_FIX_APPLIED', userId: 'u1', details: { subscriptionId: 's1', removed: null } });
  });

  it('poprawa istniejącego rekordu: najpierw nowy, potem usunięcie starego', async () => {
    const { svc, da } = setup({ report: report({ host: '@', type: 'TXT', value: 'v=spf1 a mx ~all', replaces: old }) });
    await svc.applyFix('s1', 'u1', 'u1', 'spf');
    expect(da.createHostingDnsRecord.mock.invocationCallOrder[0]).toBeLessThan(da.deleteHostingDnsRecord.mock.invocationCallOrder[0]);
    expect(da.deleteHostingDnsRecord).toHaveBeenCalledWith('s1', 'u1', { domain: 'firma.pl', ...old });
  });

  it('odmawia, gdy DNS domeny jest u innego dostawcy albo rekord jest tylko do skopiowania', async () => {
    const ext = setup({ report: report({ host: '@', type: 'TXT', value: 'x' }, false) });
    await expect(ext.svc.applyFix('s1', 'u1', 'u1', 'spf')).rejects.toBeInstanceOf(BadRequestException);
    const copy = setup({ report: report({ host: '@', type: 'TXT', value: 'x', inZone: true }) });
    await expect(copy.svc.applyFix('s1', 'u1', 'u1', 'spf')).rejects.toBeInstanceOf(BadRequestException);
    expect(ext.da.createHostingDnsRecord).not.toHaveBeenCalled();
  });

  const applied = (over: Record<string, unknown> = {}) => ({
    id: 'log-1',
    createdAt: new Date(),
    details: { subscriptionId: 's1', key: 'spf', domain: 'firma.pl', created: { name: '@', type: 'TXT', value: 'v=spf1 a mx ~all' }, removed: old },
    ...over,
  });

  it('cofnięcie przywraca stary rekord i usuwa dodany — z danych audytu', async () => {
    const { svc, da, audit } = setup({ log: applied() });
    await expect(svc.undoFix('s1', 'u1', 'u1', 'log-1')).resolves.toEqual({ ok: true });
    expect(da.createHostingDnsRecord).toHaveBeenCalledWith('s1', 'u1', { domain: 'firma.pl', ...old, ttl: 3600 });
    expect(da.deleteHostingDnsRecord).toHaveBeenCalledWith('s1', 'u1', { domain: 'firma.pl', name: '@', type: 'TXT', value: 'v=spf1 a mx ~all' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ASSISTANT_FIX_UNDONE', details: expect.objectContaining({ appliedId: 'log-1' }) }));
  });

  it('cudza usługa, podwójne cofnięcie i stara poprawka są odrzucane', async () => {
    await expect(setup({ log: applied() }).svc.undoFix('INNA', 'u1', 'u1', 'log-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ log: null }).svc.undoFix('s1', 'u1', 'u1', 'log-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ log: applied(), undone: { id: 'u' } }).svc.undoFix('s1', 'u1', 'u1', 'log-1')).rejects.toBeInstanceOf(ConflictException);
    const stale = setup({ log: applied({ createdAt: new Date(Date.now() - 8 * 86_400_000) }) });
    await expect(stale.svc.undoFix('s1', 'u1', 'u1', 'log-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(stale.da.deleteHostingDnsRecord).not.toHaveBeenCalled();
  });
});
