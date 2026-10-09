import { BadRequestException } from '@nestjs/common';
import { Role } from '@verris/database';
import { VatWeryfikacjaService } from './vat-weryfikacja.service.js';

/**
 * Decyzja 09.10 — weryfikacja nabywcy spoza UE zostawia ślad „kto/kiedy/na podstawie czego”.
 * DTO (MinLength) liczy znaki PRZED przycięciem, więc same spacje przechodziły walidację,
 * a w User.vatWeryfikacjaPodstawa i w dzienniku lądował pusty tekst. Serwis liczy po trim().
 */
describe('VatWeryfikacjaService — podstawa i powód nie mogą być puste', () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  const svc = new VatWeryfikacjaService(prisma as never);
  const op = { userId: 'op-1', role: Role.ADMIN };
  const nabywca = {
    id: 'u-1', role: Role.USER, anonymizedAt: null, country: 'CH', nip: null, companyName: 'X AG',
    vatWeryfikacjaAt: new Date('2026-10-09T10:00:00Z'), vatWeryfikacjaPrzez: 'op-0',
    vatWeryfikacjaPodstawa: 'Rejestr CH', vatWeryfikacjaKraj: 'CH',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(nabywca);
  });

  it('weryfikacja z samymi spacjami (≥10 znaków) → 400, nic nie zapisane', async () => {
    await expect(svc.zweryfikuj('u-1', ' '.repeat(12), op)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.zweryfikuj('u-1', '   krótko   ', op)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cofnięcie i zmiana danych z pustym powodem → 400, nic nie zapisane', async () => {
    await expect(svc.cofnij('u-1', ' '.repeat(8), op)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.zmienDane('u-1', { country: 'US', powod: ' '.repeat(8) }, op)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
