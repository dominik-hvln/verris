/**
 * P-12 — dane przykładowe dla testu dostępności widoków usługi (`widoki-usługi.spec.tsx`).
 *
 * Klucz = nazwa eksportu akcji serwera, wartość = odpowiedź, jaką dostaje komponent. Każda grupa
 * jest sprawdzana typem prawdziwego modułu (`satisfies Partial<typeof import(...)>`), więc zmiana
 * kształtu odpowiedzi w akcji = błąd kompilacji testu, a nie cicho nieaktualna atrapa.
 * Akcji spoza tej listy test nie rozwiązuje (komponent zostaje w stanie „wczytywanie”) — to też
 * jest widok, który klient ogląda, więc też przechodzi przez axe.
 */
import type { ServiceHealthSummaryDto } from '@verris/contracts';

const ok = <T>(dane: T) => ({ ok: true as const, dane });

const zdrowie: ServiceHealthSummaryDto = {
  score: 92,
  label: 'healthy',
  checkedAt: '2026-09-30T08:00:00.000Z',
  summary: 'Strona działa, certyfikat ważny.',
  checks: { dnsOk: true, tlsOk: true, backupFresh: true, lveOk: true, panelTlsOk: true, mailOk: true },
};

const usluga = {
  fetchServiceKindAction: async () => ({ productKind: 'HOSTING' as const, serviceTag: 'kowalski1' }),
  fetchServiceDetailsAction: async () =>
    ok({
      id: 's1',
      status: 'ACTIVE' as const,
      serviceTag: 'kowalski1',
      paymentSource: 'WALLET' as const,
      interval: 'MONTH' as const,
      priceAmount: '29.00',
      currency: 'PLN',
      currentPeriodStart: '2026-09-01T00:00:00.000Z',
      currentPeriodEnd: '2026-10-01T00:00:00.000Z',
      ecoModeEnabled: false,
      autoscalingEnabled: false,
      autoscalingMaxCost: '0',
      isTrial: false,
      trialEndsAt: null,
      productKind: 'HOSTING' as const,
      account: {
        id: 'a1',
        domain: 'kowalski.pl',
        daUsername: 'kowalski1',
        status: 'ACTIVE' as const,
        cpuLimit: 100,
        ramLimitMb: 2048,
        diskLimitMb: 20480,
        scaledCpu: 100,
        scaledRamMb: 2048,
        scaledDiskMb: 20480,
        server: { id: 'n1', name: 't1', region: 'PL' },
      },
      provisioning: null,
      health: zdrowie,
      recommendations: [],
      plan: { id: 'p1', slug: 'start', name: 'Start', description: null, cpuLimit: 100, ramLimitMb: 2048, diskLimitMb: 20480 },
      events: [],
    }),
} satisfies Partial<typeof import('@/app/dashboard/services/[id]/hosting-service-actions')>;

const zdrowieAkcje = {
  fetchServiceHealthAction: async () => zdrowie,
} satisfies Partial<typeof import('@/app/dashboard/services/[id]/hosting-health-actions')>;

const zuzycie = {
  fetchHostingUsageAction: async () =>
    ok({
      window: '24h',
      rows: [0, 1, 2].map((h) => ({
        bucketStart: `2026-09-30T0${h}:00:00.000Z`,
        cpuUsageAvg: 12 + h,
        cpuUsageMax: 30,
        memUsageAvgMb: 300,
        memUsageMaxMb: 420,
        diskUsageMb: 1800,
        ioUsageKbps: 120,
      })),
    }),
} satisfies Partial<typeof import('@/app/dashboard/services/[id]/hosting-usage-actions')>;

const linki = {
  fetchHostingDaLinksAction: async () =>
    ok({
      panelBaseUrl: '/sso',
      panelDisplayHost: 'panel.verris.pl',
      databasesUrl: '/sso?to=db',
      emailUrl: '/sso?to=mail',
      sslUrl: '/sso?to=ssl',
      fileManagerUrl: '/sso?to=files',
      domainsUrl: '/sso?to=domains',
      dnsUrl: '/sso?to=dns',
      domainManageUrl: '/sso?to=domain',
      stagingHint: '',
      daUsername: 'kowalski1',
      daPassword: null,
      fetchError: null,
    }),
  fetchHostingDatabasesAction: async () =>
    ok({
      databases: [{ name: 'kowalski1_wp' }, { name: 'kowalski1_sklep' }],
      daUsername: 'kowalski1',
      engine: { name: 'MariaDB', version: '10.11' },
      fetchError: null,
    }),
} satisfies Partial<typeof import('@/app/dashboard/services/[id]/hosting-mysql-links-actions')>;

const domeny = {
  fetchHostingDomainsAction: async () =>
    ok({ domains: [{ name: 'kowalski.pl' }, { name: 'sklep-kowalski.pl' }], daUsername: 'kowalski1', primaryDomain: 'kowalski.pl', fetchError: null }),
  fetchHostingDnsAction: async () =>
    ok({
      domain: 'kowalski.pl',
      records: [
        { id: 'r1', name: '@', type: 'A', value: '203.0.113.10', ttl: 3600 },
        { id: 'r2', name: 'www', type: 'CNAME', value: 'kowalski.pl.', ttl: 3600 },
        { id: 'r3', name: '@', type: 'MX', value: '10 mail.kowalski.pl.', ttl: 3600 },
      ],
      fetchError: null,
    }),
} satisfies Partial<typeof import('@/app/dashboard/services/[id]/hosting-domains-action')>;

