/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type {
  HostingBackupsResponseDto,
  HostingDomainsResponseDto,
  ServiceConnectionInfoDto,
  ServiceDetailsDto,
} from '@verris/contracts';

/**
 * Weryfikacja 11.10 — karta zawieszonej usługi. Serwer nie oddaje danych zawieszonego konta (domeny, kopie,
 * liczniki), a karta pokazywała to jak awarię („Nie udało się pobrać listy domen”) albo jak utratę danych („0 kopii”).
 */
const mockSvc = jest.fn();
const mockDomeny = jest.fn();
const mockKopie = jest.fn();
const mockConn = jest.fn();
jest.mock('@/app/dashboard/services/[id]/hosting-service-actions', () => ({
  fetchServiceDetailsAction: async () => ({ ok: true, dane: mockSvc() }),
}));
jest.mock('@/app/dashboard/services/[id]/hosting-domains-action', () => ({
  fetchHostingDomainsAction: async () => ({ ok: true, dane: mockDomeny() }),
}));
jest.mock('@/app/dashboard/services/[id]/hosting-backup-actions', () => ({
  fetchHostingBackupsAction: async () => ({ ok: true, dane: mockKopie() }),
}));
jest.mock('@/app/dashboard/services/[id]/hosting-connection-actions', () => ({
  fetchConnectionInfoAction: async () => ({ ok: true, dane: mockConn() }),
}));
jest.mock('@/app/dashboard/services/[id]/hosting-usage-actions', () => ({
  fetchHostingUsageAction: async () => ({ ok: true, dane: { window: '24h', rows: [] } }),
}));
jest.mock('@/app/dashboard/services/[id]/hosting-health-actions', () => ({
  fetchServiceHealthAction: async () => null,
}));
jest.mock('@/app/dashboard/services/[id]/overview-extras-actions', () => ({
  fetchOverviewExtrasAction: async () => null,
  toggleAutoscalingAction: async () => ({ ok: true }),
}));
jest.mock('@/app/dashboard/sidebar-actions', () => ({ fetchSidebarUser: async () => null }));
jest.mock('@/app/dashboard/services/[id]/autoscaling/eco-mode-card', () => ({ EcoModeCard: () => null }));
jest.mock('@/components/hosting/FirstStepsAssistant', () => ({ FirstStepsAssistant: () => null }));
jest.mock('@/components/hosting/HealthCheckDetails', () => ({ HealthCheckDetails: () => null }));
jest.mock('@/components/hosting/kafel-wydajnosci', () => ({ KafelWydajnosci: () => null }));
jest.mock('@/components/hosting/DomainPointingPanel', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/feature-flags', () => ({ useModul: () => false }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

import ServiceOverviewV2 from './ServiceOverviewV2';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const BLAD_SERWERA = 'Serwer hostingowy jest chwilowo niedostępny. Spróbuj ponownie za chwilę.';
const pustaMetryka = { used: null, limit: null };

function usluga(status: string, events: ServiceDetailsDto['events'] = []): ServiceDetailsDto {
  return {
    id: 's1',
    status,
    interval: 'MONTH',
    priceAmount: '45.00',
    renewalAmount: null,
    currency: 'PLN',
    paymentSource: 'WALLET',
    isTrial: false,
    trialEndsAt: null,
    currentPeriodEnd: '2026-11-08T00:00:00Z',
    autoscalingEnabled: false,
    ecoModeEnabled: false,
    productKind: 'HOSTING',
    health: null,
    plan: { id: 'p1', slug: 'start', name: 'Hosting Start', description: null, cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 10240 },
    account: { domain: 'kowalski.pl', daUsername: 'kowalski', diskLimitMb: 10240, cpuLimit: 100, ramLimitMb: 1024, server: null },
    events,
  } as unknown as ServiceDetailsDto;
}

const zawieszonaPrzezObsluge = () =>
  usluga('SUSPENDED', [
    { id: 'e1', type: 'SUSPENDED', createdAt: '2026-10-11T08:00:00Z', details: { reason: 'MANUAL_ADMIN' } },
  ] as unknown as ServiceDetailsDto['events']);

// Tak odpowiada API, gdy serwer odrzuca odczyt konta (zawieszone konto albo awaria węzła).
const domenyZBledem: HostingDomainsResponseDto = { domains: [], daUsername: 'kowalski', primaryDomain: 'kowalski.pl', fetchError: BLAD_SERWERA };
const kopieZBledem: HostingBackupsResponseDto = { rows: [], fetchError: BLAD_SERWERA, offsite: null } as unknown as HostingBackupsResponseDto;
const connZBledem = {
  ipv4: null,
  ftpHost: null,
  mailHost: null,
  sshEnabled: null,
  sshHost: null,
  sshPort: null,
  nameservers: [],
  diskMb: pustaMetryka,
  bandwidthMb: pustaMetryka,
  emails: pustaMetryka,
  ftpAccounts: pustaMetryka,
  databases: pustaMetryka,
  inodes: pustaMetryka,
  limitWysylki: 300,
  wysylkaWstrzymana: false,
  fetchError: BLAD_SERWERA,
} as unknown as ServiceConnectionInfoDto;

let root: Root;
let el: HTMLElement;
async function zamontuj() {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root.render(<ServiceOverviewV2 serviceId="s1" onNavigate={() => undefined} />));
  // Domeny, kopie i dane dostępowe dociągają się po danych usługi.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Wartość kafla „Kopie zapasowe” (liczba i jednostka, np. „2kopie”). */
function kafelKopii(): string {
  const etykieta = [...el.querySelectorAll('*')].find((n) => n.children.length === 0 && n.textContent === 'Kopie zapasowe');
  return etykieta?.nextElementSibling?.textContent ?? '';
}

beforeEach(() => {
  mockDomeny.mockReturnValue(domenyZBledem);
  mockKopie.mockReturnValue(kopieZBledem);
  mockConn.mockReturnValue(connZBledem);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('ServiceOverviewV2 — zawieszona usługa', () => {
  it('domeny, kopie i zasoby: stan „wstrzymana” zamiast błędu i „0 kopii”', async () => {
    mockSvc.mockReturnValue(zawieszonaPrzezObsluge());
    await zamontuj();
    const t = el.textContent ?? '';

    expect(t).toContain('Usługa wstrzymana przez obsługę Verris.');
    expect(t).not.toContain('Nie udało się pobrać listy domen');
    expect(t).toContain('Lista domen będzie dostępna po wznowieniu usługi');
    // Domena główna jest w bazie — klient widzi, że domena nie zniknęła.
    expect(t).toContain('Domena główna: kowalski.pl');

    expect(kafelKopii()).toBe('—');
    expect(t).toContain('Dane będą dostępne po wznowieniu usługi — kopie są bezpieczne.');
    // Kwadraty dni nie mówią „Brak kopii”, kiedy listy po prostu nie da się odczytać.
    expect(el.querySelector('[aria-label^="Brak kopii"]')).toBeNull();

    expect(t).toContain('Liczniki konta będą dostępne po wznowieniu usługi');
    expect(t).not.toContain('Część danych chwilowo niedostępna');
    expect(t).not.toMatch(/DirectAdmin|\bDA\b|2222/);
  });

  it('aktywna usługa z błędem serwera: dalej komunikat o błędzie, ale bez „0 kopii”', async () => {
    mockSvc.mockReturnValue(usluga('ACTIVE'));
    await zamontuj();
    const t = el.textContent ?? '';
    expect(t).toContain('Nie udało się pobrać listy domen — spróbuj odświeżyć.');
    expect(t).toContain('Część danych chwilowo niedostępna.');
    expect(t).not.toContain('po wznowieniu usługi');
    expect(kafelKopii()).toBe('—');
  });

  it('zawieszona, ale serwer oddał dane — pokazujemy dane (2 kopie, odmiana liczebnika)', async () => {
    mockSvc.mockReturnValue(zawieszonaPrzezObsluge());
    mockDomeny.mockReturnValue({ ...domenyZBledem, domains: [{ name: 'kowalski.pl' }], fetchError: null });
    mockKopie.mockReturnValue({ rows: [{ fileName: 'a.tar.zst' }, { fileName: 'b.tar.zst' }], fetchError: null, offsite: null });
    await zamontuj();
    const t = el.textContent ?? '';
    expect(kafelKopii()).toBe('2kopie');
    expect(t).not.toContain('Lista domen będzie dostępna po wznowieniu usługi');
    expect(t).not.toContain('kopie są bezpieczne');
  });
});
