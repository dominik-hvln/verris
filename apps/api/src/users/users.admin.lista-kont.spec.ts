import { BadRequestException } from '@nestjs/common';
import { warunkiListyKont } from './users.admin.service.js';

/** F2.4 (przegląd) — filtry listy kont klientów. */
describe('warunkiListyKont', () => {
  const lub = (w: ReturnType<typeof warunkiListyKont>) => ((w.AND as { OR?: unknown[] }[])[0]!.OR ?? []) as Record<string, unknown>[];

  it('NIP szukany bez spacji i myślników', () => {
    expect(lub(warunkiListyKont({ search: '123-456 78 90' }))).toContainEqual({ nip: { contains: '1234567890' } });
  });

  it('fraza z samych separatorów („-”) nie dokłada warunku NIP, który pasowałby do każdego konta z NIP-em', () => {
    const warunki = lub(warunkiListyKont({ search: '-' }));
    expect(warunki.some((w) => 'nip' in w)).toBe(false);
    expect(warunki).toContainEqual({ email: { contains: '-', mode: 'insensitive' } });
  });

  it('nieznany stan konta, zła kwota albo data → 400', () => {
    expect(() => warunkiListyKont({ status: 'cos' })).toThrow(BadRequestException);
    expect(() => warunkiListyKont({ saldoOd: '12,345' })).toThrow(BadRequestException);
    expect(() => warunkiListyKont({ od: '2026-13-45x' })).toThrow(BadRequestException);
  });
});
