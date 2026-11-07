import { ProductKind, SubscriptionStatus } from '@verris/database';
import type { WersjaKreatora } from '@verris/kreator';
import type { PrismaService } from '../prisma/prisma.service.js';
import { wProbie } from '../subscriptions/okres-probny.js';

/**
 * Kod dodatku Kreator Pro w PurchasedAddon.slug. Dodatek NIE jest jeszcze w katalogu sklepu (addon.service.ts):
 * sklep sprzedaje dodatki jednorazowe z portfela, a Pro to abonament (9,90 zł/mies. albo 99 zł/rok) – sposób
 * rozliczenia (odnowienia, faktura, koniec okresu) czeka na decyzję właściciela. Do tego czasu Pro rozpoznajemy
 * po aktywnym (APPLIED) zakupie z tym kodem.
 */
export const KOD_DODATKU_KREATOR_PRO = 'kreator_pro';

/** Statusy usługi, w których hosting działa (jak okres-probny.ts). */
const DZIALAJACE = [SubscriptionStatus.ACTIVE, SubscriptionStatus.PROVISIONING, SubscriptionStatus.PAST_DUE];

/**
 * Wersja kreatora konta (decyzja właściciela 7.11.2026):
 *  - 'pro'     – działający hosting (płatny albo w próbie) i aktywny dodatek Kreator Pro;
 *  - 'hosting' – działający płatny hosting (kreator w cenie);
 *  - 'proba'   – jedyne działające usługi hostingu są w okresie próbnym;
 *  - null      – brak działającego hostingu = brak dostępu.
 */
export async function wersjaKreatora(
  prisma: Pick<PrismaService, 'subscription' | 'purchasedAddon'>,
  userId: string,
): Promise<WersjaKreatora | null> {
  const uslugi = await prisma.subscription.findMany({
    where: { userId, status: { in: DZIALAJACE }, plan: { productKind: ProductKind.HOSTING } },
    select: { isTrial: true, trialConvertedAt: true },
  });
  if (!uslugi.length) return null;
  const pro = await prisma.purchasedAddon.findFirst({
    where: { userId, slug: KOD_DODATKU_KREATOR_PRO, status: 'APPLIED' },
    select: { id: true },
  });
  if (pro) return 'pro';
  return uslugi.some((u) => !wProbie(u)) ? 'hosting' : 'proba';
}
