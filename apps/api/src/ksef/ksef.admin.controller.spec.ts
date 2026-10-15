import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { KsefAdminController } from './ksef.admin.controller.js';
import { KsefService } from './ksef.service.js';

/**
 * M-15 (noc 15.10, przegląd macierzy): „Pobierz UPO” w adminie — definicja ukończenia wymaga testu strażnika API
 * (@Roles(ADMIN) na kontrolerze, nie tylko proxy Next.js) i wpisu w dzienniku przy pobraniu (UPO to dokument
 * podatkowy faktury klienta).
 */
const kontekst = (role: string) =>
  ({
    getHandler: () => KsefAdminController.prototype.upo,
    getClass: () => KsefAdminController,
    switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u1', role } }) }),
  }) as never;

describe('KsefAdminController — UPO', () => {
  it('tylko ADMIN (STAFF, USER → odmowa)', () => {
    const g = new RolesGuard(new Reflector());
    expect(g.canActivate(kontekst('ADMIN'))).toBe(true);
    expect(g.canActivate(kontekst('STAFF'))).toBe(false);
    expect(g.canActivate(kontekst('USER'))).toBe(false);
  });

  it('pobranie UPO zostawia wpis w dzienniku z operatorem i numerem faktury', async () => {
    const audit = { record: vi.fn(async () => undefined) };
    const prisma = { invoice: { findUnique: vi.fn(async () => ({ id: 'f1', number: 'VFV/2026/10/0002', ksefStatus: 'ACCEPTED', ksefElementRef: 'ref-1' })) } };
    const svc = new KsefService(prisma as never, {} as never, audit as never, {} as never);
    const klient = { openSession: vi.fn(async () => undefined), downloadUpo: vi.fn(async () => '<UPO/>'), terminateSession: vi.fn(async () => undefined) };
    vi.spyOn(svc as unknown as { buildClient: () => Promise<unknown> }, 'buildClient').mockResolvedValue({ client: klient, env: 'test' });
    const c = new KsefAdminController(svc);
    expect(await c.upo('f1', { userId: 'admin-1' })).toBe('<UPO/>');
    expect(audit.record).toHaveBeenCalledWith({
      action: 'KSEF_UPO_DOWNLOADED',
      actorUserId: 'admin-1',
      details: { invoiceId: 'f1', number: 'VFV/2026/10/0002' },
    });
  });

  it('UPO niedostępne → 404 bez wpisu', async () => {
    const audit = { record: vi.fn(async () => undefined) };
    const prisma = { invoice: { findUnique: vi.fn(async () => ({ id: 'f2', number: 'X', ksefStatus: 'PENDING', ksefElementRef: null })) } };
    const svc = new KsefService(prisma as never, {} as never, audit as never, {} as never);
    await expect(new KsefAdminController(svc).upo('f2', { userId: 'admin-1' })).rejects.toThrow(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
