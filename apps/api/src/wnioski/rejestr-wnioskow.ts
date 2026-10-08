import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, MinLength } from 'class-validator';
import type { StaffPermission } from '../staff-roles/staff-permissions.catalog.js';

/**
 * PB-48 (decyzja właściciela 08.10) — rejestr operacji, o które pracownik bez uprawnienia może złożyć wniosek.
 *
 * Każdy typ mówi: jakie uprawnienie wykonuje operację (akceptujący musi je mieć + REQUESTS_APPROVE), jakie
 * wystarcza do złożenia wniosku, jak wygląda payload (klasa DTO — walidowana przy złożeniu i ponownie przy
 * akceptacji) i kto ją wykonuje. Wykonawca woła ISTNIEJĄCĄ logikę serwisu — tę samą co endpoint bezpośredni,
 * więc dziennik, powiadomienia klienta i walidacje są identyczne.
 *
 * Nowy typ = nowy wpis tutaj (+ @WniosekMozliwy('TYP') przy endpoincie bezpośrednim, żeby 403 niosło kod
 * WYMAGA_WNIOSKU). Typ w bazie to tekst, więc bez migracji.
 *
 * Wybór na start (finanse, BILLING_MANAGE, z istniejącym endpointem operatorskim):
 *  - WALLET_CREDIT — POST admin/billing/wallet/credit (BillingService.adminCreditWallet),
 *  - INVOICE_VOID — POST admin/invoices/:id/anuluj (AnulowanieService.anuluj).
 * Pominięte: kredyt SLA (sla.admin.controller ma tylko podgląd — nie ma operacji do zlecenia), korekta faktury
 * (payload to pełna lista pozycji po korekcie — formularz zostaje w panelu admina; typ łatwo dopisać później),
 * zwrot Paynow (pieniądze wychodzą do bramki — świadomie poza wnioskami do decyzji właściciela).
 */

// ── payloady ────────────────────────────────────────────────────────────────

export class KontoWewnetrznePayload {
  @IsBoolean()
  isInternal!: boolean;
}

