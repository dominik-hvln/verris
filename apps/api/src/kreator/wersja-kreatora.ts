import { ProductKind } from '@verris/database';
import type { WersjaKreatora } from '@verris/kreator';
import type { PrismaService } from '../prisma/prisma.service.js';
import { wProbie } from '../subscriptions/okres-probny.js';
import { HOSTING_DZIALA, PRO_DZIALA } from './kreator-pro.js';

/**
 * Wersja kreatora konta (decyzje właściciela 7.11 i 8.11.2026):
 *  - 'pro'     – działający płatny hosting i abonament Kreator Pro (subskrypcja KREATOR_PRO) aktywny albo
 *                w karencji po nieudanym odnowieniu (PAST_DUE). Zawieszony, wygasły albo anulowany abonament
 *                = powrót do 'hosting': strony zostają, a następna publikacja zastąpi elementy Pro
 *                (dopasujDoPlanu); już opublikowanych plików nie zmieniamy;
 *  - 'hosting' – działający płatny hosting (kreator w cenie);
 *  - 'proba'   – jedyne działające usługi hostingu są w okresie próbnym;
 *  - null      – brak działającego hostingu = brak dostępu.
 *
 * Do paczki 120 Pro rozpoznawaliśmy po dodatku `kreator_pro` (PurchasedAddon) – nikt go nie kupił (paczki
 * 119–120 nie były wdrożone), więc rozpoznanie usunięte bez okresu przejściowego.
 */
export async function wersjaKreatora(prisma: Pick<PrismaService, 'subscription'>, userId: string): Promise<WersjaKreatora | null> {
  // Jedno zapytanie: działające usługi hostingu i abonamenty Pro (statusy Pro ⊂ statusy hostingu).
  const uslugi = await prisma.subscription.findMany({
    where: {
      userId,
      status: { in: HOSTING_DZIALA },
      plan: { productKind: { in: [ProductKind.HOSTING, ProductKind.KREATOR_PRO] } },
    },
    select: { isTrial: true, trialConvertedAt: true, status: true, plan: { select: { productKind: true } } },
  });
  const hosting = uslugi.filter((u) => u.plan.productKind === ProductKind.HOSTING);
  if (!hosting.length) return null;
  const platny = hosting.some((u) => !wProbie(u));
  const pro = uslugi.some((u) => u.plan.productKind === ProductKind.KREATOR_PRO && PRO_DZIALA.includes(u.status));
  if (platny && pro) return 'pro';
  return platny ? 'hosting' : 'proba';
}
