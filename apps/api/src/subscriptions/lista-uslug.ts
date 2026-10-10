import { BadRequestException } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma, SubscriptionStatus } from '@verris/database';

/**
 * F2.4 — lista usług w panelu operatora: filtry i stronicowanie w API (wcześniej 200 najnowszych bez filtrów,
 * resztę UI filtrowało u siebie, a starsze usługi znikały po cichu). Ta sama definicja filtrów służy liście
 * i eksportowi CSV, więc eksport zawiera dokładnie to, co operator widzi po przefiltrowaniu.
 */
export class ListaUslugQuery {
  @IsOptional() @IsString() @MaxLength(32)
  status?: string;

  @IsOptional() @IsString() @MaxLength(64)
  serverId?: string;

  @IsOptional() @IsString() @MaxLength(64)
  planId?: string;

  @IsOptional() @IsString() @MaxLength(64)
  userId?: string;

  @IsOptional() @IsString() @MaxLength(200)
  search?: string;

  @IsOptional() @IsString() @MaxLength(6)
  page?: string;

  @IsOptional() @IsString() @MaxLength(4)
  limit?: string;
}

export const USLUGI_NA_STRONE = 50;
export const USLUGI_MAX_NA_STRONE = 200;
/** Eksport bez stronicowania — powyżej limitu operator zawęża filtry (plik nie rośnie bez końca). */
export const USLUGI_MAX_EKSPORT = 50_000;

/** Prisma where z filtrów; status spoza enumu → 400 (nie pusta lista). Bez statusu — do liczników zakładek. */
export function warunkiListyUslug(q: ListaUslugQuery, opcje: { bezStatusu?: boolean } = {}): Prisma.SubscriptionWhereInput {
  const and: Prisma.SubscriptionWhereInput[] = [];
  if (q.status && !opcje.bezStatusu) {
    if (!Object.values(SubscriptionStatus).includes(q.status as SubscriptionStatus)) {
      throw new BadRequestException(`Nieznany stan usługi: ${q.status}`);
    }
    and.push({ status: q.status as SubscriptionStatus });
  }
  if (q.userId?.trim()) and.push({ userId: q.userId.trim() });
  if (q.planId?.trim()) and.push({ planId: q.planId.trim() });
  if (q.serverId?.trim()) and.push({ account: { is: { serverId: q.serverId.trim() } } });
  const fraza = q.search?.trim();
  if (fraza) {
    const lub: Prisma.SubscriptionWhereInput[] = [
      { serviceTag: { contains: fraza, mode: 'insensitive' } },
      { account: { is: { domain: { contains: fraza, mode: 'insensitive' } } } },
      { account: { is: { daUsername: { contains: fraza, mode: 'insensitive' } } } },
      { user: { email: { contains: fraza, mode: 'insensitive' } } },
    ];
    // Skrót id z panelu („#ab12cd34”) albo pełne id.
    const id = fraza.replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f-]{6,36}$/.test(id)) lub.push({ id: { startsWith: id } });
    and.push({ OR: lub });
  }
  return and.length ? { AND: and } : {};
}

export function stronaListy(q: { page?: string; limit?: string }, domyslnie = USLUGI_NA_STRONE, max = USLUGI_MAX_NA_STRONE) {
  const liczba = (v: string | undefined, d: number) => {
    const n = Number.parseInt(v ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  const limit = Math.min(liczba(q.limit, domyslnie), max);
  const page = liczba(q.page, 1);
  return { limit, page, skip: (page - 1) * limit };
}

/** Filtry do wpisu w dzienniku eksportu — tylko to, co podał operator. */
export function filtryDoDziennika(q: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(q).filter(([k, v]) => typeof v === 'string' && v.trim() && k !== 'page' && k !== 'limit') as [string, string][],
  );
}