export class ZasileniePortfelaPayload {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class AnulowanieDokumentuPayload {
  @IsString()
  @MaxLength(64)
  invoiceId!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  powod!: string;
}

// ── zależności wykonawców (wstrzykiwane przez WnioskiService) ───────────────

export interface ZaleznosciWnioskow {
  prisma: {
    user: { findUnique(args: unknown): Promise<{ isInternal?: boolean } | null> };
    invoice: { findUnique(args: unknown): Promise<{ id: string; userId: string; number: string; status: string } | null> };
  };
  uzytkownicy: {
    patchCustomerOperational(
      userId: string,
      actorUserId: string,
      dto: { isInternal?: boolean },
      ctx: { ipAddress?: string | null; userAgent?: string | null },
      aktor: { role: string; userId: string },
    ): Promise<unknown>;
  };
  portfel: {
    adminCreditWallet(opts: {
      userId: string;
      amount: number | string;
      description?: string;
      idempotencyKey?: string;
      actorUserId: string;
    }): Promise<{ id: string; amount: { toString(): string } }>;
  };
  anulowanie: {
    anuluj(input: { invoiceId: string; powod: string; aktorUserId: string }): Promise<{ id: string; number: string; status: string }>;
  };
}

export interface KontekstWykonania {
  wniosekId: string;
  klientId: string | null;
  decydujacy: { userId: string; role: string };
}

export interface DefinicjaWniosku<P extends object = object> {
  etykieta: string;
  /** Uprawnienie samej operacji — akceptujący STAFF musi je mieć (oprócz REQUESTS_APPROVE). */
  uprawnienie: StaffPermission;
  /**
   * Pozostałe uprawnienia, których wymaga ścieżka bezpośrednia (strażnik endpointu) — wniosek nie może
   * dawać więcej niż ona: akceptujący ma mieć komplet, a kto go ma, wykonuje bezpośrednio (wymaganeUprawnienia).
   */
  uprawnieniaDodatkowe?: readonly StaffPermission[];
  /** Uprawnienie wystarczające do złożenia wniosku (pracownik widzi klienta na karcie). */
  doZlozenia: StaffPermission;
  dto: new () => P;
  wymagaKlienta: boolean;
  /** Krótki opis dla list wniosków i powiadomień („Zasilenie portfela: 50,00 K”). */
  opis(p: P): string;
  /** Przy złożeniu: zasób istnieje, należy do klienta, zmiana ma sens. Rzuca 400/404. */
  sprawdzPrzyZlozeniu?(p: P, klientId: string | null, z: ZaleznosciWnioskow): Promise<void>;
  /** Przy akceptacji: gdy operacja nic by już nie zmieniła — komunikat (wniosek kończy się bez wykonania). */
  bezZmian?(p: P, klientId: string | null, z: ZaleznosciWnioskow): Promise<string | null>;
  wykonaj(p: P, k: KontekstWykonania, z: ZaleznosciWnioskow): Promise<Record<string, unknown>>;
}

function definicja<P extends object>(d: DefinicjaWniosku<P>): DefinicjaWniosku<object> {
  return d as unknown as DefinicjaWniosku<object>;
}

const kwotaPl = (n: number) => `${n.toFixed(2).replace('.', ',')} K`;

const DO_ANULOWANIA = ['DRAFT', 'OPEN'];

export const REJESTR_WNIOSKOW = {
  CUSTOMER_INTERNAL_FLAG: definicja<KontoWewnetrznePayload>({
    etykieta: 'Oznaczenie konta jako wewnętrzne',
    uprawnienie: 'CUSTOMERS_INTERNAL_FLAG',
    // Bezpośrednio: PATCH admin/users/:id/operational — strażnik CUSTOMERS_MANAGE, serwis CUSTOMERS_INTERNAL_FLAG.
    uprawnieniaDodatkowe: ['CUSTOMERS_MANAGE'],
    doZlozenia: 'CUSTOMERS_VIEW',
    dto: KontoWewnetrznePayload,
    wymagaKlienta: true,
    opis: (p) => (p.isInternal ? 'Oznacz konto jako wewnętrzne (poza MRR i churnem)' : 'Zdejmij oznaczenie „konto wewnętrzne”'),
    async sprawdzPrzyZlozeniu(p, klientId, z) {
      const u = await z.prisma.user.findUnique({ where: { id: klientId }, select: { isInternal: true } });
      if (Boolean(u?.isInternal) === p.isInternal) {
        throw new BadRequestException(p.isInternal ? 'Konto już jest oznaczone jako wewnętrzne.' : 'Konto nie jest oznaczone jako wewnętrzne.');
      }
    },
    async bezZmian(p, klientId, z) {
      const u = await z.prisma.user.findUnique({ where: { id: klientId }, select: { isInternal: true } });
      if (Boolean(u?.isInternal) !== p.isInternal) return null;
      return p.isInternal
        ? 'Bez zmian — konto było już oznaczone jako wewnętrzne.'
        : 'Bez zmian — konto nie było już oznaczone jako wewnętrzne.';
    },
    async wykonaj(p, k, z) {
      await z.uzytkownicy.patchCustomerOperational(
        k.klientId!,
        k.decydujacy.userId,
        { isInternal: p.isInternal },
        { ipAddress: null, userAgent: null },
        k.decydujacy,
      );
      return { komunikat: p.isInternal ? 'Konto oznaczone jako wewnętrzne.' : 'Zdjęto oznaczenie „konto wewnętrzne”.' };
    },
  }),

  WALLET_CREDIT: definicja<ZasileniePortfelaPayload>({
    etykieta: 'Zasilenie portfela klienta',
    uprawnienie: 'BILLING_MANAGE',
    doZlozenia: 'CUSTOMERS_VIEW',
    dto: ZasileniePortfelaPayload,
    wymagaKlienta: true,
    opis: (p) => `Zasilenie portfela: ${kwotaPl(Number(p.amount))}${p.description ? ` — ${p.description}` : ''}`,
    async wykonaj(p, k, z) {
      // Klucz idempotencji z id wniosku — drugi raz ten sam wniosek nie zasili portfela (obok blokady statusu).
      const tx = await z.portfel.adminCreditWallet({
        userId: k.klientId!,
        amount: p.amount,
        description: p.description,
        idempotencyKey: `wniosek:${k.wniosekId}`,
        actorUserId: k.decydujacy.userId,
      });
      return { komunikat: `Portfel zasilony kwotą ${kwotaPl(Number(tx.amount.toString()))}.`, walletTxId: tx.id };
    },
  }),

  INVOICE_VOID: definicja<AnulowanieDokumentuPayload>({
    etykieta: 'Anulowanie nieopłaconego dokumentu',
    uprawnienie: 'BILLING_MANAGE',
    doZlozenia: 'CUSTOMERS_VIEW',
    dto: AnulowanieDokumentuPayload,
    wymagaKlienta: true,
    opis: (p) => `Anulowanie dokumentu — ${p.powod}`,
    async sprawdzPrzyZlozeniu(p, klientId, z) {
      const f = await z.prisma.invoice.findUnique({ where: { id: p.invoiceId }, select: { id: true, userId: true, number: true, status: true } });
      if (!f || f.userId !== klientId) throw new NotFoundException('Dokument nie istnieje na koncie tego klienta.');
      if (!DO_ANULOWANIA.includes(f.status)) {
        throw new BadRequestException('Anulować można tylko dokument nieopłacony. Opłacony zmienisz korektą.');
      }
    },
    async bezZmian(p, _klientId, z) {
      const f = await z.prisma.invoice.findUnique({ where: { id: p.invoiceId }, select: { id: true, userId: true, number: true, status: true } });
      return f?.status === 'VOID' ? `Bez zmian — dokument ${f.number} był już anulowany.` : null;
    },
    async wykonaj(p, k, z) {
      const r = await z.anulowanie.anuluj({ invoiceId: p.invoiceId, powod: p.powod, aktorUserId: k.decydujacy.userId });
      return { komunikat: `Dokument ${r.number} anulowany.`, invoiceId: r.id, number: r.number };
    },
  }),
} as const satisfies Record<string, DefinicjaWniosku<object>>;

export type TypWniosku = keyof typeof REJESTR_WNIOSKOW;

export const TYPY_WNIOSKOW = Object.keys(REJESTR_WNIOSKOW) as TypWniosku[];

export function definicjaWniosku(typ: string): DefinicjaWniosku<object> | null {
  return Object.prototype.hasOwnProperty.call(REJESTR_WNIOSKOW, typ) ? REJESTR_WNIOSKOW[typ as TypWniosku] : null;
}

/** Komplet uprawnień do wykonania operacji (tyle samo co ścieżka bezpośrednia). */
export function wymaganeUprawnienia(def: Pick<DefinicjaWniosku<object>, 'uprawnienie' | 'uprawnieniaDodatkowe'>): StaffPermission[] {
  return [def.uprawnienie, ...(def.uprawnieniaDodatkowe ?? [])];
}

/** Czy operator o tych uprawnieniach wykona operację sam (komplet z wymaganeUprawnienia). */
export function mozeWykonac(def: Pick<DefinicjaWniosku<object>, 'uprawnienie' | 'uprawnieniaDodatkowe'>, uprawnienia: string[]): boolean {
  return wymaganeUprawnienia(def).every((p) => uprawnienia.includes(p));
}

/** Typy, o których może zdecydować operator o danych uprawnieniach (ADMIN — wszystkie). */
export function typyDoDecyzji(rola: string, uprawnienia: string[]): TypWniosku[] {
  if (rola === 'ADMIN') return [...TYPY_WNIOSKOW];
  if (rola !== 'STAFF' || !uprawnienia.includes('REQUESTS_APPROVE')) return [];
  return TYPY_WNIOSKOW.filter((t) => mozeWykonac(REJESTR_WNIOSKOW[t], uprawnienia));
}
