import { buildDraft, classifyTicket, renderTemplate, templateVars, type TicketDraftContext } from './ticket-context.js';

const ctx: TicketDraftContext = {
  firstName: 'Anna',
  lastName: 'Nowak',
  email: 'anna@firma.pl',
  company: 'Piekarnia',
  ticketId: 'abcdef12-3456-7890-abcd-ef1234567890',
  subject: 'Pomoc',
  slaResolveDueAt: new Date('2026-09-24T10:00:00Z'),
  service: { plan: 'Starter', domain: 'firma.pl', sslExpiresAt: new Date('2026-12-01T00:00:00Z'), siteDown: false },
  walletBalance: '12,50',
  lastInvoice: { number: 'VR/2026/09/7', status: 'OPEN' },
  kb: [],
};

describe('PB-18 klasyfikacja zgłoszeń', () => {
  it.each([
    ['Domena nie wskazuje na serwer', 'Zmieniłam serwery nazw u rejestratora wczoraj', 'DNS'],
    ['Kłódka', 'Przeglądarka pisze, że strona nie jest bezpieczna, certyfikat wygasł', 'SSL'],
    ['Poczta nie działa', 'Wiadomości trafiają do spamu u klientów', 'POCZTA'],
    ['Faktura', 'Zapłaciłem kartą, a portfel dalej pusty', 'PLATNOSC'],
    ['Przeniesienie strony', 'Chcę przenieść sklep z innego hostingu', 'MIGRACJA'],
    ['Strona leży', 'Od rana błąd 500, nic się nie otwiera', 'AWARIA'],
    ['Pytanie', 'Czy macie ofertę dla fundacji?', 'INNE'],
    ['Konto', 'Co należy zrobić, żeby dodać drugiego użytkownika?', 'INNE'],
  ])('%s → %s', (subject, message, expected) => {
    expect(classifyTicket({ subject, message })).toBe(expected);
  });

  it('temat wybrany przez klienta przeważa przy słabym sygnale z treści', () => {
    expect(classifyTicket({ subject: 'Problem', message: 'coś nie działa', topic: 'EMAIL' })).toBe('POCZTA');
  });
});

describe('PB-18 zmienne szablonów', () => {
  it('podstawia dane klienta, usługi i termin SLA; nieznane zostawia', () => {
    const out = renderTemplate('Cześć {{imie}}, domena {{ Domena }} ({{usluga}}), zgłoszenie #{{nr}} do {{termin}}. {{brak}}', templateVars(ctx));
    expect(out).toContain('Cześć Anna, domena firma.pl (Starter), zgłoszenie #abcdef12 do 24 września');
    expect(out).toContain('{{brak}}');
  });

  it('brak usługi = puste pola, nie „undefined”', () => {
    const out = renderTemplate('{{domena}}|{{usluga}}|{{termin}}', templateVars({ ...ctx, service: null, slaResolveDueAt: null }));
    expect(out).toBe('||');
  });
});

describe('PB-18 szkice odpowiedzi', () => {
  it('każda z 6 kategorii ma własną treść, z danymi konta i podpisem', () => {
    const drafts = (['DNS', 'SSL', 'POCZTA', 'PLATNOSC', 'MIGRACJA', 'AWARIA'] as const).map((c) => buildDraft(c, ctx));
    expect(new Set(drafts).size).toBe(6);
    for (const d of drafts) {
      expect(d.startsWith('Dzień dobry Anna,')).toBe(true);
      expect(d.endsWith('Zespół Verris')).toBe(true);
      expect(d).not.toMatch(/undefined|null|\n{3,}/);
    }
    expect(drafts[1]).toContain('ważny do 1 grudnia 2026');
    expect(drafts[3]).toContain('12,50 kredytów');
    expect(drafts[3]).toContain('VR/2026/09/7 — oczekuje na płatność');
    expect(drafts[5]).toContain('najpóźniej do 24 września');
  });

  it('awaria widziana przez monitoring jest potwierdzana; linki z bazy wiedzy na końcu', () => {
    const d = buildDraft('AWARIA', { ...ctx, service: { ...ctx.service!, siteDown: true }, kb: [{ title: 'Błąd 500', url: 'https://pomoc.verris.pl/a/blad-500' }] });
    expect(d).toContain('nasz monitoring też widzi problem');
    expect(d).toContain('– Błąd 500: https://pomoc.verris.pl/a/blad-500');
  });
});
