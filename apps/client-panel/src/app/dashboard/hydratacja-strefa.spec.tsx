import { renderToString } from 'react-dom/server';
import type { ServiceSummaryDto } from '@verris/contracts';
import { DashboardHome } from './dashboard-home';
import type { DashboardSnapshot } from './dashboard-data';
import ClientTicketChat from './support/[id]/client-ticket-chat';
import type { TicketDetail } from './support/actions';

jest.mock('@/lib/feature-flags-action', () => ({ pobierzFlagiAction: jest.fn(async () => ({})) }));
jest.mock('./support/actions', () => ({ addTicketReply: jest.fn(), addTicketReplyWithFiles: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));

/**
 * Nocna weryfikacja 12.10 — React #418 na produkcji („Hydration failed because the server rendered … didn't
 * match the client”). Komponent kliencki z danymi z serwera renderuje się w kontenerze Next (UTC) i potem
 * w przeglądarce (Europe/Warsaw). Testy biegną w UTC (jest.global-setup.cjs), czyli jak serwer: render musi
 * już tu pokazać czas polski — dokładnie ten tekst wyrenderuje przeglądarka, więc hydratacja się zgadza.
 * Na starym kodzie: „najbliższe odnowienie 7 lis” (serwer) kontra „8 lis” (przeglądarka), zgłoszenie
 * w złym dniu na wykresie, a godziny wiadomości w zgłoszeniu przesunięte o 2 h.
 */

/** 23:30 UTC = 00:30 następnego dnia w Polsce (CET) — termin usługi kupionej tuż po północy. */
const PO_PLNOCY_PL = '2026-11-07T23:30:00.000Z';

beforeAll(() => {
  // „Teraz” jak w zgłoszeniu z produkcji: 11.10 19:12 czasu polskiego.
  jest.useFakeTimers({ now: new Date('2026-10-11T17:12:00Z') });
});
afterAll(() => {
  jest.useRealTimers();
});

const usluga = {
  id: '11111111-2222-3333-4444-555555555555',
  status: 'ACTIVE',
  planSlug: 'hosting',
  planName: 'Hosting',
  interval: 'MONTH',
  priceAmount: '45.00',
  renewalAmount: '45.00',
  currency: 'PLN',
  currentPeriodEnd: PO_PLNOCY_PL,
  cancelAt: null,
  ecoModeEnabled: false,
  autoscalingEnabled: false,
  isTrial: false,
  trialEndsAt: null,
  productKind: 'HOSTING',
  account: null,
  provisioning: null,
  health: { score: 100, label: 'healthy', checkedAt: null, checks: { dnsOk: true, tlsOk: true, backupFresh: true, lveOk: true, panelTlsOk: true, mailOk: true } },
  recommendations: [],
} as unknown as ServiceSummaryDto;

const snapshot = {
  profile: null,
  services: [usluga],
  domains: [],
  ecoProgram: null,
  wallet: null,
  ecoLedger: [],
  // Zgłoszenie z 22:30 UTC 10.10 = 00:30 11.10 w Polsce.
  tickets: [{ id: 't1', subject: 'Test', status: 'OPEN', createdAt: '2026-10-10T22:30:00.000Z', updatedAt: '2026-10-10T22:30:00.000Z' }],
  openTickets: 1,
  errors: {},
  bezDostepu: {},
} as unknown as DashboardSnapshot;

describe('#418 — render serwera (UTC) pokazuje czas polski, jak przeglądarka', () => {
  it('warunek testu: proces w UTC', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
  });

  it('pulpit: termin i słupek zgłoszeń według dnia w Polsce', () => {
    const html = renderToString(<DashboardHome snapshot={snapshot} />);
    expect(html).toContain('najbliższe odnowienie 8 lis');
    // Zgłoszenie z 00:30 11.10 (czas polski) liczy się do niedzieli 11 paź, nie do soboty 10 paź (dzień UTC).
    expect(html).toContain('aria-label="1 nowe zgłoszenie, niedz., 11 paź"');
    expect(html).toContain('aria-label="0 nowych zgłoszeń, sob., 10 paź"');
  });

  it('zgłoszenie: godziny wiadomości w czasie polskim', () => {
    const zgloszenie = {
      id: 't1',
      subject: 'Test',
      status: 'OPEN',
      message: 'Dzień dobry',
      createdAt: '2026-10-11T17:12:00.000Z',
      updatedAt: '2026-10-11T17:12:00.000Z',
      replies: [{ id: 'r1', message: 'Odpowiedź', isStaff: true, authorId: null, autor: 'Anna K.', createdAt: '2026-10-11T22:30:00.000Z' }],
    } as TicketDetail;
    const html = renderToString(<ClientTicketChat ticket={zgloszenie} />);
    expect(html).toContain('11 paź, 19:12');
    expect(html).toContain('12 paź, 00:30');
  });
});
