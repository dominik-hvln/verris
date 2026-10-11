import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, MinLength } from 'class-validator';
import type { StaffPermission } from '../staff-roles/staff-permissions.catalog.js';
import { POWODY_ZAWIESZENIA_OPERATORA, type PowodZawieszeniaOperatora } from '../subscriptions/powody-zawieszenia.js';
import { PLATNOSCI_DODATKU, SLUGI_DODATKOW, type PlatnoscDodatku } from '../addons/addon.service.js';

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
 * D9 (10.10) — dane logowania klienta (CUSTOMERS_MANAGE = L3 bezpośrednio, L1/L2 przez wniosek):
 *  - CUSTOMER_EMAIL_CHANGE — POST admin/users/:id/email (UsersAdminService.changeCustomerEmail),
 *  - CUSTOMER_PASSWORD_RESET — POST admin/users/:id/reset-password (link do klienta, operator nie zna hasła).
 * F2.3 (D2, 10.10) — zawieszenie usługi (SUBSCRIPTIONS_SUSPEND = L3 i zespół abuse bezpośrednio, L2 przez wniosek):
 *  - SUBSCRIPTION_SUSPEND — POST admin/subscriptions/:id/suspend (ZawieszenieOperatoraService.zawies),
 *  - SUBSCRIPTION_UNSUSPEND — POST admin/subscriptions/:id/unsuspend (bez obciążenia za odnowienie).
 * F3.5 (D2, 11.10) — cykl życia usługi z kosztem dla Verris (BILLING_MANAGE + SUBSCRIPTIONS_MANAGE = L4 bezpośrednio,
 * L2/L3 przez wniosek):
 *  - SUBSCRIPTION_RENEWAL_DATE — POST admin/subscriptions/:id/data-odnowienia (CyklZyciaUslugiService.zmienDateOdnowienia),
 *  - ADDON_ADD — POST admin/subscriptions/:id/dodatki (AddonService.dodajPrzezOperatora; z portfela klienta albo gratis).
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

export class ZmianaEmailaPayload {
  @IsEmail()
  @MaxLength(320)
  newEmail!: string;
}

/** Reset hasła nie ma parametrów — powodem jest uzasadnienie wniosku. */
export class ResetHaslaPayload {}

/** Odwieszenie: która usługa i (opcjonalnie) zgłoszenie klienta — powodem jest uzasadnienie wniosku. */
export class OdwieszenieUslugiPayload {
  @IsString()
  @MaxLength(64)
  subscriptionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  zgloszenie?: string;
}

export class ZawieszenieUslugiPayload extends OdwieszenieUslugiPayload {
  @IsOptional()
  @IsIn(POWODY_ZAWIESZENIA_OPERATORA)
  reason?: PowodZawieszeniaOperatora;
}

/** F3.5 — nowy koniec bieżącego okresu usługi (przedłużenie gratis albo skrócenie na prośbę klienta). */
export class DataOdnowieniaPayload {
  @IsString()
  @MaxLength(64)
  subscriptionId!: string;

  @IsISO8601({ strict: true })
  nowaData!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  zgloszenie?: string;
}

/** F3.5 — dodatek z katalogu dodany przez obsługę: z portfela klienta (na jego zgłoszenie) albo gratis. */
export class DodatekPayload {
  @IsString()
  @MaxLength(64)
  subscriptionId!: string;

  @IsIn(SLUGI_DODATKOW)
  slug!: string;

  @IsIn(PLATNOSCI_DODATKU)
  platnosc!: PlatnoscDodatku;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  zgloszenie?: string;
}

// ── zależności wykonawców (wstrzykiwane przez WnioskiService) ───────────────

