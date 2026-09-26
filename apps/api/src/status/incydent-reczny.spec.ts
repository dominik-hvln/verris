import { ProbeIngestService, isManualIncident } from './probe-ingest.service.js';
import { ProbesAdminService } from './probes-admin.service.js';

/** N-07 — incydent ogłoszony ręcznie nie znika sam przy pierwszej udanej próbie. */
function ingest(open: Record<string, unknown> | null) {
  const prisma = {
    serviceProbe: {
      findUnique: vi.fn().mockResolvedValue({ id: 'p1', serverId: 's1', isEnabled: true, kind: 'HTTPS', target: 'x' }),
      update: vi.fn().mockResolvedValue({}),
    },
    probeSample: { upsert: vi.fn().mockResolvedValue({}) },
    probeIncident: {
      findFirst: vi.fn().mockResolvedValue(open),
      update: vi.fn().mockResolvedValue({ id: 'i1', startedAt: new Date(), resolvedAt: new Date() }),
    },
  };
  const svc = new (ProbeIngestService as unknown as new (...a: unknown[]) => ProbeIngestService)(
    prisma,
    { record: vi.fn() },
    { enqueue: vi.fn() },
  );
  return { svc, prisma };
}

describe('N-07 incydent ręczny', () => {
  it('rozpoznaje incydent z panelu po composedBy', () => {
    expect(isManualIncident({ composedBy: 'admin-1', serverId: 's1' })).toBe(true);
    expect(isManualIncident({ consecutiveFailures: 2 })).toBe(false);
    expect(isManualIncident(null)).toBe(false);
  });

  it('udana próba zamyka incydent automatyczny, ale nie ręczny', async () => {
    const auto = ingest({ id: 'i1', detectionMeta: { consecutiveFailures: 2 } });
    await auto.svc.ingestSample('p1', { ok: true, latencyMs: 10 } as never);
    expect(auto.prisma.probeIncident.update).toHaveBeenCalled();

    const manual = ingest({ id: 'i2', detectionMeta: { composedBy: 'admin-1' } });
    await manual.svc.ingestSample('p1', { ok: true, latencyMs: 10 } as never);
    expect(manual.prisma.probeIncident.update).not.toHaveBeenCalled();
  });

  it('operator zamyka incydent z panelu — status, data i webhook „resolved”', async () => {
    const prisma = {
      probeIncident: {
        findUnique: vi.fn().mockResolvedValue({ id: 'i2', status: 'OPEN' }),
        update: vi.fn().mockResolvedValue({ id: 'i2', status: 'RESOLVED', title: 't', publicMessage: null }),
      },
    };
    const audit = { record: vi.fn() };
    const webhooks = { enqueue: vi.fn() };
    const svc = new (ProbesAdminService as unknown as new (...a: unknown[]) => ProbesAdminService)(
      prisma,
      audit,
      { invalidate: vi.fn() },
      webhooks,
    );
    await svc.updateIncident('i2', { status: 'RESOLVED' }, 'admin-1');
    expect(prisma.probeIncident.update.mock.calls[0][0].data).toMatchObject({ status: 'RESOLVED', resolvedAt: expect.any(Date) });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PROBE_INCIDENT_RESOLVED' }));
    expect(webhooks.enqueue.mock.calls[0][0]).toBe('INCIDENT_RESOLVED');
  });
});
