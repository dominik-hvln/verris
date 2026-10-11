import { AiChatService, bezMarkdown, terminDlaAsystenta } from './ai-chat.service.js';

/**
 * t1 05.10 — czat na pulpicie: asystent nie znał daty odnowienia ani SSL („nie mam dostępu”),
 * a odpowiedź pokazywała surowe **pogrubienia**. Kwot nadal nie wysyłamy do dostawcy (RCPD A13).
 */
describe('AiChatService — kontekst pulpitu i zwykły tekst', () => {
  function serwis(answer: string) {
    const prisma = {
      subscription: {
        findMany: vi.fn(async () => [
          {
            status: 'ACTIVE',
            currentPeriodEnd: new Date('2026-10-28T00:00:00Z'),
            plan: { name: 'Hosting' },
            account: { domain: 'd3.hvln.pl' },
            siteMonitor: { tlsExpiresAt: new Date('2026-12-20T00:00:00Z') },
          },
        ]),
      },
      aiInteractionLog: { create: vi.fn(async () => ({})) },
    };
    const chat = vi.fn(async () => ({ wynik: answer, dostawca: 'openai', model: 'gpt-6-luna', wej: 1, wyj: 1, kosztUsd: 0 }));
    const provider = { dostepny: vi.fn(async () => true), przekroczonyLimitKlienta: vi.fn(async () => null), chat, opis: vi.fn(async () => ({ dostawca: 'openai', model: 'm' })) };
    const kb = { retrieve: vi.fn(async () => []) };
    const audit = { record: vi.fn(async () => undefined) };
    return { svc: new AiChatService(prisma as never, provider as never, kb as never, audit as never), chat, prisma };
  }

  it('lista usług w kontekście ma datę odnowienia i SSL, bez kwot; odpowiedź bez Markdown', async () => {
    const s = serwis('Usługa **d3.hvln.pl** odnawia się 28.10.\n## SSL\nWażny do 20.12.');
    const r = await s.svc.ask({ question: 'Kiedy odnowienie?', audience: 'CLIENT', userId: 'u1', actorUserId: 'u1' });
    const system = (s.chat.mock.calls[0] as unknown as [{ system: string }])[0].system;
    expect(system).toContain('"odnowienie":"2026-10-28"');
    expect(system).toContain('"sslWazneDo":"2026-12-20"');
    expect(system).not.toMatch(/price|cena|kwota/i);
    expect(r.answer).toBe('Usługa d3.hvln.pl odnawia się 28.10.\nSSL\nWażny do 20.12.');
  });

  it('bezMarkdown zostawia zwykły tekst bez zmian', () => {
    expect(bezMarkdown('Kroki:\n1. Wejdź w SSL\n2. Kliknij „Włącz”')).toBe('Kroki:\n1. Wejdź w SSL\n2. Kliknij „Włącz”');
  });
});

/** Weryfikacja 11.10 — usługa z rezygnacją na koniec okresu nie ma daty odnowienia w kontekście asystenta. */
describe('terminDlaAsystenta', () => {
  it('cancelAt: „dzialaDoBezOdnowienia”, odnowienie null; bez rezygnacji — data odnowienia', () => {
    const koniec = new Date('2026-11-08T10:00:00Z');
    expect(terminDlaAsystenta({ currentPeriodEnd: koniec, cancelAt: koniec })).toEqual({ odnowienie: null, dzialaDoBezOdnowienia: '2026-11-08' });
    expect(terminDlaAsystenta({ currentPeriodEnd: koniec, cancelAt: null })).toEqual({ odnowienie: '2026-11-08' });
  });
});
