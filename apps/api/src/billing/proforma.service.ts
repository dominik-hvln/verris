import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ProformaActions } from '../common/audit/audit.actions.js';
import { MailerService } from '../mail/mailer.service.js';
import { proformaAnulowanaTemplate, proformaWystawionaTemplate } from '../mail/templates/invoice-notifications.js';
import { PromoService } from './promo.service.js';
import { InvoicePdfService, type BuyerSnapshot, type InvoiceLineItem, type SellerSnapshot } from './invoice-pdf.service.js';
import { InvoicesService } from './invoices.service.js';
import { etykietaStawki, rozbicieWgStawki, wplataZaK, type TraktowanieVat } from './vat.js';
import { nazwaPozycjiUslugi } from './pozycja-uslugi.js';
import { VatNabywcyService } from './vat-nabywcy.service.js';
import { RODZAJ_PROFORMA } from './tryb-fakturowania.js';
import { nadajNumerFaktury } from './faktura-za-portfel.js';
import { DoladowanieService } from './doladowanie.service.js';

export { koniecOkresu } from './pozycja-uslugi.js';

/** K4 — seria proform: rozłączna z seriami dokumentów sprzedaży (VFV/VFK/VDR/VDK), własny licznik w InvoiceCounter. */
export const SERIA_PROFORMY = 'PRO';
export const STATUSY_PROFORMY = ['WYSTAWIONA', 'OPLACONA', 'ANULOWANA'] as const;
export type StatusProformy = (typeof STATUSY_PROFORMY)[number];
export const MAKS_POZYCJI_PROFORMY = 10;
/** Paynow nie przyjmie płatności poniżej 1 zł (https://docs.paynow.pl/docs/reference/v3/send-payment-request). */
export const MIN_KWOTA_PROFORMY = new Prisma.Decimal(1);
export const MAKS_KWOTA_PROFORMY = new Prisma.Decimal(100_000);
export const TERMIN_PROFORMY_DNI = 7;
export const MIN_POWOD_ANULOWANIA = 10;

const DZIEN = 24 * 60 * 60 * 1000;
const kwota2 = (d: Prisma.Decimal) => d.toFixed(2);

/**
 * K4 — pozycje i suma proformy liczone jak faktura zbiorcza (faktura-za-portfel.ts `pozycjeZbiorcze`): rozbicie VAT
 * per pozycja tą samą funkcją co dokument za wpłatę (`rozbicieWgStawki`), suma = suma pozycji (netto + VAT = brutto).
 */
export function policzProforme(
  pozycje: Array<{ nazwa: string; brutto: Prisma.Decimal }>,
  t: Pick<TraktowanieVat, 'stawka'>,
): { lineItems: InvoiceLineItem[]; netto: Prisma.Decimal; vat: Prisma.Decimal; brutto: Prisma.Decimal } {
  let netto = new Prisma.Decimal(0);
  let vat = new Prisma.Decimal(0);
  let brutto = new Prisma.Decimal(0);
  const lineItems = pozycje.map((p) => {
    const r = rozbicieWgStawki(p.brutto, t.stawka);
    netto = netto.plus(r.netto);
    vat = vat.plus(r.vat);
    brutto = brutto.plus(r.brutto);
    return {
      name: p.nazwa,
      quantity: 1,
      unitNet: kwota2(r.netto),
      vatRate: t.stawka ?? 0,
      totalNet: kwota2(r.netto),
      totalVat: kwota2(r.vat),
      totalGross: kwota2(r.brutto),
      ...(t.stawka === null || !Number.isInteger(t.stawka) ? { vatLabel: etykietaStawki(t.stawka) } : {}),
    };
  });
  return { lineItems, netto, vat, brutto };
}

/** Kwota z formularza operatora: dodatnia, najwyżej dwa miejsca po przecinku. */
export function kwotaPozycji(k: number | string): Prisma.Decimal {
  let d: Prisma.Decimal;
  try {
    d = new Prisma.Decimal(k);
  } catch {
    throw new BadRequestException('Nieprawidłowa kwota pozycji.');
  }
  if (!d.isFinite() || d.lte(0) || !d.eq(d.toDecimalPlaces(2))) {
    throw new BadRequestException('Kwota pozycji musi być dodatnia i mieć najwyżej dwa miejsca po przecinku.');
  }
  return d;
}

export interface Operator {
  userId: string;
  role: string;
}

