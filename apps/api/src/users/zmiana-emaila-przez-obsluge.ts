import { AdminCustomerActions } from '../common/audit/audit.actions.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** Audyt Fal 2 — po zmianie e-maila klienta przez obsługę reset hasła przez pracownika tylko wnioskiem przez tyle godzin. */
export const BLOKADA_RESETU_PO_ZMIANIE_EMAILA_H = 24;

/**
 * Audyt Fal 2 — kto z obsługi zmienił e-mail klienta w ostatnich 24 h (dziennik ADMIN_CUSTOMER_EMAIL_CHANGED).
 * Pusta lista = brak takiej zmiany. Jedno źródło dla resetu przez operatora (users.admin.service.ts), wniosku
 * (rejestr-wnioskow.ts) i formularza „Nie pamiętam hasła” (auth.service.ts requestPasswordReset) — inaczej pracownik
 * zmieniłby adres na swój i sam wysłał sobie link z formularza publicznego.
 */
export async function zmianyEmailaPrzezObsluge(
  prisma: Pick<PrismaService, 'auditLog'>,
  userId: string,
): Promise<(string | null)[]> {
  const od = new Date(Date.now() - BLOKADA_RESETU_PO_ZMIANIE_EMAILA_H * 3600 * 1000);
  const wpisy = await prisma.auditLog.findMany({
    where: { userId, action: AdminCustomerActions.CUSTOMER_EMAIL_CHANGED, createdAt: { gte: od } },
    select: { actorUserId: true },
  });
  return wpisy.map((w) => w.actorUserId);
}
