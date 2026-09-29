import { BadRequestException } from '@nestjs/common';
import { MeStatusController } from './me-status.controller.js';
import { maintenanceVisibleWhere, StatusService, tytulIncydentuDlaKlienta } from './status.service.js';
import { ProductOpsAdminController } from '../product-ops/product-ops.admin.controller.js';

/** N-11 — ogłoszenia i okna serwisowe docierają do klienta i dają się prowadzić z panelu. */
describe('N-11 ogłoszenia i okna serwisowe', () => {
  const now = new Date('2026-10-01T10:00:00Z');

  it('okna widoczne: tylko zaplanowane/trwające, do 14 dni naprzód, globalne lub na serwerach klienta', () => {
    const w = maintenanceVisibleWhere(now, ['s1']);
    expect(w.status.in).toEqual(['SCHEDULED', 'IN_PROGRESS']);
    expect(w.scheduledEnd.gt).toEqual(now);
    expect(w.scheduledStart.lte.getTime() - now.getTime()).toBe(14 * 86400000);
    expect(w.OR).toEqual([{ serverId: null }, { serverId: { in: ['s1'] } }]);
    expect(maintenanceVisibleWhere(now)).not.toHaveProperty('OR');
  });

  it('klient dostaje ogłoszenia dla USER/wszystkich i okna swoich serwerów', async () => {
    const prisma = {
      account: { findMany: vi.fn(async () => [{ serverId: 's1' }, { serverId: 's1' }]) },
      productAnnouncement: {
        findMany: vi.fn(async () => [
          { id: 'a1', kind: 'PRODUCT_UPDATE', title: 'T', bodyMarkdown: 'B', publishedAt: now },
        ]),
      },
      maintenanceWindow: {
        findMany: vi.fn(async () => [
          { id: 'm1', serverId: 's1', title: 'PHP', publicMessage: null, status: 'SCHEDULED', scheduledStart: now, scheduledEnd: now, server: { name: 'poz-1' } },
        ]),
      },
    };
    const c = new MeStatusController(prisma as never, {} as never);
    const r = await c.noticesForCurrentUser({ userId: 'u1' });
    expect(r.announcements[0]).toMatchObject({ id: 'a1', title: 'T' });
    // White label (30.09): klient nie dostaje nazwy serwera, tylko informację, czy prace są globalne.
    expect(r.maintenance[0]).toMatchObject({ id: 'm1', calaPlatforma: false });
    expect(JSON.stringify(r)).not.toContain('poz-1');
    const annWhere = (prisma.productAnnouncement.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(annWhere.status).toBe('PUBLISHED');
    expect(annWhere.OR).toEqual([{ audienceRole: null }, { audienceRole: 'USER' }]);
    const mwWhere = (prisma.maintenanceWindow.findMany.mock.calls[0] as unknown as [{ where: { OR: unknown } }])[0].where;
    expect(mwWhere.OR).toEqual([{ serverId: null }, { serverId: { in: ['s1'] } }]);
  });

  function adminCtl(status: string) {
    const prisma = {
      maintenanceWindow: {
        findUnique: vi.fn(async () => ({ id: 'm1', status })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'm1', serverId: null, title: 'PHP', scheduledStart: now, scheduledEnd: now, ...data,
        })),
      },
    };
    const audit = { record: vi.fn(async () => undefined) };
    const webhooks = { enqueue: vi.fn(async () => undefined) };
    const st = { invalidate: vi.fn() };
    const c = new ProductOpsAdminController(prisma as never, audit as never, {} as never, webhooks as never, st as never);
    return { c, prisma, webhooks, st };
  }

  it('okno: zaplanowane → w toku ustawia startedAt, wysyła webhook i czyści cache statusu', async () => {
    const { c, prisma, webhooks, st } = adminCtl('SCHEDULED');
    await c.updateMaintenanceStatus({ userId: 'op' }, 'm1', { status: 'IN_PROGRESS' });
    const data = (prisma.maintenanceWindow.update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.status).toBe('IN_PROGRESS');
    expect(data.startedAt).toBeInstanceOf(Date);
    expect(webhooks.enqueue).toHaveBeenCalledWith('MAINTENANCE_UPDATED', expect.objectContaining({ status: 'IN_PROGRESS' }));
    expect(st.invalidate).toHaveBeenCalled();
  });

  it('okno: zakończonego nie da się odwołać, zaplanowanego nie da się „zakończyć”', async () => {
    await expect(adminCtl('COMPLETED').c.updateMaintenanceStatus({ userId: 'op' }, 'm1', { status: 'CANCELED' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(adminCtl('SCHEDULED').c.updateMaintenanceStatus({ userId: 'op' }, 'm1', { status: 'COMPLETED' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('incydenty dla klienta i na stronie statusu: bez adresu sondy i nazwy serwera, tytuł automatyczny zastąpiony', async () => {
    const incydent = {
      id: 'i1', severity: 'MAJOR', status: 'OPEN', title: 'DA_API probe failing for https://t1.verris.pl:2222',
      publicMessage: null, detectionMeta: null, startedAt: now, resolvedAt: null, probeId: 'p1',
      probe: { serverId: 's1', kind: 'DA_API', target: 'https://t1.verris.pl:2222', server: { id: 's1', name: 'TEST-NRB-01' } },
    };
    const st = new StatusService({ probeIncident: { findFirst: vi.fn(async () => incydent) } } as never);
    const c = new MeStatusController({ account: { findMany: vi.fn(async () => [{ serverId: 's1' }]) } } as never, st);
    const r = await c.listForCurrentUser({ userId: 'u1' });
    expect(r).toHaveLength(1);
    expect(JSON.stringify(r)).not.toMatch(/t1\.verris|2222|TEST-NRB|DA_API|probe/);
    expect(r[0].title).toContain('pracujemy nad tym');

    // Incydent wpisany ręcznie przez obsługę zostaje ze swoim tytułem.
    expect(tytulIncydentuDlaKlienta({ title: 'Awaria zasilania w DC', severity: 'MAJOR', detectionMeta: { composedBy: 'op' } })).toBe('Awaria zasilania w DC');
  });
});