export interface ZaleznosciWnioskow {
  prisma: {
    user: { findUnique(args: unknown): Promise<{ isInternal?: boolean; id?: string; email?: string } | null> };
    invoice: { findUnique(args: unknown): Promise<{ id: string; userId: string; number: string; status: string } | null> };
    subscription: { findUnique(args: unknown): Promise<{ userId: string; status: string } | null> };
  };
  /** F2.3 — ZawieszenieOperatoraService (subscriptions/zawieszenie-operatora.service.ts). */
  zawieszenie: {
    zgloszenieKlienta(klientId: string, wpis: string | null | undefined): Promise<string | null>;
    zawies(i: { subscriptionId: string; aktorUserId: string; reason: PowodZawieszeniaOperatora; powod?: string | null; zgloszenie?: string | null }): Promise<{ status: string }>;
    odwies(i: { subscriptionId: string; aktorUserId: string; powod?: string | null; zgloszenie?: string | null }): Promise<{ status: string }>;
  };
  /** F3.5 — CyklZyciaUslugiService (subscriptions/cykl-zycia-uslugi.service.ts). */
  cyklZycia: {
    zmienDateOdnowienia(i: {
      subscriptionId: string;
      operator: { userId: string; role: string };
      powod: string;
      zgloszenie?: string | null;
      nowaData: Date;
    }): Promise<{ bezZmian: boolean; komunikat: string }>;
  };
  /** F3.5 — AddonService (addons/addon.service.ts). */
  dodatki: {
    dodajPrzezOperatora(i: {
      subscriptionId: string;
      slug: string;
      platnosc: PlatnoscDodatku;
      operator: { userId: string; role: string };
      powod: string;
      zgloszenie?: string | null;
      klucz?: string | null;
    }): Promise<{ name: string; status: string; duplikat?: true }>;
  };
  uzytkownicy: {
    patchCustomerOperational(
      userId: string,
      actorUserId: string,
      dto: { isInternal?: boolean },
      ctx: { ipAddress?: string | null; userAgent?: string | null },
      aktor: { role: string; userId: string },
    ): Promise<unknown>;
    changeCustomerEmail(
      userId: string,
      actorUserId: string,
      newEmail: string,
      reason: string | undefined,
      ctx: { ipAddress?: string | null; userAgent?: string | null },
    ): Promise<{ email: string }>;
    resetCustomerPassword(
      userId: string,
      actorUserId: string,
      dto: { reason: string },
      ctx: { ipAddress?: string | null; userAgent?: string | null },
    ): Promise<{ linkWyslany: boolean; email: string }>;
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
  /** Uzasadnienie wnioskującego — powód operacji w dzienniku (D2). */
  uzasadnienie?: string;
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
const dzienPl = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
};

const ZAKONCZONE = ['CANCELED', 'EXPIRED'];
const zgl = (z?: string) => (z?.trim() ? ` (zgłoszenie #${z.trim().replace(/^#/, '').slice(0, 8)})` : '');

/** Usługa wniosku należy do klienta wniosku — inaczej 404 (w tabeli wniosków nie ma klucza obcego). */
async function uslugaKlienta(subscriptionId: string, klientId: string | null, z: ZaleznosciWnioskow) {
  const s = await z.prisma.subscription.findUnique({ where: { id: subscriptionId }, select: { userId: true, status: true } });
  if (!s || s.userId !== klientId) throw new NotFoundException('Usługa nie istnieje na koncie tego klienta.');
  return s;
}

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

  CUSTOMER_EMAIL_CHANGE: definicja<ZmianaEmailaPayload>({
    etykieta: 'Zmiana adresu e-mail klienta',
    uprawnienie: 'CUSTOMERS_MANAGE',
    doZlozenia: 'CUSTOMERS_VIEW',
    dto: ZmianaEmailaPayload,
    wymagaKlienta: true,
    opis: (p) => `Zmiana adresu e-mail na ${p.newEmail.trim().toLowerCase()}`,
    async sprawdzPrzyZlozeniu(p, klientId, z) {
      const nowy = p.newEmail.trim().toLowerCase();
      const obecny = await z.prisma.user.findUnique({ where: { id: klientId }, select: { email: true } });
      if (obecny?.email?.toLowerCase() === nowy) throw new BadRequestException('Nowy adres jest taki sam jak obecny.');
      const zajety = await z.prisma.user.findUnique({ where: { email: nowy }, select: { id: true } });
      if (zajety) throw new BadRequestException('Ten adres e-mail jest już przypisany do innego konta.');
    },
    async bezZmian(p, klientId, z) {
      const obecny = await z.prisma.user.findUnique({ where: { id: klientId }, select: { email: true } });
      return obecny?.email?.toLowerCase() === p.newEmail.trim().toLowerCase() ? 'Bez zmian — klient ma już ten adres e-mail.' : null;
    },
    async wykonaj(p, k, z) {
      const r = await z.uzytkownicy.changeCustomerEmail(k.klientId!, k.decydujacy.userId, p.newEmail, k.uzasadnienie, { ipAddress: null, userAgent: null });
      return { komunikat: `Adres e-mail zmieniony na ${r.email}.` };
    },
  }),

