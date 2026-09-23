import { BadRequestException } from '@nestjs/common';
import { MeStatusController } from './me-status.controller';
import { maintenanceVisibleWhere } from './status.service';
import { ProductOpsAdminController } from '../product-ops/product-ops.admin.controller';

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
      account: { findMany: jest.fn(async () => [{ serverId: 's1' }, { serverId: 's1' }]) },
      productAnnouncement: {
        findMany: jest.fn(async () => [
          { id: 'a1', kind: 'PRODUCT_UPDATE', title: 'T', bodyMarkdown: 'B', publishedAt: now },
        ]),
      },
      maintenanceWindow: {
        findMany: jest.fn(async () => [
          { id: 'm1', title: 'PHP', publicMessage: null, status: 'SCHEDULED', scheduledStart: now, scheduledEnd: now, server: { name: 'poz-1' } },
        ]),
      },
    };
    const c = new MeStatusController(prisma as never, {} as never);
    const r = await c.noticesForCurrentUser({ userId: 'u1' });
    expect(r.announcements[0]).toMatchObject({ id: 'a1', title: 'T' });
    expect(r.maintenance[0]).toMatchObject({ id: 'm1', serverName: 'poz-1' });
    const annWhere = (prisma.productAnnouncement.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(annWhere.status).toBe('PUBLISHED');
    expect(annWhere.OR).toEqual([{ audienceRole: null }, { audienceRole: 'USER' }]);
    const mwWhere = (prisma.maintenanceWindow.findMany.mock.calls[0] as unknown as [{ where: { OR: unknown } }])[0].where;
    expect(mwWhere.OR).toEqual([{ serverId: null }, { serverId: { in: ['s1'] } }]);
  });

  function adminCtl(status: string) {
    const prisma = {
      maintenanceWindow: {
        findUnique: jest.fn(async () => ({ id: 'm1', status })),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'm1', serverId: null, title: 'PHP', scheduledStart: now, scheduledEnd: now, ...data,
        })),
      },
    };
    const audit = { record: jest.fn(async () => undefined) };
    const webhooks = { enqueue: jest.fn(async () => undefined) };
    const st = { invalidate: jest.fn() };
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
});
