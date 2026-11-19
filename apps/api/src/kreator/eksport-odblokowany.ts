import { BillingInterval, ProductKind, SubscriptionPaymentSource, SubscriptionStatus } from '@verris/database';
import type { PrismaService } from '../prisma/prisma.service.js';
import { wProbie } from '../subscriptions/okres-probny.js';

/**
 * Paczka 134 – prawo do zabrania plików (decyzja właściciela 19.11.2026): pobranie strony w ZIP i plików marki
 * odblokowuje usługa hostingu, która ma 3 opłacone miesiące albo jest na planie rocznym.
 *
 *  - okres próbny się nie liczy; po konwersji liczymy od trialConvertedAt (inaczej od createdAt);
 *  - koniec opłaconego czasu = currentPeriodEnd; przy karcie (STRIPE_CARD) w statusie PAST_DUE albo SUSPENDED –
 *    currentPeriodStart, bo Stripe przesuwa okres przy próbie odnowienia, zanim płatność przejdzie;
 *  - plan roczny odblokowuje od razu, ale nie gdy usługę anulowano w ciągu 14 dni (zwrot) – tylko tu koniec
 *    skraca canceledAt;
 *  - plan miesięczny: opłacony czas sięga co najmniej 3 miesięcy kalendarzowych od początku płatności
 *    (z tolerancją 1 dnia); anulowanie z natychmiastowym skutkiem nie skraca – za miesiąc nie ma zwrotu,
 *    więc opłacone okresy się liczą;
 *  - świadoma pobłażliwość: czas przedpłacony przy przeniesieniu usługi (oplaconeDo) i zmiany dat przez operatora
 *    też liczą się jako opłacony czas (widać je tylko w currentPeriodEnd);
 *  - wygasła albo anulowana usługa, która spełniła warunek, nadal odblokowuje (pliki marki po końcu hostingu).
 */
export const MIESIECY_DO_EKSPORTU = 3;

export const KOMUNIKAT_EKSPORTU =
  'Pobranie strony w pliku ZIP jest dostępne po 3 opłaconych miesiącach hostingu albo od razu przy planie rocznym.';

/** Okno odstąpienia od planu rocznego ze zwrotem – anulowanie w tym czasie nie odblokowuje eksportu. */
const DNI_ZWROTU_ROCZNEGO = 14;
const DOBA_MS = 24 * 60 * 60 * 1000;

export type UslugaDoEksportu = {
  status: SubscriptionStatus;
  interval: BillingInterval;
  isTrial: boolean;
  trialConvertedAt: Date | null;
  createdAt: Date;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  paymentSource: SubscriptionPaymentSource;
  currentPeriodStart: Date | null;
};

/** Statusy zaległej płatności: przy karcie Stripe okres jest już przesunięty, choć nieopłacony. */
const ZALEGLE: readonly SubscriptionStatus[] = [SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED];

export function odblokowujeEksport(s: UslugaDoEksportu): boolean {
  if (wProbie(s)) return false;
  const kartaZalegla = s.paymentSource === SubscriptionPaymentSource.STRIPE_CARD && ZALEGLE.includes(s.status);
  const oplaconeDo = kartaZalegla ? s.currentPeriodStart : s.currentPeriodEnd;
  if (!oplaconeDo) return false;
  const platnyOd = s.trialConvertedAt ?? s.createdAt;
  if (s.interval === BillingInterval.YEAR) {
    const koniec = Math.min(oplaconeDo.getTime(), s.canceledAt?.getTime() ?? Infinity);
    return koniec > platnyOd.getTime() + DNI_ZWROTU_ROCZNEGO * DOBA_MS;
  }
  const koniec = oplaconeDo.getTime();
  const prog = new Date(platnyOd.getTime());
  prog.setUTCMonth(prog.getUTCMonth() + MIESIECY_DO_EKSPORTU);
  return koniec >= prog.getTime() - DOBA_MS;
}

/** Klient ma choć jedną usługę hostingu (poza nieopłaconym zamówieniem), która odblokowuje eksport. */
export async function eksportOdblokowany(prisma: Pick<PrismaService, 'subscription'>, userId: string): Promise<boolean> {
  const uslugi = await prisma.subscription.findMany({
    where: { userId, plan: { productKind: ProductKind.HOSTING }, status: { notIn: [SubscriptionStatus.PENDING_PAYMENT] } },
    select: {
      status: true,
      interval: true,
      isTrial: true,
      trialConvertedAt: true,
      createdAt: true,
      currentPeriodEnd: true,
      canceledAt: true,
      paymentSource: true,
      currentPeriodStart: true,
    },
  });
  return uslugi.some(odblokowujeEksport);
}
