import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));
jest.mock('../actions', () => ({ addTicketReply: jest.fn(), addTicketReplyWithFiles: jest.fn() }));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

import ClientTicketChat from './client-ticket-chat';

/**
 * 06.10 — automatyczne „Wciąż pracujemy” z kolejnych dni (raz na dobę) wyglądały jak 11 wiadomości z jednej
 * półgodziny, bo wpis pokazywał samą godzinę. Wpis automatyczny ma datę jak każda inna wiadomość.
 */
describe('ClientTicketChat — wiadomości automatyczne z datą', () => {
  it('„Wciąż pracujemy” z różnych dni ma dzień i godzinę', () => {
    const odp = (id: string, iso: string) => ({ id, message: 'Wciąż pracujemy nad zgłoszeniem.', isStaff: true, automatic: 'WCIAZ_PRACUJEMY', createdAt: iso, attachments: [] });
    const ticket = {
      id: 't1', subject: 'Testowy task', message: 'x', status: 'OPEN', priority: 'NORMAL', createdAt: '2026-05-24T10:33:00Z',
      replies: [odp('r1', '2026-09-27T09:30:00Z'), odp('r2', '2026-09-28T09:35:00Z')], attachments: [],
    };
    const html = renderToStaticMarkup(<ClientTicketChat ticket={ticket as never} />);
    // dzień zamiast samej godziny (godzina zależy od strefy runnera)
    expect(html).toMatch(/27 wrz, \d\d:30/);
    expect(html).toMatch(/28 wrz, \d\d:35/);
  });
});

/** F2.5 — zgłoszenie założone przez obsługę: pierwsza wiadomość od „Obsługa Verris”, nie podpisana „Ty”. */
describe('ClientTicketChat — zgłoszenie założone przez obsługę', () => {
  const baza = { id: 't2', subject: 'Awaria poczty', message: 'Wykryliśmy problem z pocztą na Twoim koncie.', status: 'WAITING_CUSTOMER', priority: 'NORMAL', createdAt: '2026-10-10T10:00:00Z', replies: [], attachments: [] };
  it('zalozylaObsluga → „Obsługa Verris”, bez „Ty”', () => {
    const html = renderToStaticMarkup(<ClientTicketChat ticket={{ ...baza, zalozylaObsluga: true } as never} />);
    expect(html).toContain('data-pierwsza="obsluga"');
    expect(html).toContain('Obsługa Verris');
    expect(html).not.toMatch(/>Ty - /);
  });
  it('zwykłe zgłoszenie dalej od „Ty”', () => {
    const html = renderToStaticMarkup(<ClientTicketChat ticket={baza as never} />);
    expect(html).toMatch(/Ty - /);
    expect(html).not.toContain('data-pierwsza="obsluga"');
  });
});
