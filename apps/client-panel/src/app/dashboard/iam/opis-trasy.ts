/**
 * P3-07 — dziennik IAM po ludzku. Wpis odmowy albo działania subkonta niesie metodę i szablon trasy API
 * (`DELETE /subscriptions/:id`); właściciel konta ma zobaczyć „rezygnacja z usługi”, nie trasę.
 * Najpierw trasy szczegółowe, potem obszar (usługi, płatności…) z rodzajem czynności.
 */
const SZCZEGOLOWE: Array<[RegExp, string]> = [
  [/^DELETE \/subscriptions\/:id$/, 'rezygnacja z usługi'],
  [/^DELETE \/vps\/:id$/, 'usunięcie VPS-a'],
  [/^PATCH \/subscriptions\/:id\/plan$/, 'zmiana planu usługi'],
  [/^PATCH \/subscriptions\/:id\/autoscaling$/, 'zmiana autoskalowania'],
  [/^POST \/subscriptions$/, 'zamówienie usługi'],
  [/^POST \/subscriptions\/:id\/pay-from-wallet$/, 'opłacenie usługi z portfela'],
  [/^POST \/billing\/checkout-session/, 'doładowanie portfela'],
  [/^POST \/billing\/promo/, 'realizacja kodu promocyjnego'],
  [/^(POST|DELETE) \/users\/me\/api-tokens/, 'zmiana tokenów API'],
  [/^(POST|PATCH|DELETE) \/users\/me\/webhooks/, 'zmiana webhooków'],
  [/^POST \/me\/account-deletion/, 'usunięcie konta'],
  [/^POST \/me\/data-export/, 'eksport danych konta'],
  [/\/users\/iam/, 'zarządzanie dostępem do konta'],
  [/\/domains\/:id\/registrar\/authcode/, 'kod transferu domeny'],
  [/\/domains\/:id\/registrar\/registrant/, 'dane abonenta domeny'],
  [/^POST \/me\/consent\/accept-current$/, 'akceptacja regulaminu i polityki prywatności'],
];

const OBSZARY: Array<[RegExp, string]> = [
  [/billing|invoices|wallet/, 'płatności'],
  [/hosting-dns/, 'DNS'],
  [/hosting-email|hosting-webmail|autoresponder|catchall|spamfilter|mail-log/, 'poczty'],
  [/files|file-manager|hosting-db|hosting-databases|hosting-ftp|hosting-ssh|hosting-git|hosting-restore|hosting-cron|deploy|staging/, 'plików i baz strony'],
  [/^\/vps/, 'VPS-a'],
  [/subscriptions|services|addons|autoscaling/, 'usług'],
  [/domains/, 'domen'],
  [/tickets/, 'zgłoszeń do pomocy'],
  [/partners|reseller|referral/, 'programu poleceń'],
  [/users\/me|settings/, 'ustawień konta'],
];

const CZYNNOSC: Record<string, string> = { GET: 'podgląd', POST: 'zmiana', PUT: 'zmiana', PATCH: 'zmiana', DELETE: 'usunięcie' };

export function opisTrasy(details: unknown): string | null {
  const d = details as { method?: unknown; route?: unknown } | null;
  if (!d || typeof d.route !== 'string') return null;
  const metoda = typeof d.method === 'string' ? d.method.toUpperCase() : 'POST';
  const trasa = d.route.replace(/^\/api\/v\d+/, '');
  const klucz = `${metoda} ${trasa}`;
  for (const [wzorzec, opis] of SZCZEGOLOWE) if (wzorzec.test(klucz)) return opis;
  const obszar = OBSZARY.find(([w]) => w.test(trasa))?.[1];
  const czynnosc = CZYNNOSC[metoda] ?? 'zmiana';
  return obszar ? `${czynnosc} w obszarze ${obszar}` : `${czynnosc} na koncie`;
}

/** Kogo dotyczy wpis zarządzania subkontem (API zapisuje nazwę i adres z chwili zdarzenia). */
export function ktoregoDotyczy(details: unknown): string | null {
  const d = details as { nazwa?: unknown; email?: unknown } | null;
  if (!d) return null;
  if (typeof d.nazwa === 'string' && d.nazwa) return typeof d.email === 'string' && d.email !== d.nazwa ? `${d.nazwa} (${d.email})` : d.nazwa;
  return typeof d.email === 'string' && d.email ? d.email : null;
}
