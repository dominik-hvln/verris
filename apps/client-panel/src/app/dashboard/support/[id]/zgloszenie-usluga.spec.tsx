import { renderToStaticMarkup } from 'react-dom/server';

/** PB-43 — widok zgłoszenia pokazuje usługę, której dotyczy (z linkiem do usługi). */
const mockTicket = jest.fn();
jest.mock('../actions', () => ({ fetchTicketDetail: () => mockTicket() }));
jest.mock('./client-ticket-chat', () => ({ __esModule: true, default: () => null }));
jest.mock('./ticket-csat', () => ({ TicketCsat: () => <div data-ocena /> }));
jest.mock('next/navigation', () => ({ notFound: () => { throw new Error('404'); } }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import ClientTicketPage from './page';

const baza = {
  id: 'abcdef12-0000-0000-0000-000000000000', subject: 'Strona', status: 'OPEN', message: 'x', priority: 'NORMAL',
  createdAt: '2026-10-08T08:00:00Z', updatedAt: '2026-10-08T08:00:00Z', replies: [],
};
const html = async () => renderToStaticMarkup(await ClientTicketPage({ params: Promise.resolve({ id: baza.id }) }));

describe('widok zgłoszenia — usługa', () => {
  it('powiązana usługa z linkiem do karty usługi', async () => {
    mockTicket.mockResolvedValue({ ...baza, subscription: { id: 's1', serviceTag: 'wnbgswgc', plan: { name: 'Hosting' }, account: { domain: 'sklep.pl' } } });
    const h = await html();
    expect(h).toContain('href="/dashboard/services/s1"');
    expect(h).toContain('sklep.pl (wnbgswgc)');
  });

  it('bez usługi — mówi to wprost', async () => {
    mockTicket.mockResolvedValue({ ...baza, subscription: null });
    expect(await html()).toContain('Zgłoszenie nie dotyczy konkretnej usługi.');
  });
});

describe('widok zgłoszenia — połączone z innym (przegląd F3.7)', () => {
  it('zamknięte zwykłe — ocena; połączone z innym — bez oceny (ocenia się zgłoszenie docelowe)', async () => {
    mockTicket.mockResolvedValue({ ...baza, status: 'CLOSED', resolvedAt: '2026-10-08T09:00:00Z' });
    expect(await html()).toContain('data-ocena');
    mockTicket.mockResolvedValue({ ...baza, status: 'CLOSED', resolvedAt: '2026-10-08T09:00:00Z', scalonoDoId: '12345678-0000-0000-0000-000000000000' });
    const h = await html();
    expect(h).not.toContain('data-ocena');
    expect(h).toContain('href="/dashboard/support/12345678-0000-0000-0000-000000000000"');
  });
});
