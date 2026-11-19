import { BillingInterval, ProductKind, SubscriptionStatus } from '@verris/database';
import type { PrismaService } from '../prisma/prisma.service.js';
import { wProbie } from '../subscriptions/okres-probny.js';

/**
 * Paczka 134 – prawo do zabrania plików (decyzja właściciela 19.11.2026): pobranie strony w ZIP i plików marki
 * odblokowuje usługa hostingu, która ma 3 opłacone miesiące albo jest na planie rocznym.
 *
 *  - okres próbny się nie liczy; po konwersji liczymy od trialConvertedAt (inaczej od createdAt);
 *  - koniec opłaconego czasu = currentPeriodEnd, a przy anulowaniu wcześniejsza z dat (canceledAt);
 *  - plan roczny odblokowuje od razu, ale nie gdy usługę anulowano w ciągu 14 dni (zwrot);
 *  - plan miesięczny: opłacony czas sięga co najmniej 3 miesięcy kalendarzowych od początku płatności
 *    (z tolerancją 1 dnia);
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
};

export function odblokowujeEksport(s: UslugaDoEksportu): boolean {
  if (wProbie(s)) return false;
  if (!s.currentPeriodEnd) return false;
  const platnyOd = s.trialConvertedAt ?? s.createdAt;
  const koniec = Math.min(s.currentPeriodEnd.getTime(), s.canceledAt?.getTime() ?? Infinity);
  if (s.interval === BillingInterval.YEAR) return koniec > platnyOd.getTime() + DNI_ZWROTU_ROCZNEGO * DOBA_MS;
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
    },
  });
  return uslugi.some(odblokowujeEksport);
}
