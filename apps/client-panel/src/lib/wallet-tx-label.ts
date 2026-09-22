/**
 * Opis transakcji portfela po ludzku. Backend zapisuje description technicznie
 * („Auto-renewal starter (MONTH)", „Subscription <uuid> (initial payment)"),
 * a w panelu klient ma zobaczyć zdanie, nie identyfikator. Oryginał zostaje
 * w dymku, więc nic nie ginie.
 */
const PLAN_NAMES: Record<string, string> = { starter: 'Starter', 'poczta-standard': 'Poczta Standard' };

function planLabel(slug: string): string {
  return PLAN_NAMES[slug.toLowerCase()] ?? slug.replace(/-/g, ' ');
}

export function walletTxDescription(description: string | null | undefined, paymentProvider?: string | null): string | null {
  const d = (description ?? '').trim();
  if (!d) return paymentProvider ? `Płatność: ${paymentProvider}` : null;

  const renew = d.match(/^auto-renewal\s+(\S+)\s*\((month|year)\)/i);
  if (renew) return `Odnowienie ${renew[2]!.toLowerCase() === 'month' ? 'miesięczne' : 'roczne'} · ${planLabel(renew[1]!)}`;

  if (/^subscription\s+[0-9a-f-]{16,}\s*\(initial payment\)/i.test(d)) return 'Pierwsza opłata za usługę';
  if (/^subscription\s+[0-9a-f-]{16,}/i.test(d)) return 'Opłata za usługę';
  if (/^auto-refund: provisioning failed/i.test(d)) return 'Zwrot — usługi nie udało się uruchomić';
  if (/^refund/i.test(d)) return 'Zwrot środków';

  const topup = d.match(/^doładowanie\s+(\w+)/i);
  if (topup) return `Doładowanie — ${topup[1]}`;

  // Opis bez identyfikatorów zostaje, jak jest (np. „Dodatek: Priorytetowe wsparcie (30 dni)").
  return d.replace(/\s*[(\[]?\b[0-9a-f]{8}-[0-9a-f-]{8,}\b[)\]]?/gi, '').replace(/\s{2,}/g, ' ').trim() || 'Operacja na portfelu';
}
