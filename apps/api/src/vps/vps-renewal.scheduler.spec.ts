import { ConflictException } from '@nestjs/common';
import { VpsRenewalScheduler } from './vps-renewal.scheduler.js';

/**
 * Odnowienie VPS: tylko brak środków (ConflictException z portfela) uruchamia karencję,
 * a po niej usunięcie serwera. Błąd bazy nie może skończyć się skasowaniem VPS-a klienta.
 */
function stanowisko(blad: Error) {
  const vps = {
    id: 'v1', userId: 'u1', name: 'app', status: 'RUNNING', hetznerServerId: 42, priceMonthly: 30,
    currentPeriodEnd: new Date(Date.now() - 30 * 24 * 3600_000), user: { email: 'jan@firma.pl', firstName: null }, plan: { name: 'CX' },
  };
  const prisma = { vpsInstance: { findMany: vi.fn(async () => [vps]), update: vi.fn(async () => ({})) } };
  const hetzner = { deleteServer: vi.fn(async () => undefined), powerOff: vi.fn(async () => undefined), powerOn: vi.fn() };
  const svc = new VpsRenewalScheduler(
    prisma as never,
    { debit: vi.fn(async () => Promise.reject(blad)) } as never,
    hetzner as never,
    { send: vi.fn(async () => undefined) } as never,
    { record: vi.fn(async () => undefined) } as never,
    { get: () => undefined } as never,
  );
  return { svc, hetzner, prisma };
}

describe('VpsRenewalScheduler — karencja tylko przy braku środków', () => {
  it('brak środków po karencji → serwer usunięty', async () => {
    const s = stanowisko(new ConflictException('Insufficient wallet balance for this charge'));
    await s.svc.tick();
    expect(s.hetzner.deleteServer).toHaveBeenCalledWith(42);
  });

  it('błąd bazy przy obciążeniu → serwer zostaje, status bez zmian', async () => {
    const s = stanowisko(new Error("Can't reach database server"));
    await s.svc.tick();
    expect(s.hetzner.deleteServer).not.toHaveBeenCalled();
    expect(s.hetzner.powerOff).not.toHaveBeenCalled();
    expect(s.prisma.vpsInstance.update).not.toHaveBeenCalled();
  });
});
