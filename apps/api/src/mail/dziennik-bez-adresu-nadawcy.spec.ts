import { MailerService, TAGI_BEZ_ADRESU_ODPOWIEDZI } from './mailer.service.js';
import { TAG_MAILA } from '../kreator/formularz.service.js';

/**
 * Paczka 126 — dziennik wysyłek (EmailLog) a formularze stron z Verris Kreatora: adres osoby, która napisała do Klienta
 * (Reply-To), trafia do maila, ale nie do dziennika (DPA §2 ust. 4). Inne maile zachowują Reply-To w metadanych.
 */
function stanowisko() {
  const provider = { id: 'test', send: vi.fn(async () => ({ providerId: 'test', messageId: 'm1' })) };
  const prisma = {
    user: { findUnique: vi.fn(async () => ({ id: 'u1', anonymizedAt: null, marketingPreferences: null })) },
    emailLog: { create: vi.fn(async () => ({ id: 'l1' })), update: vi.fn(async () => ({})) },
    controlPlaneSystemAddress: { findUnique: vi.fn(async () => null) },
  };
  const svc = new MailerService(provider as never, { fromName: 'Verris', swallowErrors: false } as never, prisma as never, { get: () => undefined } as never);
  return { svc, provider, prisma };
}
const zapis = (p: ReturnType<typeof stanowisko>['prisma']) => (p.emailLog.create.mock.calls as unknown as [{ data: Record<string, unknown> }][])[0][0].data;

describe('paczka 126 – dziennik wysyłek bez adresu nadawcy formularza', () => {
  it('kreator.formularz: Reply-To idzie w mailu, w EmailLog nie ma ani adresu, ani treści; pola limitu zostają', async () => {
    const s = stanowisko();
    const r = await s.svc.send({
      to: 'salon@klient.test', userId: 'u1', subject: 'Wiadomość ze strony salon.pl', text: 'Imię: Anna\nWiadomość: proszę o termin',
      replyTo: 'anna.nadawca@poczta.test', category: 'TRANSACTIONAL', tag: TAG_MAILA, fromRole: 'NOREPLY',
    });
    expect(r.delivered).toBe(true);
    expect((s.provider.send.mock.calls[0] as unknown as [{ replyTo?: string }])[0].replyTo).toBe('anna.nadawca@poczta.test');
    const d = zapis(s.prisma);
    expect(JSON.stringify(d)).not.toContain('anna.nadawca@poczta.test');
    expect(JSON.stringify(d)).not.toContain('proszę o termin');
    expect(d).toMatchObject({ tag: 'kreator.formularz', userId: 'u1', subject: 'Wiadomość ze strony salon.pl' });
    expect(TAGI_BEZ_ADRESU_ODPOWIEDZI.has(TAG_MAILA)).toBe(true);
  });

  it('inne maile: Reply-To zostaje w metadanych (np. odpowiedź obsługi)', async () => {
    const s = stanowisko();
    await s.svc.send({ to: 'jan@firma.pl', userId: 'u1', subject: 's', text: 't', replyTo: 'support@verris.pl', category: 'TRANSACTIONAL', tag: 'ticket.reply' });
    expect(zapis(s.prisma).metadata).toEqual({ replyTo: 'support@verris.pl' });
  });
});
