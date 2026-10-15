import { ConflictException } from '@nestjs/common';
import { VpsService } from './vps.service.js';
import { VpsRenewalScheduler } from './vps-renewal.scheduler.js';

/**
 * Audyt 13.10 (vps.service.ts:power, reboot-status-escapes-renewal) — restart zapisywał REBOOTING, a odnowienia
 * biorą tylko RUNNING/STOPPED: po jednym restarcie VPS nie był obciążany ani wstrzymywany za brak płatności.
 */
const DZIEN = 86_400_000;

function usluga(status: string, okresKoniec = new Date(Date.now() + 10 * DZIEN)) {
  const vps = { id: 'v1', userId: 'u1', status, hetznerServerId: '42', currentPeriodEnd: okresKoniec };
  const prisma = {
    vpsInstance: {
      findFirst: vi.fn(async () => vps),
      update: vi.fn(async ({ data }: { data: { status: string } }) => Object.assign(vps, data)),
    },
  };
  const hetzner = { reboot: vi.fn(async () => undefined), powerOn: vi.fn(), powerOff: vi.fn() };
  const svc = new VpsService(prisma as never, {} as never, { record: vi.fn() } as never, {} as never, hetzner as never, {} as never, { get: () => undefined } as never);
  return { svc, vps, prisma, hetzner };
}

describe('VPS — restart nie wyprowadza serwera z rozliczeń', () => {
  it('restart działającego VPS-a zostawia status RUNNING (nie REBOOTING)', async () => {
    const t = usluga('RUNNING');
    const r = await t.svc.power('u1', 'v1', 'reboot');
    expect(t.hetzner.reboot).toHaveBeenCalledWith('42');
    expect(r.status).toBe('RUNNING');
    expect(t.vps.status).toBe('RUNNING');
  });

  it('VPS po restarcie trafia do odnowienia — brak środków po terminie → wstrzymanie', async () => {
    const t = usluga('RUNNING', new Date(Date.now() - DZIEN));
    await t.svc.power('u1', 'v1', 'reboot');
    const findMany = vi.fn(async ({ where }: { where: { status: { in: string[] } } }) =>
      where.status.in.includes(t.vps.status) ? [{ ...t.vps, name: 'vps', priceMonthly: '50', user: { email: 'a@x', firstName: 'A' }, plan: { name: 'P' } }] : [],
    );
    const update = vi.fn(async () => ({}));
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      vpsInstance: { findMany, update, updateMany },
      platformSetting: { findMany: vi.fn(async () => []) },
      vpsSnapshot: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    };
    const wallet = { debit: vi.fn(async () => { throw new ConflictException('brak środków'); }) };
    const hetzner = { powerOff: vi.fn(async () => undefined), listSnapshots: vi.fn(async () => []) };
    const sch = new VpsRenewalScheduler(
      prisma as never, wallet as never, hetzner as never, { send: vi.fn(async () => undefined) } as never,
      { record: vi.fn() } as never, { get: () => undefined } as never,
    );
    await sch.tick();
    expect(wallet.debit).toHaveBeenCalled();
    expect(hetzner.powerOff).toHaveBeenCalledWith('42');
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'v1', status: 'RUNNING' }, data: { status: 'STOPPED' } });
  });

  it('restart wyłączonego (np. wstrzymanego) VPS-a → odmowa, bez wywołania dostawcy', async () => {
    const t = usluga('STOPPED', new Date(Date.now() - DZIEN));
    await expect(t.svc.power('u1', 'v1', 'reboot')).rejects.toBeInstanceOf(ConflictException);
    expect(t.hetzner.reboot).not.toHaveBeenCalled();
  });

  // Noc 15.10 (rewalidacja): power() nadpisywał status bez względu na stan wyjściowy — VPS w błędzie albo w trakcie
  // usuwania po „Włącz”/restarcie dostawał RUNNING i wracał do rozliczeń.
  it.each(['ERROR', 'DELETING', 'PROVISIONING'])('VPS w stanie %s → odmowa, bez dostawcy i bez zmiany statusu', async (stan) => {
    for (const akcja of ['on', 'off', 'reboot'] as const) {
      const t = usluga(stan);
      await expect(t.svc.power('u1', 'v1', akcja)).rejects.toBeInstanceOf(ConflictException);
      expect(t.hetzner.reboot).not.toHaveBeenCalled();
      expect(t.hetzner.powerOn).not.toHaveBeenCalled();
      expect(t.hetzner.powerOff).not.toHaveBeenCalled();
      expect(t.vps.status).toBe(stan);
    }
  });
});
