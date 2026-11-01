import { SubscriptionStatus } from '@verris/database';
import { LIMIT_WYSYLKI_PROBY } from '@verris/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * 1.11 — ograniczenia okresu próbnego (decyzja Dominika: kod gotowy teraz, próbę włącza admin przez trialDays > 0
 * planu; www pokazuje „14 dni za darmo” na podstawie trialDays z GET /plans).
 *
 * W czasie próby (isTrial = true, trialConvertedAt = null):
 *  - dobowy limit wysyłki poczty konta = LIMIT_WYSYLKI_PROBY (limit-wysylki-proby.service.ts), przy konwersji
 *    przywracany domyślny serwera;
 *  - bez rejestracji i transferu domen, jeśli klient nie ma żadnej płatnej usługi (domain-registrar.service.ts);
 *  - bez dodatkowej mocy (autoskalowanie wyłączone, silnik pomija próby).
 */
/** Liczba w libs/contracts (mail-limits.ts) — ta sama pokazywana klientowi w panelu. */
export { LIMIT_WYSYLKI_PROBY };

export const KOMUNIKAT_DOMENY_W_PROBIE = 'W czasie okresu próbnego nie zarejestrujesz domeny. Opłać hosting, żeby ją kupić.';
export const KOMUNIKAT_AUTOSKALOWANIA_W_PROBIE =
  'W czasie okresu próbnego dodatkowa moc jest wyłączona. Opłać hosting, żeby włączyć autoskalowanie.';

/** Usługa w trwającym okresie próbnym. */
export function wProbie(s: { isTrial: boolean; trialConvertedAt?: Date | null }): boolean {
  return s.isTrial && !s.trialConvertedAt;
}

const DZIALAJACE = [SubscriptionStatus.ACTIVE, SubscriptionStatus.PROVISIONING, SubscriptionStatus.PAST_DUE];

/**
 * Klient ma trwającą próbę i żadnej płatnej, działającej usługi. Klient bez usług (kupuje samą domenę) i klient
 * z płatnym hostingiem obok próby — bez blokady.
 */
export async function maTylkoProbne(prisma: Pick<PrismaService, 'subscription'>, userId: string): Promise<boolean> {
  const [proby, platne] = await Promise.all([
    prisma.subscription.count({ where: { userId, isTrial: true, trialConvertedAt: null, status: { in: DZIALAJACE } } }),
    prisma.subscription.count({ where: { userId, isTrial: false, status: { in: DZIALAJACE } } }),
  ]);
  return proby > 0 && platne === 0;
}
