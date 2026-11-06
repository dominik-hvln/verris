import { SubscriptionStatus } from '@verris/database';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Promocja startowa należy się tylko przy PIERWSZYM zakupie klienta. Do 6.11.2026 był to rabat na start (−15% / −10%),
 * od decyzji Dominika z 6.11.2026 — kredyty na autoskalowanie (autoscaling/kredyty-autoskalowania.ts). Warunek
 * „pierwszego zakupu” się nie zmienił.
 *
 * E2e 14.10 (PB-05): klient, który kupił już hosting z rabatem −15%, przy drugim zamówieniu znów dostał −15% —
 * rabat liczył się każdemu pakietowi z portfela. Decyzja właściciela 14.10: to promocja dla nowego klienta.
 *
 * „Był zakup” = jakakolwiek usługa klienta, która ruszyła (ma początek okresu albo stan po opłaceniu), albo otwarte
 * zamówienie, które promocję już zajęło (dawny rabat albo obiecane kredyty). Nie liczą się: zamówienia bez promocji
 * porzucone przed zapłatą, anulowane bez okresu, cofnięte po nieudanym zakładaniu (okres wyzerowany) i
 * nieprzekształcony darmowy okres próbny — klient po trialu zamawia pierwszy raz i dostaje promocję.
 */
const PO_OPLACENIU: SubscriptionStatus[] = [
  SubscriptionStatus.PROVISIONING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.SUSPENDED,
  SubscriptionStatus.EXPIRED,
];

export async function czyPierwszyZakup(prisma: Pick<PrismaService, 'subscription'>, userId: string): Promise<boolean> {
  const wczesniejsza = await prisma.subscription.findFirst({
    where: {
      userId,
      OR: [
        { currentPeriodStart: { not: null } },
        { status: { in: PO_OPLACENIU } },
        // Przegląd 15.10: otwarte zamówienie Z PROMOCJĄ już ją zajmuje — inaczej klient zamawiał drugi pakiet przed
        // opłaceniem pierwszego (albo płacił „ponownie” stare zamówienie) i każdy dostawał promocję. Anulowanie
        // (klient, sprzątanie po 48 h) promocję zwalnia. Rabat (introDiscountPct) — zamówienia sprzed 6.11.2026.
        { status: SubscriptionStatus.PENDING_PAYMENT, introDiscountPct: { gt: 0 } },
        { status: SubscriptionStatus.PENDING_PAYMENT, kredytAutoskalowaniaKwota: { gt: 0 } },
      ],
      NOT: { isTrial: true, trialConvertedAt: null },
    },
    select: { id: true },
  });
  return !wczesniejsza;
}
