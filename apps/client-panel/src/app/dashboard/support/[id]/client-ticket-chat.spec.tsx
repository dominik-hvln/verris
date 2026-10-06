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
