import { MailerService } from './mailer.service.js';
import { renderEmail } from './smtp-mailer.provider.js';
import {
  idyZNaglowka,
  krotkieIdZTematu,
  naglowkiWatku,
  poprawnyMessageId,
  zgloszenieZNaglowkow,
} from './watek-zgloszenia.js';
import { ODPOWIEDZ_MAX_ZNAKOW, ticketReplyNotificationTemplate, ticketStaffAssignedTemplate } from './templates/ticket-notifications.js';

/**
 * F3.7 (OE-19) — maile zgłoszenia w jednym wątku: Message-ID z id zgłoszenia, In-Reply-To i References wskazują
 * korzeń i maile klienta. Odpowiedź klienta z tymi nagłówkami wraca do zgłoszenia (poczta przychodząca).
 */
const ID = '1a2b3c4d-0000-4000-8000-0000000000aa';

describe('nagłówki wątku zgłoszenia', () => {
  it('Message-ID z id zgłoszenia, In-Reply-To = ostatni mail klienta, References = korzeń + maile klienta', () => {
    const n = naglowkiWatku(ID, 'verris.pl', ['<a@gmail.com>', '<b@gmail.com>']);
    expect(n.messageId).toMatch(new RegExp(`^<zgl\\.${ID}\\.[0-9a-f]{16}@verris\\.pl>$`));
    expect(n.inReplyTo).toBe('<b@gmail.com>');
    expect(n.references).toEqual([`<zgl.${ID}@verris.pl>`, '<a@gmail.com>', '<b@gmail.com>']);
    // Bez maili klienta — odpowiadamy na korzeń.
    expect(naglowkiWatku(ID, 'verris.pl').inReplyTo).toBe(`<zgl.${ID}@verris.pl>`);
    // References nie rośnie bez końca.
    expect(naglowkiWatku(ID, 'verris.pl', Array.from({ length: 30 }, (_, i) => `<m${i}@x.pl>`)).references).toHaveLength(10);
  });

  it('odpowiedź klienta: id zgłoszenia z nagłówków tylko z naszej domeny; temat „[#xxxxxxxx]” zapasowo', () => {
    const n = naglowkiWatku(ID, 'verris.pl');
    expect(zgloszenieZNaglowkow([n.messageId], 'verris.pl')).toBe(ID);
    expect(zgloszenieZNaglowkow([...n.references, '<cos@gmail.com>'], 'verris.pl')).toBe(ID);
    expect(zgloszenieZNaglowkow([`<zgl.${ID}@obca.pl>`], 'verris.pl')).toBeNull();
    expect(zgloszenieZNaglowkow(['<abc@gmail.com>'], 'verris.pl')).toBeNull();
    expect(krotkieIdZTematu('Re: [#1A2B3C4D] Odpowiedź opiekuna: DNS')).toBe('1a2b3c4d');
    expect(krotkieIdZTematu('Re: pytanie')).toBeNull();
  });

  it('nagłówek In-Reply-To / References: tylko poprawne id, bez CR/LF i komentarzy', () => {
    expect(idyZNaglowka('<a@x.pl> (komentarz)\r\n <b@y.pl> <a@x.pl>')).toEqual(['<a@x.pl>', '<b@y.pl>']);
    expect(poprawnyMessageId('<a@x.pl>\r\nBcc: ofiara@x.pl')).toBe(false);
    expect(poprawnyMessageId('<a b@x.pl>')).toBe(false);
  });

  it('SMTP: renderuje In-Reply-To i References (zawinięte), pomija wstrzyknięcie nagłówka', () => {
    const baza = { from: { address: 'support@verris.pl', name: 'Verris' }, to: 'k@x.pl', subject: 'S', text: 't', messageId: '<m@verris.pl>' };
    const ok = renderEmail({ ...baza, inReplyTo: '<a@gmail.com>', references: [`<zgl.${ID}@verris.pl>`, '<a@gmail.com>'] });
    expect(ok).toContain('In-Reply-To: <a@gmail.com>\r\n');
    expect(ok).toContain(`References: <zgl.${ID}@verris.pl>\r\n <a@gmail.com>\r\n`);
    const zly = renderEmail({ ...baza, inReplyTo: '<a@x.pl>\r\nBcc: ofiara@x.pl', references: ['<b@x.pl>\r\nX-Evil: 1'] });
    expect(zly).not.toMatch(/Bcc:|X-Evil|In-Reply-To|References/);
  });

  it('MailerService: mail z zgloszenieId dostaje nagłówki wątku; bez niego — bez zmian', async () => {
    const wyslane: Array<Record<string, unknown>> = [];
    const provider = { id: 'p', send: vi.fn(async (m: Record<string, unknown>) => (wyslane.push(m), { providerId: 'p', messageId: String(m.messageId ?? 'x') })) };
    const prisma = {
      user: { findUnique: vi.fn(async () => null) },
      emailLog: { create: vi.fn(async () => ({ id: 'l1' })), update: vi.fn(async () => ({})) },
      controlPlaneSystemAddress: { findUnique: vi.fn(async () => null) },
    };
    const svc = new MailerService(provider as never, { fromAddress: 'panel@verris.pl', fromName: 'Verris', swallowErrors: true }, prisma as never, { get: () => undefined } as never);
    const r = await svc.send({ to: 'k@x.pl', subject: `[#${ID.slice(0, 8)}] S`, text: 't', zgloszenieId: ID });
    expect(wyslane[0]).toMatchObject({ inReplyTo: `<zgl.${ID}@verris.pl>`, references: [`<zgl.${ID}@verris.pl>`] });
    expect(String(wyslane[0].messageId)).toMatch(/^<zgl\./);
    expect(r.messageId).toBe(wyslane[0].messageId);
    await svc.send({ to: 'k@x.pl', subject: 'S', text: 't' });
    expect(wyslane[1]).not.toHaveProperty('messageId');
  });
});

describe('mail z odpowiedzią opiekuna', () => {
  it('klient dostaje całą odpowiedź (nie 500 znaków) w wątku zgłoszenia; obsługa — fragment, bez wątku', () => {
    const dluga = 'Sprawdziliśmy rekordy DNS. '.repeat(60);
    const doKlienta = ticketReplyNotificationTemplate({ to: 'k@x.pl', ticketId: ID, subject: 'DNS', excerpt: dluga, panelUrl: 'https://p', isFromStaff: true });
    expect(doKlienta.zgloszenieId).toBe(ID);
    expect(doKlienta.text).toContain(dluga.trim());
    expect(doKlienta.text).toContain('Możesz odpowiedzieć na tę wiadomość');
    const doObslugi = ticketReplyNotificationTemplate({ to: 's@verris.pl', ticketId: ID, subject: 'DNS', excerpt: dluga, panelUrl: 'https://p', isFromStaff: false });
    expect(doObslugi.zgloszenieId).toBeUndefined();
    expect(doObslugi.text).not.toContain(dluga.trim());
    expect(ODPOWIEDZ_MAX_ZNAKOW).toBeGreaterThan(500);
    expect(ticketStaffAssignedTemplate({ to: 's@verris.pl', ticketId: ID, subject: 'DNS', staffPanelUrl: 'https://s' }).zgloszenieId).toBeUndefined();
  });
});
