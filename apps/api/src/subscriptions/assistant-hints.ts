/**
 * PB-17 — asystent v1: dymki na regułach, bez AI i bez kosztów. Czysta logika
 * (dane zbiera AssistantService), żeby każdą regułę dało się przetestować.
 */
import type { MailAuthSuggestion } from '../deliverability/mail-auth.js';

export type HintSeverity = 'crit' | 'warn' | 'info';

export type HintAction =
  | { kind: 'fix'; label: string; preview: MailAuthSuggestion }
  | { kind: 'tab'; label: string; tab: string }
  | { kind: 'href'; label: string; href: string };

export interface AssistantHint {
  key: 'provisioning' | 'ssl' | 'pointing' | 'disk' | 'backup' | 'domain-expiry' | 'spf' | 'dmarc' | 'dkim' | 'autoscaling' | 'plan';
  severity: HintSeverity;
  title: string;
  detail: string;
  action?: HintAction;
}

export interface HintInput {
  now: Date;
  domain: string | null;
  disk: { usedMb: number; limitMb: number } | null;
  tlsExpiresAt: Date | null;
  domainExpiry: { name: string; expiresAt: Date; autoRenew: boolean } | null;
  backup: { lastAt: Date | null; ok: boolean } | null;
  pointing: { status: 'ok' | 'partial' | 'fail' | 'pending'; message: string } | null;
  /** Kontrole SPF/DKIM/DMARC z DeliverabilityService. */
  mail: { key: string; status: 'ok' | 'warn' | 'fail'; detail: string; suggestion?: MailAuthSuggestion }[];
  usesPlatformDns: boolean | null;
  /**
   * Dawny blok „Asystent” przeglądu usługi (buildServiceRecommendations) — od 04.10 jeden asystent:
   * reguły, których nie pokrywają powyższe (zakładanie, autoskalowanie, plan). Brak = pomijamy.
   */
  usluga?: { id: string; provisioningFailed: boolean; autoscalingEnabled: boolean; usedScaling: boolean; active: boolean };
}

const DAY = 86_400_000;
const ORDER: AssistantHint['key'][] = ['provisioning', 'ssl', 'pointing', 'disk', 'backup', 'domain-expiry', 'spf', 'dmarc', 'dkim', 'autoscaling', 'plan'];
const days = (ms: number) => Math.ceil(ms / DAY);
const plDays = (n: number) => `${n} ${n === 1 ? 'dzień' : 'dni'}`;