  CUSTOMER_PASSWORD_RESET: definicja<ResetHaslaPayload>({
    etykieta: 'Reset hasła klienta',
    uprawnienie: 'CUSTOMERS_MANAGE',
    doZlozenia: 'CUSTOMERS_VIEW',
    dto: ResetHaslaPayload,
    wymagaKlienta: true,
    opis: () => 'Reset hasła — klient dostanie link do ustawienia nowego',
    async wykonaj(_p, k, z) {
      const r = await z.uzytkownicy.resetCustomerPassword(
        k.klientId!,
        k.decydujacy.userId,
        { reason: k.uzasadnienie ?? `wniosek ${k.wniosekId}` },
        { ipAddress: null, userAgent: null },
      );
      return {
        komunikat: r.linkWyslany
          ? `Hasło zresetowane — link wysłany na ${r.email}.`
          : `Hasło zresetowane, ale mail z linkiem nie wyszedł — klient może użyć „Nie pamiętasz hasła?”.`,
      };
    },
  }),

  SUBSCRIPTION_SUSPEND: definicja<ZawieszenieUslugiPayload>({
    etykieta: 'Zawieszenie usługi',
    uprawnienie: 'SUBSCRIPTIONS_SUSPEND',
    // L2 (SUBSCRIPTIONS_MANAGE) składa wniosek z karty usługi; L1 zawieszenia nie zleca.
    doZlozenia: 'SUBSCRIPTIONS_MANAGE',
    dto: ZawieszenieUslugiPayload,
    wymagaKlienta: true,
    opis: (p) => `Zawieszenie usługi — strona, poczta i FTP klienta przestaną działać${zgl(p.zgloszenie)}`,
    async sprawdzPrzyZlozeniu(p, klientId, z) {
      const s = await uslugaKlienta(p.subscriptionId, klientId, z);
      if (s.status === 'SUSPENDED') throw new BadRequestException('Usługa jest już zawieszona.');
      if (ZAKONCZONE.includes(s.status)) throw new BadRequestException('Usługa jest zakończona — nie ma czego zawieszać.');
      await z.zawieszenie.zgloszenieKlienta(klientId!, p.zgloszenie);
    },
    async bezZmian(p, _klientId, z) {
      const s = await z.prisma.subscription.findUnique({ where: { id: p.subscriptionId }, select: { userId: true, status: true } });
      return s?.status === 'SUSPENDED' ? 'Bez zmian — usługa była już zawieszona.' : null;
    },
    async wykonaj(p, k, z) {
      await z.zawieszenie.zawies({
        subscriptionId: p.subscriptionId,
        aktorUserId: k.decydujacy.userId,
        reason: p.reason ?? 'MANUAL_ADMIN',
        powod: k.uzasadnienie ?? `wniosek ${k.wniosekId}`,
        zgloszenie: p.zgloszenie,
      });
      return { komunikat: 'Usługa zawieszona.' };
    },
  }),

  SUBSCRIPTION_UNSUSPEND: definicja<OdwieszenieUslugiPayload>({
    etykieta: 'Odwieszenie usługi',
    uprawnienie: 'SUBSCRIPTIONS_SUSPEND',
    doZlozenia: 'SUBSCRIPTIONS_MANAGE',
    dto: OdwieszenieUslugiPayload,
    wymagaKlienta: true,
    opis: (p) => `Odwieszenie usługi bez obciążenia za odnowienie${zgl(p.zgloszenie)}`,
    async sprawdzPrzyZlozeniu(p, klientId, z) {
      const s = await uslugaKlienta(p.subscriptionId, klientId, z);
      if (s.status !== 'SUSPENDED') throw new BadRequestException('Usługa nie jest zawieszona.');
      await z.zawieszenie.zgloszenieKlienta(klientId!, p.zgloszenie);
    },
    async bezZmian(p, _klientId, z) {
      const s = await z.prisma.subscription.findUnique({ where: { id: p.subscriptionId }, select: { userId: true, status: true } });
      return s && s.status !== 'SUSPENDED' ? 'Bez zmian — usługa nie była już zawieszona.' : null;
    },
    async wykonaj(p, k, z) {
      await z.zawieszenie.odwies({
        subscriptionId: p.subscriptionId,
        aktorUserId: k.decydujacy.userId,
        powod: k.uzasadnienie ?? `wniosek ${k.wniosekId}`,
        zgloszenie: p.zgloszenie,
      });
      return { komunikat: 'Usługa odwieszona.' };
    },
  }),

