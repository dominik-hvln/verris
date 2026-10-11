import { BadRequestException } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Prisma } from '@verris/database';

/**
 * F2.5 — skrzynka zgłoszeń: wyszukiwanie, filtry i stronicowanie w API. Wcześniej `GET tickets/admin/all` oddawał
 * całą tabelę, a panele filtrowały u siebie (przy otwartej becie to tysiące wierszy na każde wejście do skrzynki
 * i liczniki menu). Ta sama definicja filtrów dla panelu obsługi i listy w panelu operatora.
 */
export class ListaZgloszenQuery {
  /** `otwarte` (≠ CLOSED), `zamkniete` albo kod stanu. */
  @IsOptional() @IsString() @MaxLength(32)
  stan?: string;

  @IsOptional() @IsString() @MaxLength(16)
  priorytet?: string;

  /** `ja`, `nikt` albo id operatora. */
  @IsOptional() @IsString() @MaxLength(64)
  przypisany?: string;

  /** Temat zgłoszenia (HOSTING, DOMAIN, …). */
  @IsOptional() @IsString() @MaxLength(32)
  temat?: string;

  @IsOptional() @IsString() @MaxLength(64)
  tag?: string;

  /** F3.7 — dział (BILLING, TECHNICAL, SALES): widok skrzynki działu. */
  @IsOptional() @IsString() @MaxLength(16)
  dzial?: string;

  /** `po-terminie` — pierwsza odpowiedź po terminie; `rozwiazanie-po-terminie` — termin rozwiązania minął. */
  @IsOptional() @IsString() @MaxLength(32)
  sla?: string;

  @IsOptional() @IsString() @MaxLength(64)
  userId?: string;

  /** Temat, treść i wątek, klient (e-mail, imię, nazwisko, firma) albo numer „#ab12cd34”. */
  @IsOptional() @IsString() @MaxLength(200)
  q?: string;

  /** `termin` (domyślnie: po terminie najpierw, potem najbliższy termin rozwiązania), `najnowsze`, `najstarsze`, `zamkniete`. */
  @IsOptional() @IsString() @MaxLength(16)
  sort?: string;

  @IsOptional() @IsString() @MaxLength(6)
  page?: string;

  @IsOptional() @IsString() @MaxLength(4)
  limit?: string;
}

export const ZGLOSZENIA_NA_STRONE = 50;
export const ZGLOSZENIA_MAX_NA_STRONE = 100;

const STANY = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'CLOSED'];
const PRIORYTETY = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const TEMATY = ['HOSTING', 'DOMAIN', 'EMAIL', 'DNS', 'BILLING', 'SSL', 'OTHER', 'BETA'];
/** F3.7 — działy zgłoszeń (pole `department`; ten sam słownik co DTO zgłoszenia). */
export const DZIALY = ['TECHNICAL', 'BILLING', 'SALES'] as const;
const SORTY = ['termin', 'najnowsze', 'najstarsze', 'zamkniete'];

/** Pierwsza odpowiedź po terminie (to, co skrzynka pokazuje na czerwono). */
export function poTerminie(teraz: Date): Prisma.TicketWhereInput {
  return { status: { not: 'CLOSED' }, firstResponseAt: null, slaResponseDueAt: { lt: teraz } };
}

/** Prisma where z filtrów; wartość spoza słownika → 400 (nie pusta lista, która udaje „nic nie ma”). */
export function warunkiListyZgloszen(q: ListaZgloszenQuery, actorUserId: string, teraz: Date): Prisma.TicketWhereInput {
  const and: Prisma.TicketWhereInput[] = [];
  const stan = q.stan?.trim();
  if (stan) {
    if (stan === 'otwarte') and.push({ status: { not: 'CLOSED' } });
    else if (stan === 'zamkniete') and.push({ status: 'CLOSED' });
    else if (STANY.includes(stan)) and.push({ status: stan });
    else throw new BadRequestException(`Nieznany stan zgłoszenia: ${stan}`);
  }
  const prio = q.priorytet?.trim();
  if (prio) {
    if (!PRIORYTETY.includes(prio)) throw new BadRequestException(`Nieznany priorytet: ${prio}`);
    and.push({ priority: prio });
  }
  const kto = q.przypisany?.trim();
  if (kto) and.push({ assignedToId: kto === 'ja' ? actorUserId : kto === 'nikt' ? null : kto });
  const temat = q.temat?.trim();
  if (temat) {
    if (!TEMATY.includes(temat)) throw new BadRequestException(`Nieznany temat: ${temat}`);
    and.push({ topic: temat });
  }
  const dzial = q.dzial?.trim();
  if (dzial) {
    if (!(DZIALY as readonly string[]).includes(dzial)) throw new BadRequestException(`Nieznany dział: ${dzial}`);
    and.push({ department: dzial });
  }
  const tag = q.tag?.trim().toLowerCase();
  if (tag) and.push({ tags: { has: tag } });
  const sla = q.sla?.trim();
  if (sla) {
    if (sla === 'po-terminie') and.push(poTerminie(teraz));
    else if (sla === 'rozwiazanie-po-terminie') and.push({ status: { not: 'CLOSED' }, slaResolveDueAt: { lt: teraz } });
    else throw new BadRequestException(`Nieznany filtr terminu: ${sla}`);
  }
  if (q.userId?.trim()) and.push({ userId: q.userId.trim() });
  const fraza = q.q?.trim();
  if (fraza) {
    const zawiera = { contains: fraza, mode: 'insensitive' as const };
    const lub: Prisma.TicketWhereInput[] = [
      { subject: zawiera },
      { message: zawiera },
      { replies: { some: { message: zawiera } } },
      { user: { OR: [{ email: zawiera }, { firstName: zawiera }, { lastName: zawiera }, { companyName: zawiera }] } },
    ];
    // Numer z panelu („#ab12cd34”) albo pełne id.
    const id = fraza.replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f-]{6,36}$/.test(id)) lub.push({ id: { startsWith: id } });
    and.push({ OR: lub });
  }
  return and.length ? { AND: and } : {};
}

export function sortListyZgloszen(sort: string | undefined): string {
  const s = sort?.trim() || 'termin';
  if (!SORTY.includes(s)) throw new BadRequestException(`Nieznane sortowanie: ${s}`);
  return s;
}

export const KOLEJNOSC: Record<string, Prisma.TicketOrderByWithRelationInput[]> = {
  // Po terminie pierwszej odpowiedzi idą osobno (pierwsza część listy); reszta — najbliższy termin rozwiązania
  // (liczony z priorytetu przy założeniu, więc łączy priorytet i wiek), potem najnowsze.
  termin: [{ slaResolveDueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'desc' }],
  najnowsze: [{ createdAt: 'desc' }, { id: 'desc' }],
  najstarsze: [{ createdAt: 'asc' }, { id: 'asc' }],
  zamkniete: [{ resolvedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }, { id: 'desc' }],
};

/**
 * Strona z dwóch list sklejonych jedna po drugiej (najpierw `a` — np. po terminie, potem `b`), bez pobierania
 * całości: wylicza, ile wierszy wziąć z każdej części dla danego `skip`/`limit`.
 */
export function podzialStrony(skip: number, limit: number, ileA: number): { a: { skip: number; take: number }; b: { skip: number; take: number } } {
  const zA = Math.max(0, Math.min(limit, ileA - skip));
  return { a: { skip: Math.min(skip, ileA), take: zA }, b: { skip: Math.max(0, skip - ileA), take: limit - zA } };
}
