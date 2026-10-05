import { Prisma } from '@verris/database';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * O-07 — narzut resellera (decyzja właściciela 2026-10-05): klient resellera płaci cenę katalogową
 * powiększoną o narzut resellera, a część narzutu staje się prowizją resellera (RESELLER_MARKUP).
 *
 * Bezpiecznik: bez `FEATURE_RESELLER_MARKUP=true` narzut zawsze wynosi 0 — klienci istniejących
 * resellerów płacą cennik, dopóki właściciel nie włączy funkcji.
 */
export function narzutWlaczony(config: Pick<ConfigService, 'get'>): boolean {
  return (config.get<string>('FEATURE_RESELLER_MARKUP') ?? '').trim().toLowerCase() === 'true';
}

/** Narzut (%) dla klienta: 0 gdy funkcja wyłączona, klient bez resellera albo reseller nieaktywny. */
export async function narzutResellera(
  prisma: Pick<PrismaService, 'user' | 'resellerProfile'>,
  config: Pick<ConfigService, 'get'>,
  userId: string,
): Promise<number> {
  if (!narzutWlaczony(config)) return 0;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { resellerOwnerId: true } });
  if (!u?.resellerOwnerId) return 0;
  const p = await prisma.resellerProfile.findUnique({
    where: { userId: u.resellerOwnerId },
    select: { status: true, markupPct: true },
  });
  if (!p || p.status !== 'ACTIVE') return 0;
  return Math.max(0, p.markupPct);
}

/** Cena z narzutem, 2 miejsca, HALF_UP. Panel klienta liczy tak samo (`lib/narzut.ts`). */
export function zNarzutem(cena: Prisma.Decimal | number | string, pct: number): Prisma.Decimal {
  const c = new Prisma.Decimal(cena);
  if (pct <= 0) return c;
  return c.mul(100 + pct).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Cena bez narzutu (odpięcie od resellera) — 2 miejsca, HALF_UP. */
export function bezNarzutu(cena: Prisma.Decimal | number | string, pct: number): Prisma.Decimal {
  const c = new Prisma.Decimal(cena);
  if (pct <= 0) return c;
  return c.mul(100).div(100 + pct).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Część płatności klienta przypadająca na narzut: kwota × pct / (100 + pct), 2 miejsca, HALF_UP. */
export function czescNarzutu(kwota: Prisma.Decimal | number | string, pct: number): Prisma.Decimal {
  if (pct <= 0) return new Prisma.Decimal(0);
  return new Prisma.Decimal(kwota).abs().mul(pct).div(100 + pct).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Widok resellera: cena hurtowa i detaliczna usługi. Usługa ze snapshotem narzutu ma go już w cenie
 * (klient płaci detal), starsza usługa — cena z cennika, detal liczony bieżącym narzutem profilu.
 */
export function cenyDlaResellera(priceAmount: Prisma.Decimal | number | string, snapshotPct: number | null, markupPct: number) {
  if (snapshotPct && snapshotPct > 0) {
    return { hurt: bezNarzutu(priceAmount, snapshotPct).toNumber(), detal: new Prisma.Decimal(priceAmount).toNumber() };
  }
  return { hurt: new Prisma.Decimal(priceAmount).toNumber(), detal: zNarzutem(priceAmount, markupPct).toNumber() };
}