  SUBSCRIPTION_RENEWAL_DATE: definicja<DataOdnowieniaPayload>({
    etykieta: 'Zmiana daty odnowienia usługi',
    uprawnienie: 'BILLING_MANAGE',
    // Bezpośrednio: POST admin/subscriptions/:id/data-odnowienia — strażnik BILLING_MANAGE + SUBSCRIPTIONS_MANAGE.
    uprawnieniaDodatkowe: ['SUBSCRIPTIONS_MANAGE'],
    doZlozenia: 'SUBSCRIPTIONS_MANAGE',
    dto: DataOdnowieniaPayload,
    wymagaKlienta: true,
    opis: (p) => `Nowa data odnowienia: ${dzienPl(p.nowaData)}${zgl(p.zgloszenie)}`,
    async sprawdzPrzyZlozeniu(p, klientId, z) {
      const s = await uslugaKlienta(p.subscriptionId, klientId, z);
      if (s.status !== 'ACTIVE') throw new BadRequestException('Datę odnowienia zmienisz tylko w aktywnej usłudze.');
      await z.zawieszenie.zgloszenieKlienta(klientId!, p.zgloszenie);
    },
    async wykonaj(p, k, z) {
      const r = await z.cyklZycia.zmienDateOdnowienia({
        subscriptionId: p.subscriptionId,
        operator: k.decydujacy,
        powod: k.uzasadnienie ?? `wniosek ${k.wniosekId}`,
        zgloszenie: p.zgloszenie,
        nowaData: new Date(p.nowaData),
      });
      return { komunikat: r.komunikat, ...(r.bezZmian ? { bezZmian: true } : {}) };
    },
  }),

  ADDON_ADD: definicja<DodatekPayload>({
    etykieta: 'Dodanie dodatku do usługi',
    uprawnienie: 'BILLING_MANAGE',
    // Bezpośrednio: POST admin/subscriptions/:id/dodatki — strażnik BILLING_MANAGE + SUBSCRIPTIONS_MANAGE.
    uprawnieniaDodatkowe: ['SUBSCRIPTIONS_MANAGE'],
    doZlozenia: 'SUBSCRIPTIONS_MANAGE',
    dto: DodatekPayload,
    wymagaKlienta: true,
    opis: (p) => `Dodatek ${p.slug} — ${p.platnosc === 'GRATIS' ? 'gratis (koszt Verris)' : 'z portfela klienta'}${zgl(p.zgloszenie)}`,
    async sprawdzPrzyZlozeniu(p, klientId, z) {
      const s = await uslugaKlienta(p.subscriptionId, klientId, z);
      if (ZAKONCZONE.includes(s.status)) throw new BadRequestException('Usługa jest zakończona — dodatku nie dodasz.');
      const zgloszenieId = await z.zawieszenie.zgloszenieKlienta(klientId!, p.zgloszenie);
      if (p.platnosc === 'PORTFEL' && !zgloszenieId) {
        throw new BadRequestException('Obciążenie portfela klienta tylko na jego zamówienie — podaj numer jego zgłoszenia albo wybierz gratis.');
      }
    },
    async wykonaj(p, k, z) {
      // Klucz z id wniosku — ten sam wniosek drugi raz nie doda dodatku (obok blokady statusu).
      const r = await z.dodatki.dodajPrzezOperatora({
        subscriptionId: p.subscriptionId,
        slug: p.slug,
        platnosc: p.platnosc,
        operator: k.decydujacy,
        powod: k.uzasadnienie ?? `wniosek ${k.wniosekId}`,
        zgloszenie: p.zgloszenie,
        klucz: `wniosek:${k.wniosekId}`,
      });
      return { komunikat: r.duplikat ? `Dodatek „${r.name}” był już dodany.` : `Dodano dodatek „${r.name}”.`, ...(r.duplikat ? { bezZmian: true } : {}) };
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