const poczta = {
  fetchHostingEmailAction: async () =>
    ok({
      rows: [
        { id: 'biuro@kowalski.pl', email: 'biuro@kowalski.pl', quotaMb: 1024 },
        { id: 'jan@kowalski.pl', email: 'jan@kowalski.pl', quotaMb: null },
      ],
      fetchError: null,
    }),
  fetchHostingForwardersAction: async () =>
    ok({ rows: [{ id: 'f1', name: 'sklep', email: 'sklep@kowalski.pl', destinations: ['jan@kowalski.pl'] }], fetchError: null }),
  fetchHostingAutorespondersAction: async () =>
    ok({ rows: [{ id: 'r1', name: 'urlop', email: 'urlop@kowalski.pl', cc: '' }], fetchError: null }),
  fetchCatchAllAction: async () => ({ value: ':fail:', mode: 'fail' as const, address: '', fetchError: null }),
  fetchSpamFilterAction: async () => ok({ isOn: true, requiredScore: '5.0', subjectTag: '*****SPAM*****', fetchError: null }),
} satisfies Partial<typeof import('@/app/dashboard/services/[id]/hosting-email-actions')>;

const domenyDodatkowe = {
  fetchAdditionalDomainsAction: async () =>
    ok({ rows: [{ domain: 'kowalski.pl', isPrimary: true }, { domain: 'sklep-kowalski.pl', isPrimary: false }], primary: 'kowalski.pl', fetchError: null }),
  fetchDomainPointersAction: async () => ok({ rows: [{ alias: 'kowalski.com.pl', type: 'alias' }], primary: 'kowalski.pl', fetchError: null }),
} satisfies Partial<typeof import('@/app/dashboard/services/[id]/hosting-additional-domains-actions')>;

const subdomeny = {
  fetchHostingSubdomainsAction: async () =>
    ok({
      rows: [{ id: 'blog.kowalski.pl', subdomain: 'blog', domain: 'kowalski.pl', url: 'https://blog.kowalski.pl' }],
      domains: ['kowalski.pl', 'sklep-kowalski.pl'],
      fetchError: null,
    }),
} satisfies Partial<typeof import('@/app/dashboard/services/[id]/hosting-extra-actions')>;

const wskazanie = {
  fetchDomainPointingAction: async () => ({
    domain: 'kowalski.pl',
    expectedIpv4: '203.0.113.10',
    serverName: null,
    expectedNameservers: ['ns1.verris.pl', 'ns2.verris.pl'],
    observedA: ['203.0.113.10'],
    observedAaaa: [],
    observedWwwA: ['203.0.113.10'],
    nameservers: ['ns1.verris.pl', 'ns2.verris.pl'],
    delegatedToExpectedNs: true,
    pointsToServer: true,
    wwwPointsToServer: true,
    status: 'ok' as const,
    message: 'Domena wskazuje na serwer.',
    issues: [],
    checkedAt: '2026-09-30T08:00:00.000Z',
  }),
} satisfies Partial<typeof import('@/app/dashboard/services/[id]/hosting-dns-pointing-actions')>;

const pliki = {
  fmList: async (_id: string, path: string) =>
    ok({
      path,
      entries: [
        { name: 'public_html', type: 'dir' as const, sizeBytes: 0, modified: '1790000000' },
        { name: 'index.php', type: 'file' as const, sizeBytes: 418, modified: '1790000000' },
        { name: 'kopia.zip', type: 'file' as const, sizeBytes: 5_242_880, modified: '1790000000' },
      ],
    }),
} satisfies Partial<typeof import('@/app/dashboard/file-manager/data')>;

const polaczenie = {
  fetchConnectionInfoAction: async () =>
    ok({
      ipv4: '203.0.113.10',
      ftpHost: 'ftp.kowalski.pl',
      mailHost: 'mail.kowalski.pl',
      sshEnabled: true,
      sshHost: 'kowalski.pl',
      sshPort: 22,
      nameservers: ['ns1.verris.pl', 'ns2.verris.pl'],
      diskMb: { used: 1800, limit: 20480 },
      bandwidthMb: { used: 5000, limit: null },
      emails: { used: 2, limit: 50 },
      ftpAccounts: { used: 1, limit: 10 },
      databases: { used: 2, limit: 10 },
      inodes: { used: 20000, limit: 500000 },
      fetchError: null,
    }),
} satisfies Partial<typeof import('@/app/dashboard/services/[id]/hosting-connection-actions')>;

const dysk = {
  fetchDiskUsage: async () =>
    ({
      ok: true as const,
      status: {
        wToku: false,
        policzono: '2026-09-30T07:00:00.000Z',
        razem: { kb: 1_843_200, pliki: 20000 },
        wpisy: [{ sciezka: 'domains/kowalski.pl', kb: 1_500_000, pliki: 18000 }],
        skrzynki: [{ email: 'biuro@kowalski.pl', kb: 300_000 }],
        blad: null,
      },
    }),
} satisfies Partial<typeof import('@/app/dashboard/services/[id]/hosting-disk-usage-actions')>;

const panel = {
  fetchSidebarUser: async () => ({
    firstName: 'Jan',
    lastName: 'Kowalski',
    email: 'jan@kowalski.pl',
    walletBalance: '120.00',
    panelViewMode: null,
    panelTheme: null,
    onboardingHidden: true,
  }),
} satisfies Partial<typeof import('@/app/dashboard/sidebar-actions')>;

export const DANE: Record<string, (...a: never[]) => Promise<unknown>> = {
  ...usluga,
  ...zdrowieAkcje,
  ...zuzycie,
  ...linki,
  ...domeny,
  ...domenyDodatkowe,
  ...subdomeny,
  ...wskazanie,
  ...pliki,
  ...poczta,
  ...polaczenie,
  ...dysk,
  ...panel,
};