export function buildHints(i: HintInput): AssistantHint[] {
  const out: AssistantHint[] = [];

  if (i.tlsExpiresAt) {
    const left = days(i.tlsExpiresAt.getTime() - i.now.getTime());
    if (left <= 14) {
      out.push({
        key: 'ssl',
        severity: left <= 3 ? 'crit' : 'warn',
        title: left <= 0 ? 'Certyfikat SSL wygasł' : `Certyfikat SSL wygasa za ${plDays(left)}`,
        detail: 'Bez ważnego certyfikatu przeglądarki ostrzegają odwiedzających przed Twoją stroną.',
        action: { kind: 'tab', label: 'Przejdź do certyfikatów', tab: 'ssl' },
      });
    }
  }

  if (i.pointing && (i.pointing.status === 'fail' || i.pointing.status === 'partial')) {
    out.push({
      key: 'pointing',
      severity: 'warn',
      title: 'Domena nie kieruje na Twój hosting',
      detail: `${i.pointing.message} Dopóki tego nie zmienisz, strona i poczta działają z innego miejsca.`,
      action: { kind: 'tab', label: 'Jak to ustawić', tab: 'domains' },
    });
  }

  if (i.disk && i.disk.limitMb > 0) {
    const pct = Math.round((i.disk.usedMb / i.disk.limitMb) * 100);
    if (pct >= 85) {
      out.push({
        key: 'disk',
        severity: pct >= 95 ? 'crit' : 'warn',
        title: `Dysk zajęty w ${pct}%`,
        detail:
          pct >= 95
            ? 'Po zapełnieniu dysku strona przestaje zapisywać dane, a poczta nie przyjmuje wiadomości.'
            : 'Zostało niewiele miejsca. Usuń zbędne pliki albo powiększ pakiet, zanim zabraknie.',
        action: { kind: 'tab', label: 'Sprawdź zużycie', tab: 'usage' },
      });
    }
  }

  if (i.backup) {
    const age = i.backup.lastAt ? i.now.getTime() - i.backup.lastAt.getTime() : Infinity;
    if (!i.backup.ok || age > 2 * DAY) {
      out.push({
        key: 'backup',
        severity: 'warn',
        title: !i.backup.lastAt
          ? 'Nie widzimy jeszcze kopii zapasowej poza serwerem'
          : !i.backup.ok
            ? 'Ostatnia kopia zapasowa poza serwerem się nie udała'
            : `Ostatnia kopia zapasowa poza serwerem ma ${plDays(Math.floor(age / DAY))}`,
        detail: 'Kopie robimy automatycznie — już się tym zajmujemy. Lokalne kopie konta znajdziesz w zakładce kopii zapasowych.',
        action: { kind: 'tab', label: 'Kopie zapasowe', tab: 'backups' },
      });
    }
  }

  if (i.domainExpiry && !i.domainExpiry.autoRenew) {
    const left = days(i.domainExpiry.expiresAt.getTime() - i.now.getTime());
    if (left <= 30) {
      out.push({
        key: 'domain-expiry',
        severity: left <= 7 ? 'crit' : 'warn',
        title: left <= 0 ? `Domena ${i.domainExpiry.name} wygasła` : `Domena ${i.domainExpiry.name} wygasa za ${plDays(left)}`,
        detail: 'Po wygaśnięciu przestaje działać strona i poczta, a domenę może zająć ktoś inny. Odnowienie nie jest włączone automatycznie.',
        action: { kind: 'href', label: 'Odnów domenę', href: '/dashboard/domains' },
      });
    }
  }

  for (const c of i.mail) {
    if (c.status === 'ok' || !['spf', 'dmarc', 'dkim'].includes(c.key)) continue;
    const key = c.key as 'spf' | 'dmarc' | 'dkim';
    const canFix = key !== 'dkim' && !!c.suggestion && !c.suggestion.inZone && i.usesPlatformDns !== false;
    out.push({
      key,
      severity: 'warn',
      title:
        key === 'spf'
          ? c.status === 'fail' ? 'Poczta z Twojej domeny może trafiać do spamu (SPF)' : 'Rekord SPF wymaga poprawki'
          : key === 'dmarc'
            ? 'Domena nie jest chroniona przed podszywaniem (DMARC)'
            : 'Poczta nie jest podpisywana (DKIM)',
      detail: c.detail,
      action: canFix
        ? { kind: 'fix', label: c.suggestion!.replaces ? 'Popraw rekord' : 'Dodaj rekord', preview: c.suggestion! }
        : { kind: 'tab', label: 'Szczegóły w zakładce Poczta', tab: 'mail' },
    });
  }

  const u = i.usluga;
  if (u?.provisioningFailed) {
    out.push({
      key: 'provisioning',
      severity: 'crit',
      title: 'Zakładanie usługi wymaga naszej interwencji',
      detail: 'Widzimy szczegóły błędu i już się tym zajmujemy. Nie zamawiaj ponownie tej samej domeny.',
      action: { kind: 'href', label: 'Napisz do nas', href: '/dashboard/support' },
    });
  }
  if (u && !u.autoscalingEnabled && u.usedScaling) {
    out.push({
      key: 'autoscaling',
      severity: 'warn',
      title: 'Włącz autoskalowanie',
      detail: 'Usługa korzystała już z podwyższonych limitów. Autoskalowanie ograniczy ryzyko błędów 508 przy skokach ruchu.',
      action: { kind: 'href', label: 'Ustaw autoskalowanie', href: `/dashboard/services/${u.id}/autoscaling` },
    });
  }
  // Bez podpowiedzi „Rozważ wyższy plan”: Verris ma jeden pakiet + autoskalowanie, więc nie ma wyższego
  // planu do polecenia (decyzja właściciela 09.10). Wcześniej podpowiedź wyskakiwała już po pierwszym
  // podbiciu limitu i twierdziła, że usługa „regularnie” korzysta z autoskalowania.

  const waga: Record<HintSeverity, number> = { crit: 0, warn: 100, info: 200 };
  const rank = (h: AssistantHint) => waga[h.severity] + ORDER.indexOf(h.key);
  return out.sort((a, b) => rank(a) - rank(b));
}
