import type { Prisma } from '@verris/database';

type Db = Pick<Prisma.TransactionClient, 'subscriptionEvent'>;

/**
 * K2 (przegląd 12.10) — zdarzenia usługi, które widzi jej OBECNY właściciel: od ostatniej zmiany właściciela
 * (zdarzenie OWNER_CHANGED z zmiana-wlasciciela.service.ts, włącznie). Wcześniejsze należą do poprzedniego właściciela —
 * m.in. MIGRATION_EXTERNAL_REQUESTED z hostem, loginem, ścieżką i notatkami jego starego hostingu. Obsługa widzi całość.
 * Każdy odczyt zdarzeń usługi dla klienta ma iść przez ten filtr.
 */
export async function zdarzeniaUslugiDlaKlienta(db: Db, subscriptionId: string): Promise<Prisma.SubscriptionEventWhereInput> {
  const zmiana = await db.subscriptionEvent.findFirst({
    where: { subscriptionId, type: 'OWNER_CHANGED' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return zmiana ? { subscriptionId, createdAt: { gte: zmiana.createdAt } } : { subscriptionId };
}
