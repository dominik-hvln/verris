import { SubscriptionStatus } from '@verris/database';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Rabat na start (BILL-1, ustawienia oferty) należy się tylko przy PIERWSZYM zakupie klienta.
 *
 * E2e 14.10 (PB-05): klient, który kupił już hosting z rabatem −15%, przy drugim zamówieniu znów dostał −15% —
 * rabat liczył się każdemu pakietowi z portfela. Decyzja właściciela 14.10: to promocja dla nowego klienta.
 *
 * „Był zakup” = jakakolwiek usługa klienta, która ruszyła (ma początek okresu albo stan po opłaceniu), albo otwarte
 * zamówienie, które rabat już dostało. Nie liczą się: zamówienia bez rabatu porzucone przed zapłatą, anulowane bez
 * okresu, cofnięte po nieudanym zakładaniu (okres wyzerowany) i nieprzekształcony darmowy okres próbny — klient po
 * trialu zamawia pierwszy raz i dostaje rabat na start.
 */
const PO_OPLACENIU: SubscriptionStatus[] = [
  SubscriptionStatus.PROVISIONING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.SUSPENDED,
  SubscriptionStatus.EXPIRED,
];

export async function przyslugujeRabatStartowy(prisma: Pick<PrismaService, 'subscription'>, userId: string): Promise<boolean> {
  const wczesniejsza = await prisma.subscription.findFirst({
    where: {
      userId,
      OR: [
        { currentPeriodStart: { not: null } },
        { status: { in: PO_OPLACENIU } },
        // Przegląd 15.10: otwarte zamówienie Z RABATEM już go zajmuje — inaczej klient zamawiał drugi pakiet przed
        // opłaceniem pierwszego (albo płacił „ponownie” stare zamówienie) i każdy dostawał −20%. Anulowanie (klient,
        // sprzątanie po 48 h) rabat zwalnia.
        { status: SubscriptionStatus.PENDING_PAYMENT, introDiscountPct: { gt: 0 } },
      ],
      NOT: { isTrial: true, trialConvertedAt: null },
    },
    select: { id: true },
  });
  return !wczesniejsza;
}
