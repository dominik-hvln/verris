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

/**
 * Przegląd 15.10 — faktury VAT panelu sprzed okna automatu (7 dni), których nie ma w kolejce KSeF: do dziś
 * komentarze odsyłały do `zakwalifikujZalegle`, którego nie było, a faktury zostawały poza KSeF po cichu.
 */
describe('KSeF — zaległe faktury spoza okna automatu', () => {
  function stanowisko(o: { liczba: number; enabled?: boolean }) {
    const audit = { record: vi.fn(async () => undefined) };
    const prisma = {
      invoice: {
        count: vi.fn(async () => o.liczba),
        findMany: vi.fn(async () => [{ id: 'f1', number: 'VFV/2026/09/0001', issuedAt: new Date('2026-09-01T10:00:00Z') }]),
        updateMany: vi.fn(async () => ({ count: o.liczba })),
      },
    };
    const settings = { getKsefRuntimeConfig: async () => ({ enabled: o.enabled ?? true, env: 'prod', nip: '5250000000', token: 't' }) };
    const svc = new KsefService(prisma as never, {} as never, audit as never, settings as never);
    return { svc, prisma, audit };
  }

  it('podgląd: liczba i przykłady faktur VAT panelu wystawionych przed oknem, bez kolejki', async () => {
    const { svc, prisma } = stanowisko({ liczba: 3 });
    await expect(svc.zalegleDoKsef()).resolves.toEqual({ liczba: 3, przyklady: [{ id: 'f1', number: 'VFV/2026/09/0001', issuedAt: '2026-09-01T10:00:00.000Z' }] });
    const where = (prisma.invoice.count.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ ksefStatus: 'NOT_APPLICABLE', rodzajPrawny: 'FAKTURA_VAT', storageKey: { not: null }, netAmount: { not: null } });
    const lt = (where.issuedAt as { lt: Date }).lt.getTime();
    expect(Math.abs(Date.now() - 7 * 24 * 3600_000 - lt)).toBeLessThan(5000);
    expect(where.OR).toEqual([{ number: { startsWith: 'VFV/' } }, { number: { startsWith: 'VFK/' } }]);
  });

  it('zakolejkowanie: tylko gdy liczba zgadza się z podglądem i KSeF włączony; wpis w dzienniku ze środowiskiem', async () => {
    const zmiana = stanowisko({ liczba: 4 });
    await expect(zmiana.svc.zakwalifikujZalegle('adm', 3)).rejects.toThrow(/zmieniła się \(4, a podgląd pokazywał 3\)/);
    expect(zmiana.prisma.invoice.updateMany).not.toHaveBeenCalled();

    const wyl = stanowisko({ liczba: 3, enabled: false });
    await expect(wyl.svc.zakwalifikujZalegle('adm', 3)).rejects.toThrow(/KSeF jest wyłączony/);
    expect(wyl.prisma.invoice.updateMany).not.toHaveBeenCalled();

    const ok = stanowisko({ liczba: 3 });
    await expect(ok.svc.zakwalifikujZalegle('adm', 3)).resolves.toEqual({ zakolejkowane: 3, srodowisko: 'prod' });
    expect(ok.prisma.invoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { ksefStatus: 'PENDING' } }));
    expect(ok.audit.record).toHaveBeenCalledWith({ action: 'KSEF_ZALEGLE_ZAKOLEJKOWANE', actorUserId: 'adm', details: { liczba: 3, srodowisko: 'prod' } });
  });

  it('trasy tylko dla ADMIN-a', () => {
    const g = new RolesGuard(new Reflector());
    for (const handler of [KsefAdminController.prototype.zalegle, KsefAdminController.prototype.zakolejkujZalegle]) {
      const k = (role: string) =>
        ({ getHandler: () => handler, getClass: () => KsefAdminController, switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u', role } }) }) }) as never;
      expect(g.canActivate(k('ADMIN'))).toBe(true);
      expect(g.canActivate(k('STAFF'))).toBe(false);
    }
  });
});
