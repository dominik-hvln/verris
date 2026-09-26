import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { PromoService } from './promo.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesService } from './invoices.service';
import { etykietaStawki, rozbicieWgStawki, STAWKA_PL } from './vat';
import { VatNabywcyService } from './vat-nabywcy.service';
import { RODZAJ_PROFORMA } from './tryb-fakturowania';

/**
 * Koniec kolejnego okresu rozliczeniowego — ta sama arytmetyka co `addInterval` w
 * renewal.scheduler.ts (import stamtąd wciągałby moduł subskrypcji do billingu).
 */
export function koniecOkresu(od: Date, interval: 'MONTH' | 'YEAR'): Date {
  const d = new Date(od);
  if (interval === 'YEAR') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/**
 * M-24 — faktura proforma na najbliższe odnowienie.
 *
 * Generowana na żądanie, niczego nie zapisuje i nie bierze numeru z żadnej serii
 * dokumentów sprzedaży (proforma nie jest dokumentem księgowym). Kwota liczona tym
 * samym PromoService.resolveNextRenewalAmount, którym obciąża odnowienie i liczy mail
 * przypominający — proforma nie może pokazywać innej kwoty niż ta, którą pobierzemy.
 */
@Injectable()
export class ProformaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promo: PromoService,
    private readonly pdf: InvoicePdfService,
    private readonly invoices: InvoicesService,
    private readonly vatNabywcy: VatNabywcyService,
  ) {}

  async render(userId: string, subscriptionId: string): Promise<{ pdf: Uint8Array; filename: string }> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { plan: true, account: true },
    });
    if (!sub) throw new NotFoundException('Nie znaleziono usługi.');
    if (
      (sub.status !== SubscriptionStatus.ACTIVE && sub.status !== SubscriptionStatus.PAST_DUE) ||
      sub.cancelAt ||
      !sub.currentPeriodEnd
    ) {
      throw new ConflictException('Ta usługa nie ma zaplanowanego odnowienia — proforma nie jest potrzebna.');
    }
    if (sub.paymentSource === 'MANUAL') {
      throw new ConflictException('Tę usługę rozliczasz bezpośrednio ze swoim opiekunem — proforma z panelu nie dotyczy.');
    }

    const brutto = await this.promo.resolveNextRenewalAmount({
      priceAmount: sub.priceAmount,
      listPriceAmount: sub.listPriceAmount,
      appliedPromoCodeId: sub.appliedPromoCodeId,
      introDiscountPct: sub.introDiscountPct,
      introDiscountPeriodsLeft: sub.introDiscountPeriodsLeft,
      individualPrice: sub.individualPrice,
    });
    // M-09: stawka nabywcy; klient rozliczany netto płaci K / 1,23 (tyle musi doładować).
    const { traktowanie: t } = await this.vatNabywcy.ustal(userId);
    const doZaplaty = t.cenaNetto
      ? brutto.mul(100).dividedBy(100 + STAWKA_PL).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : brutto;
    const { netto, vat } = rozbicieWgStawki(doZaplaty, t.stawka);
    const od = sub.currentPeriodEnd;
    const doKonca = koniecOkresu(od, sub.interval);
    const dzien = (d: Date) => d.toISOString().slice(0, 10);
    const pl = (d: Date) => d.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
    const nazwa =
      `${sub.plan?.name ?? 'Hosting'} — odnowienie ${sub.interval === 'YEAR' ? 'roczne' : 'miesięczne'}` +
      (sub.account?.domain ? ` (${sub.account.domain})` : '') +
      `, okres ${pl(od)}–${pl(doKonca)}`;
    const numer = `PRO/${dzien(od).replace(/-/g, '')}/${sub.id.slice(0, 8).toUpperCase()}`;
    const kwota = (d: { toFixed(n: number): string }) => d.toFixed(2);

    const pdf = await this.pdf.render({
      number: numer,
      rodzajPrawny: RODZAJ_PROFORMA,
      issuedAt: new Date(),
      saleDate: od,
      dueAt: od,
      isPaid: false,
      paymentMethodLabel:
        sub.paymentSource === 'WALLET' ? 'Portfel Verris (doładowanie w panelu)' : 'Karta płatnicza (Stripe)',
      currency: (sub.currency ?? 'PLN').toUpperCase() as 'PLN' | 'EUR' | 'USD',
      seller: await this.invoices.buildSellerSnapshot(),
      buyer: await this.invoices.buildBuyerSnapshot(userId),
      lineItems: [
        {
          name: nazwa,
          quantity: 1,
          unitNet: kwota(netto),
          vatRate: t.stawka ?? 0,
          totalNet: kwota(netto),
          totalVat: kwota(vat),
          totalGross: kwota(doZaplaty),
          ...(t.stawka === null || !Number.isInteger(t.stawka) ? { vatLabel: etykietaStawki(t.stawka) } : {}),
        },
      ],
      totalNet: kwota(netto),
      totalVat: kwota(vat),
      totalGross: kwota(doZaplaty),
      vatRate: t.stawka ?? 0,
      vat: { etykieta: etykietaStawki(t.stawka), adnotacja: t.adnotacja, kurs: null, vatPln: null },
    });
    return { pdf, filename: `proforma-${numer.replace(/\//g, '-')}.pdf` };
  }
}
