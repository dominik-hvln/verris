import type { ServiceSummaryDto } from '@verris/contracts';
import { deriveReasons } from './services-health-overview';

/**
 * X-05 — powody, dla których usługa wymaga uwagi klienta (pulpit „Zdrowie usług").
 *
 * CO PILNUJE.
 *  - Każdy nieudany check, który klient może sam naprawić, daje czytelny powód.
 *    Brak powodu = usługa policzona jako sprawna, więc zgubiony check to
 *    problem schowany przed klientem.
 *  - `null` znaczy „nie sprawdzono" i nie jest błędem (nie alarmujemy o czymś,
 *    czego nie wiemy).
 *  - Poczta nie ma strony WWW: brak certyfikatu strony nie jest jej problemem,
 *    a DNS opisujemy jako rekordy poczty.
 *  - Rekomendacje `info` nie są powodem do alarmu; ostrzeżenia tak, bez duplikatów.
 */

const checks = (c: Partial<ServiceSummaryDto['health']['checks']> = {}) => ({
  dnsOk: null,
  tlsOk: null,
  backupFresh: null,
  lveOk: null,
  panelTlsOk: null,
  mailOk: null,
  ...c,
});

const svc = (extra: Partial<ServiceSummaryDto> = {}): ServiceSummaryDto =>
  ({
    id: 's1',
    status: 'ACTIVE',
    productKind: 'HOSTING',
    account: { status: 'ACTIVE' },
    provisioning: null,
    health: { score: 90, label: 'healthy', checkedAt: null, checks: checks() },
    recommendations: [],
    ...extra,
  }) as unknown as ServiceSummaryDto;

const withChecks = (c: Parameters<typeof checks>[0], productKind: ServiceSummaryDto['productKind'] = 'HOSTING') =>
  svc({ productKind, health: { score: 50, label: 'attention', checkedAt: null, checks: checks(c) } });

describe('X-05 deriveReasons', () => {
  it('wszystko OK albo nieznane (null) → brak powodów', () => {
    expect(deriveReasons(svc())).toEqual([]);
    expect(deriveReasons(withChecks({ dnsOk: true, tlsOk: true, mailOk: true, lveOk: true, backupFresh: true }))).toEqual([]);
  });

  it('hosting: każdy nieudany check klienta daje powód', () => {
    expect(
      deriveReasons(withChecks({ dnsOk: false, tlsOk: false, mailOk: false, lveOk: false, backupFresh: false })),
    ).toEqual(['DNS domeny', 'Certyfikat SSL', 'Serwer poczty', 'Wysokie obciążenie', 'Brak świeżej kopii']);
  });

  it('poczta: DNS jako rekordy poczty, certyfikat strony pominięty', () => {
    expect(deriveReasons(withChecks({ dnsOk: false, tlsOk: false }, 'EMAIL'))).toEqual(['DNS poczty (MX/SPF/DKIM)']);
  });

  it('konto nieaktywne i nieudany provisioning idą na początek', () => {
    const s = svc({
      account: { status: 'SUSPENDED' } as ServiceSummaryDto['account'],
      provisioning: { stage: 'failed' } as ServiceSummaryDto['provisioning'],
      health: { score: 10, label: 'critical', checkedAt: null, checks: checks({ dnsOk: false }) },
    });
    expect(deriveReasons(s)).toEqual(['Konto nieaktywne', 'Provisioning wymaga uwagi', 'DNS domeny']);
  });

  it('brak konta (usługa w trakcie) nie jest „kontem nieaktywnym", brak health nie wysypuje', () => {
    expect(deriveReasons(svc({ account: null, health: undefined as unknown as ServiceSummaryDto['health'] }))).toEqual([]);
  });

  it('rekomendacje: info pomijane, ostrzeżenia dodane raz', () => {
    const rec = (severity: 'info' | 'warning' | 'critical', title: string) => ({ type: 'plan' as const, severity, title, body: '' });
    const s = svc({
      recommendations: [rec('info', 'Rozważ plan roczny'), rec('warning', 'Włącz autoskalowanie'), rec('critical', 'Włącz autoskalowanie')],
    });
    expect(deriveReasons(s)).toEqual(['Włącz autoskalowanie']);
  });
});