/**
 * M-24 — faktura proforma na najbliższe odnowienie (PDF na żądanie, niczego nie zapisuje).
 * K4 (PB-53.6) — proforma wystawiona przez operatora: zapisana, z własną serią PRO/RRRR/MM/NNNN, z linkiem do płatności
 * w mailu. Zapłata idzie istniejącą ścieżką doładowania (Paynow — BillingService.zaplacProforme; przelew —
 * RozliczeniaOperatoraService.zaksiegujPrzelew), a przejście na OPLACONA dzieje się w tej samej transakcji co wpis księgi
 * i dokument za wpłatę (DoladowanieService.zaksieguj). Proforma nie jest dokumentem księgowym i nie trafia do KSeF.
 *
 * Kwota pozycji „odnowienie” liczona tym samym PromoService.resolveNextRenewalAmount, którym obciąża odnowienie —
 * proforma nie może pokazywać innej kwoty niż ta, którą pobierzemy.
 */
@Injectable()
export class ProformaService {
  private readonly logger = new Logger(ProformaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly promo: PromoService,
    private readonly pdf: InvoicePdfService,
    private readonly invoices: InvoicesService,
    private readonly vatNabywcy: VatNabywcyService,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly mailer?: MailerService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /** Pozycja „odnowienie usługi” — wspólna dla PDF na żądanie (M-24) i proformy operatora (K4). */
  private async pozycjaOdnowienia(userId: string, subscriptionId: string) {
    return pozycjaOdnowieniaUslugi({ prisma: this.prisma, promo: this.promo, ustal: (u) => this.vatNabywcy.ustal(u) }, userId, subscriptionId);
  }

  async render(userId: string, subscriptionId: string): Promise<{ pdf: Uint8Array; filename: string }> {
    const { sub, od, nazwa, doZaplaty, traktowanie: t } = await this.pozycjaOdnowienia(userId, subscriptionId);
    const { netto, vat } = rozbicieWgStawki(doZaplaty, t.stawka);
    const dzien = (d: Date) => d.toISOString().slice(0, 10);
    const numer = `PRO/${dzien(od).replace(/-/g, '')}/${sub.id.slice(0, 8).toUpperCase()}`;

    const pdf = await this.pdf.render({
      number: numer,
      rodzajPrawny: RODZAJ_PROFORMA,
      issuedAt: new Date(),
      saleDate: od,
      dueAt: od,
      isPaid: false,
      paymentMethodLabel:
        sub.paymentSource === 'WALLET' ? 'Portfel Verris (doładowanie w panelu)' : 'Karta płatnicza',
      currency: (sub.currency ?? 'PLN').toUpperCase() as 'PLN' | 'EUR' | 'USD',
      seller: await this.invoices.buildSellerSnapshot(),
      buyer: await this.invoices.buildBuyerSnapshot(userId),
      lineItems: [
        {
          name: nazwa,
          quantity: 1,
          unitNet: kwota2(netto),
          vatRate: t.stawka ?? 0,
          totalNet: kwota2(netto),
          totalVat: kwota2(vat),
          totalGross: kwota2(doZaplaty),
          ...(t.stawka === null || !Number.isInteger(t.stawka) ? { vatLabel: etykietaStawki(t.stawka) } : {}),
        },
      ],
      totalNet: kwota2(netto),
      totalVat: kwota2(vat),
      totalGross: kwota2(doZaplaty),
      vatRate: t.stawka ?? 0,
      vat: { etykieta: etykietaStawki(t.stawka), adnotacja: t.adnotacja, kurs: null, vatPln: null },
    });
    return { pdf, filename: `proforma-${numer.replace(/\//g, '-')}.pdf` };
  }

  // ── K4 — proforma wystawiona przez operatora ─────────────────────────────

  private panelUrl(): string {
    return (this.config?.get<string>('clientPanelUrl') ?? 'https://panel.verris.pl').replace(/\/$/, '');
  }

  async wystaw(z: {
    userId: string;
    operator: Operator;
    pozycje?: Array<{ nazwa: string; kwotaBrutto: number | string }>;
    odnowienieSubscriptionId?: string | null;
    terminDni?: number | null;
    teraz?: Date;
  }) {
    const teraz = z.teraz ?? new Date();
    const u = await this.prisma.user.findUnique({
      where: { id: z.userId },
      select: { id: true, role: true, email: true, firstName: true, anonymizedAt: true, customerOwnerId: true },
    });
    if (!u || u.anonymizedAt) throw new NotFoundException('Klient nie istnieje.');
    if (z.operator.role !== 'ADMIN' && u.role !== 'USER') {
      throw new ForbiddenException('Personel wystawia proformy wyłącznie klientom — konto zespołu obsługuje administrator.');
    }
    if (u.customerOwnerId) throw new BadRequestException('To subkonto — proformę wystaw właścicielowi konta (portfel jest u niego).');

    const wolne = (z.pozycje ?? []).map((p) => {
      const nazwa = (p.nazwa ?? '').trim().replace(/\s+/g, ' ');
      if (nazwa.length < 3 || nazwa.length > 200) throw new BadRequestException('Opis pozycji: od 3 do 200 znaków.');
      return { nazwa, brutto: kwotaPozycji(p.kwotaBrutto) };
    });
    const pozycje: Array<{ nazwa: string; brutto: Prisma.Decimal }> = [];
    let traktowanie: TraktowanieVat;
    let vies: Awaited<ReturnType<VatNabywcyService['ustal']>>['vies'];
    let subscriptionId: string | null = null;
    if (z.odnowienieSubscriptionId) {
      const o = await this.pozycjaOdnowienia(z.userId, z.odnowienieSubscriptionId);
      // Wpłata do proformy trafia do portfela; odnowienie z portfela robi harmonogram (renewal.scheduler.ts).
      // Usługa na karcie cyklicznej odnawia się z karty — proforma dałaby drugie obciążenie za ten sam okres.
      if (o.sub.paymentSource !== 'WALLET') {
        throw new ConflictException('Ta usługa odnawia się z karty — proforma na odnowienie dotyczy usług rozliczanych z portfela.');
      }
      pozycje.push({ nazwa: o.nazwa, brutto: o.doZaplaty });
      traktowanie = o.traktowanie;
      vies = o.vies;
      subscriptionId = o.sub.id;
    } else {
      ({ traktowanie, vies } = await this.vatNabywcy.ustal(z.userId));
    }
    pozycje.push(...wolne);
    if (pozycje.length === 0) throw new BadRequestException('Proforma musi mieć co najmniej jedną pozycję.');
    if (pozycje.length > MAKS_POZYCJI_PROFORMY) throw new BadRequestException(`Najwyżej ${MAKS_POZYCJI_PROFORMY} pozycji na proformie.`);

    const suma = policzProforme(pozycje, traktowanie);
    if (suma.brutto.lt(MIN_KWOTA_PROFORMY) || suma.brutto.gt(MAKS_KWOTA_PROFORMY)) {
      throw new BadRequestException(`Kwota proformy musi być z zakresu ${MIN_KWOTA_PROFORMY.toFixed(2)}–${MAKS_KWOTA_PROFORMY.toFixed(0)} zł.`);
    }
    const terminDni = Math.trunc(z.terminDni ?? TERMIN_PROFORMY_DNI);
    if (!(terminDni >= 1 && terminDni <= 60)) throw new BadRequestException('Termin płatności: od 1 do 60 dni.');
    const [seller, buyer] = await Promise.all([this.invoices.buildSellerSnapshot(), this.invoices.buildBuyerSnapshot(z.userId)]);

    const pf = await this.prisma.$transaction(async (tx) => {
      const number = await nadajNumerFaktury(tx, teraz, SERIA_PROFORMY);
      return tx.proforma.create({
        data: {
          userId: z.userId,
          subscriptionId,
          number,
          amount: suma.brutto,
          netAmount: suma.netto,
          vatAmount: suma.vat,
          currency: 'PLN',
          lineItems: suma.lineItems as unknown as Prisma.InputJsonValue,
          vatMeta: DoladowanieService.doMetadanych(traktowanie, vies),
          sellerSnapshot: seller as unknown as Prisma.InputJsonValue,
          buyerSnapshot: buyer as unknown as Prisma.InputJsonValue,
          issuedAt: teraz,
          dueAt: new Date(teraz.getTime() + terminDni * DZIEN),
          createdById: z.operator.userId,
        },
      });
    });

    await this.audit?.record({
      action: ProformaActions.PROFORMA_WYSTAWIONA,
      userId: z.userId,
      actorUserId: z.operator.userId,
      details: { proformaId: pf.id, numer: pf.number, kwota: kwota2(suma.brutto), subscriptionId },
    });
    const link = `${this.panelUrl()}/dashboard/billing?proforma=${pf.id}#proformy`;
    let mail = true;
    try {
      if (!this.mailer) throw new Error('brak mailera');
      const m = proformaWystawionaTemplate({
        to: u.email,
        firstName: u.firstName,
        number: pf.number,
        amount: kwota2(suma.brutto),
        currency: 'PLN',
        dueAt: pf.dueAt,
        payUrl: link,
        panelUrl: this.panelUrl(),
      });
      await this.mailer.send({ ...m, category: 'TRANSACTIONAL', fromRole: 'BILLING' });
    } catch (err) {
      mail = false;
      this.logger.warn(`Proforma ${pf.number}: mail do klienta nie wyszedł: ${err instanceof Error ? err.message : String(err)}`);
    }
    return {
      id: pf.id,
      numer: pf.number,
      kwota: kwota2(suma.brutto),
      link,
      komunikat: mail
        ? `Wystawiono proformę ${pf.number} na ${kwota2(suma.brutto)} zł — klient dostał e-mail z linkiem do płatności.`
        : `Wystawiono proformę ${pf.number} na ${kwota2(suma.brutto)} zł, ale e-mail nie wyszedł — przekaż klientowi link: ${link}`,
    };
  }

  async anuluj(z: { id: string; operator: Operator; powod: string; teraz?: Date }) {
    const powod = (z.powod ?? '').trim();
    if (powod.length < MIN_POWOD_ANULOWANIA) {
      throw new BadRequestException(`Podaj powód anulowania (min. ${MIN_POWOD_ANULOWANIA} znaków) — zapisze się w dzienniku.`);
    }
    const pf = await this.prisma.proforma.findUnique({
      where: { id: z.id },
      select: { id: true, userId: true, number: true, amount: true, user: { select: { email: true, firstName: true, role: true } } },
    });
    if (!pf) throw new NotFoundException('Nie znaleziono proformy.');
    if (z.operator.role !== 'ADMIN' && pf.user.role !== 'USER') throw new ForbiddenException('Proformę konta zespołu anuluje administrator.');
    // Warunek na stanie w samym UPDATE: wpłata trzymająca blokadę wiersza (DoladowanieService.zaksieguj) wygrywa,
    // a anulowanie po niej nic nie zmienia.
    const { count } = await this.prisma.proforma.updateMany({
      where: { id: pf.id, status: 'WYSTAWIONA' },
      data: { status: 'ANULOWANA', cancelledAt: z.teraz ?? new Date(), cancelReason: powod.slice(0, 500) },
    });
    if (count === 0) throw new ConflictException('Tej proformy nie można anulować — jest już opłacona albo anulowana.');
    await this.audit?.record({
      action: ProformaActions.PROFORMA_ANULOWANA,
      userId: pf.userId,
      actorUserId: z.operator.userId,
      details: { proformaId: pf.id, numer: pf.number, powod: powod.slice(0, 500) },
    });
    try {
      if (this.mailer) {
        const m = proformaAnulowanaTemplate({ to: pf.user.email, firstName: pf.user.firstName, number: pf.number, panelUrl: this.panelUrl() });
        await this.mailer.send({ ...m, category: 'TRANSACTIONAL', fromRole: 'BILLING' });
      }
    } catch (err) {
      this.logger.warn(`Proforma ${pf.number}: mail o anulowaniu nie wyszedł: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { komunikat: `Anulowano proformę ${pf.number}. Klient nie zapłaci jej już w panelu.` };
  }

  private static wiersz(p: {
    id: string; number: string; status: string; amount: Prisma.Decimal; netAmount: Prisma.Decimal; vatAmount: Prisma.Decimal;
    currency: string; issuedAt: Date; dueAt: Date; paidAt: Date | null; cancelledAt: Date | null; lineItems: Prisma.JsonValue;
    subscriptionId: string | null; invoice: { id: string; number: string } | null;
  }) {
    const pozycje = Array.isArray(p.lineItems) ? (p.lineItems as unknown as InvoiceLineItem[]) : [];
    return {
      id: p.id,
      numer: p.number,
      status: p.status as StatusProformy,
      kwota: kwota2(p.amount),
      netto: kwota2(p.netAmount),
      vat: kwota2(p.vatAmount),
      waluta: p.currency,
      wystawiono: p.issuedAt.toISOString(),
      termin: p.dueAt.toISOString(),
      oplacono: p.paidAt?.toISOString() ?? null,
      anulowano: p.cancelledAt?.toISOString() ?? null,
      pozycje: pozycje.map((x) => ({ nazwa: x.name, brutto: x.totalGross })),
      subscriptionId: p.subscriptionId,
      faktura: p.invoice,
    };
  }

  private static readonly WYBOR = {
    id: true, number: true, status: true, amount: true, netAmount: true, vatAmount: true, currency: true, issuedAt: true,
    dueAt: true, paidAt: true, cancelledAt: true, cancelReason: true, lineItems: true, subscriptionId: true, createdById: true,
    invoice: { select: { id: true, number: true } },
  } as const;

  /** Panel klienta (Płatności): proformy klienta, najnowsze pierwsze. */
  async listaKlienta(userId: string) {
    const rows = await this.prisma.proforma.findMany({ where: { userId }, orderBy: { issuedAt: 'desc' }, take: 50, select: ProformaService.WYBOR });
    return { rows: rows.map((r) => ProformaService.wiersz(r)) };
  }

  /** Karta klienta w panelu operatora: jak u klienta + powód anulowania. */
  async listaOperatora(userId: string) {
    const rows = await this.prisma.proforma.findMany({ where: { userId }, orderBy: { issuedAt: 'desc' }, take: 50, select: ProformaService.WYBOR });
    return { rows: rows.map((r) => ({ ...ProformaService.wiersz(r), powodAnulowania: r.cancelReason, wystawil: r.createdById })) };
  }

  /** PDF zapisanej proformy (z migawek z dnia wystawienia). `userId` = właściciel; null = operator (BILLING_VIEW). */
  async pdfZapisanej(id: string, userId: string | null): Promise<{ pdf: Uint8Array; filename: string }> {
    const p = await this.prisma.proforma.findFirst({ where: { id, ...(userId ? { userId } : {}) } });
    if (!p) throw new NotFoundException('Nie znaleziono proformy.');
    const meta = DoladowanieService.zMetadanych(p.vatMeta as Record<string, string>);
    const t = meta?.traktowanie ?? null;
    const pdf = await this.pdf.render({
      number: p.number,
      rodzajPrawny: RODZAJ_PROFORMA,
      issuedAt: p.issuedAt,
      saleDate: p.issuedAt,
      dueAt: p.dueAt,
      isPaid: p.status === 'OPLACONA',
      paymentMethodLabel: 'Płatność online w panelu klienta albo przelew (tytuł: numer proformy)',
      currency: p.currency as 'PLN',
      seller: (p.sellerSnapshot ?? (await this.invoices.buildSellerSnapshot())) as unknown as SellerSnapshot,
      buyer: (p.buyerSnapshot ?? (await this.invoices.buildBuyerSnapshot(p.userId))) as unknown as BuyerSnapshot,
      lineItems: p.lineItems as unknown as InvoiceLineItem[],
      totalNet: kwota2(p.netAmount),
      totalVat: kwota2(p.vatAmount),
      totalGross: kwota2(p.amount),
      vatRate: t?.stawka ?? 0,
      vat: t ? { etykieta: etykietaStawki(t.stawka), adnotacja: t.adnotacja, kurs: null, vatPln: null } : undefined,
    });
    return { pdf, filename: `proforma-${p.number.replace(/\//g, '-')}.pdf` };
  }
}

type ZaleznosciOdnowienia = {
  prisma: Pick<PrismaService, 'subscription'>;
  promo: Pick<PromoService, 'resolveNextRenewalAmount'>;
  ustal: (userId: string) => Promise<{ traktowanie: TraktowanieVat; vies: Awaited<ReturnType<VatNabywcyService['ustal']>>['vies'] }>;
};

/** Pozycja „odnowienie usługi” (nazwa z planem, domeną i okresem; kwota do zapłaty) — przy wystawieniu i przy wpłacie. */
export async function pozycjaOdnowieniaUslugi(d: ZaleznosciOdnowienia, userId: string, subscriptionId: string, o: { zawieszona?: boolean } = {}) {
  const sub = await d.prisma.subscription.findFirst({
    where: { id: subscriptionId, userId },
    include: { plan: true, account: true },
  });
  if (!sub) throw new NotFoundException('Nie znaleziono usługi.');
  const odnawialna =
    sub.status === SubscriptionStatus.ACTIVE ||
    sub.status === SubscriptionStatus.PAST_DUE ||
    (o.zawieszona === true && sub.status === SubscriptionStatus.SUSPENDED);
  if (!odnawialna || sub.cancelAt || !sub.currentPeriodEnd) {
    throw new ConflictException('Ta usługa nie ma zaplanowanego odnowienia — proforma nie jest potrzebna.');
  }
  if (sub.paymentSource === 'MANUAL') {
    throw new ConflictException('Tę usługę rozliczasz bezpośrednio ze swoim opiekunem — proforma z panelu nie dotyczy.');
  }

  const brutto = await d.promo.resolveNextRenewalAmount({
    priceAmount: sub.priceAmount,
    listPriceAmount: sub.listPriceAmount,
    appliedPromoCodeId: sub.appliedPromoCodeId,
    introDiscountPct: sub.introDiscountPct,
    introDiscountPeriodsLeft: sub.introDiscountPeriodsLeft,
    individualPrice: sub.individualPrice,
  });
  // M-09: stawka nabywcy; klient rozliczany netto płaci K / 1,23 zaokrąglone w górę (vat.ts wplataZaK).
  const { traktowanie, vies } = await d.ustal(userId);
  const doZaplaty = wplataZaK(brutto, traktowanie);
  const od = sub.currentPeriodEnd;
  const nazwa = nazwaPozycjiUslugi({
    plan: sub.plan?.name ?? 'Hosting',
    interval: sub.interval,
    domena: sub.account?.domain ?? null,
    od,
    rodzaj: 'odnowienie',
  });
  return { sub, od, nazwa, doZaplaty, traktowanie, vies };
}

/**
 * Przegląd 15.10 — proforma „odnowienie” nie była związana z okresem: płatna przez 60 dni bez względu na to, co stało się
 * z usługą. Klient płacił drugi raz za okres odnowiony z salda albo opłacony inną proformą, płacił starą kwotę po zmianie
 * planu (i i tak tracił usługę), płacił za usługę anulowaną — a dokument VAT opisywał sprzedaż, której nie było.
 * Kotwica bez migracji: pozycja odnowienia zapisana na proformie (nazwa z okresem, planem i domeną + kwota) musi być
 * równa pozycji policzonej TERAZ. Zwraca powód nieaktualności albo null. Sprawdzane przed płatnością Paynow i przy
 * księgowaniu przelewu do proformy.
 */
export async function powodNieaktualnejProformy(
  d: ZaleznosciOdnowienia & { prisma: Pick<PrismaService, 'subscription' | 'proforma'> },
  pf: { id: string; userId: string; subscriptionId: string | null; lineItems: unknown },
): Promise<string | null> {
  if (!pf.subscriptionId) return null;
  let teraz: Awaited<ReturnType<typeof pozycjaOdnowieniaUslugi>>;
  try {
    teraz = await pozycjaOdnowieniaUslugi(d, pf.userId, pf.subscriptionId, { zawieszona: true });
  } catch {
    return 'usługa nie ma już zaplanowanego odnowienia (anulowana, wygasła albo przeniesiona)';
  }
  if (teraz.sub.paymentSource !== 'WALLET') return 'usługa odnawia się teraz z karty';
  const pozycja = (Array.isArray(pf.lineItems) ? pf.lineItems[0] : null) as { name?: string; totalGross?: string | number } | null;
  if (!pozycja || pozycja.name !== teraz.nazwa) return 'okres, plan albo domena usługi zmieniły się od wystawienia (np. okres odnowiono z salda)';
  if (!new Prisma.Decimal(pozycja.totalGross ?? 0).eq(teraz.doZaplaty)) return 'cena odnowienia zmieniła się od wystawienia';
  const inne = await d.prisma.proforma.findMany({
    where: { subscriptionId: pf.subscriptionId, status: 'OPLACONA', id: { not: pf.id } },
    select: { number: true, lineItems: true },
  });
  const oplacona = inne.find((x) => Array.isArray(x.lineItems) && (x.lineItems[0] as { name?: string } | undefined)?.name === teraz.nazwa);
  if (oplacona) return `ten okres opłacono już proformą ${oplacona.number}`;
  return null;
}
