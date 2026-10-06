import { renderToStaticMarkup } from 'react-dom/server';
import { stanZgloszenia } from './stan';

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));
jest.mock('./actions', () => ({ addTicketReply: jest.fn(), addTicketReplyWithFiles: jest.fn(), fetchTickets: jest.fn() }));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

import ClientTicketChat from './[id]/client-ticket-chat';

/**
 * Słownik stanów zgłoszenia w panelu klienta jest jeden i taki sam jak w mailach z API
 * (`STAN_ZGLOSZENIA_KLIENT` w ticket-notifications.ts): lista i szczegóły pokazywały różne słowa
 * („w toku” / „Rozpatrujemy”, „rozwiązane” / „Zamknięte”), a mail jeszcze inne („W realizacji”).
 */
describe('stan zgłoszenia dla klienta', () => {
  it('ten sam słownik co w mailach API', () => {
    expect(Object.fromEntries(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'CLOSED'].map((s) => [s, stanZgloszenia(s).label]))).toEqual({
      OPEN: 'Przyjęte',
      IN_PROGRESS: 'W toku',
      WAITING_CUSTOMER: 'Czekamy na Ciebie',
      CLOSED: 'Rozwiązane',
    });
    expect(stanZgloszenia('WAITING_CUSTOMER').tone).toBe('warn');
    expect(stanZgloszenia('CLOSED').tone).toBe('muted');
  });

  it('czat: „opiekun” zamiast „administracji”, placeholder zamkniętego zgłoszenia po polsku', () => {
    const ticket = { id: 't1', subject: 'x', message: 'x', status: 'OPEN', priority: 'NORMAL', createdAt: '2026-05-24T10:33:00Z', replies: [], attachments: [] };
    const otwarte = renderToStaticMarkup(<ClientTicketChat ticket={ticket as never} />);
    expect(otwarte).not.toMatch(/administracj/);
    expect(otwarte).toContain('do opiekuna');
    const zamkniete = renderToStaticMarkup(<ClientTicketChat ticket={{ ...ticket, status: 'CLOSED' } as never} />);
    expect(zamkniete).not.toMatch(/ponowić|wyślij jeśli/);
    expect(zamkniete).toContain('otworzyć ponownie');
  });
});
