import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { bladNipuPl, poprawnyNip } from './nip.js';

/**
 * P2-05 (paczka 109) — NIP polskiego nabywcy z cyfrą kontrolną; zmiana po pierwszej płatności dozwolona,
 * tylko dla kolejnych dokumentów, z wpisem w dzienniku. Na starym kodzie `1234567890` i `0000000000` zapisywały się,
 * a po płatności zmiana NIP kończyła się 403 „zgłoś obsłudze”.
 */
describe('NIP — suma kontrolna', () => {
  it('poprawne NIP-y (także z PL, spacjami i myślnikami)', () => {
    for (const n of ['1234563218', '123-456-32-18', 'PL 525 224 84 81', '9292069367']) expect(poprawnyNip(n)).toBe(true);
  });
  it('zła cyfra kontrolna, same zera, za krótki', () => {
    for (const n of ['1234567890', '0000000000', '123456321', '1234563219']) expect(poprawnyNip(n)).toBe(false);
    expect(bladNipuPl('1234567890')).toMatch(/błędną cyfrę kontrolną/);
    expect(bladNipuPl('12345')).toMatch(/10 cyfr/);
    expect(bladNipuPl('')).toBeNull();
  });
});

describe('UsersService.updateProfile — NIP (P2-05)', () => {
  function stanowisko(opts: { kraj?: string; platnosc?: boolean } = {}) {
    const klient = { id: 'u1', customerOwnerId: null, companyName: 'ACME', nip: '1234563218', address: null, city: null, postalCode: null, country: opts.kraj ?? 'PL' };
    const prisma = {
      user: {
        findUnique: vi.fn(async () => klient),
        update: vi.fn(async (a: { data: Record<string, unknown> }) => ({ ...klient, ...a.data, sidebarQuickLinks: [] })),
      },
      walletTransaction: { count: vi.fn(async () => (opts.platnosc ? 1 : 0)) },
      invoice: { count: vi.fn(async () => 0) },
    };
    const audit = { record: vi.fn(async () => undefined) };
    const svc = new UsersService(prisma as never, {} as never, { get: vi.fn() } as never, {} as never, { safeAward: vi.fn() } as never, {} as never, audit as never);
    return { svc, prisma, audit };
  }

  it('PL: zła cyfra kontrolna → 400 z komunikatem przy polu, bez zapisu', async () => {
    const s = stanowisko();
    await expect(s.svc.updateProfile('u1', { nip: '1234567890' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.updateProfile('u1', { nip: '0000000000' })).rejects.toThrow(/cyfrę kontrolną/);
    expect(s.prisma.user.update).not.toHaveBeenCalled();
  });

  it('po pierwszej płatności poprawny NIP zapisuje się, z wpisem w dzienniku (przed/po) i wyzerowaną weryfikacją', async () => {
    const s = stanowisko({ platnosc: true });
    await s.svc.updateProfile('u1', { nip: '525-224-84-81' });
    expect(s.prisma.user.update.mock.calls[0][0].data).toMatchObject({ nip: '525-224-84-81', vatWeryfikacjaAt: null });
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BILLING_NIP_CHANGED', userId: 'u1', details: expect.objectContaining({ przed: '1234563218', po: '525-224-84-81' }) }),
    );
  });

  it('ten sam NIP w innym zapisie — bez wpisu w dzienniku; kraj spoza PL — bez sumy kontrolnej PL', async () => {
    const s = stanowisko();
    await s.svc.updateProfile('u1', { nip: '123-456-32-18' });
    expect(s.audit.record).not.toHaveBeenCalled();
    const de = stanowisko({ kraj: 'DE' });
    await expect(de.svc.updateProfile('u1', { nip: 'DE123456789' })).resolves.toBeDefined();
  });
});
