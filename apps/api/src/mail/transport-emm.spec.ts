import { EmmTransportNiedostepnyError, MailerService } from './mailer.service.js';
import { SmtpMailerProvider } from './smtp-mailer.provider.js';
import { parseSmtpUrl } from './mail-smtp.factory.js';

/**
 * Q-05 — newsletter klienta nie może iść przez SMTP poczty transakcyjnej Verris (reset hasła,
 * faktury). Kampanie mają własny transport z EMM_SMTP_URL; bez niego odmowa, nie transport platformy.
 */
function stanowisko(env: Record<string, string | undefined>) {
  const platforma = { id: 'platforma', send: vi.fn(async () => ({ providerId: 'platforma', messageId: 'p1' })) };
  const prisma = {
    user: { findUnique: vi.fn(async () => null) },
    emailLog: { create: vi.fn(async () => ({ id: 'l1' })), update: vi.fn(async () => ({})) },
    controlPlaneSystemAddress: { findUnique: vi.fn(async () => null) },
  };
  const svc = new MailerService(
    platforma as never,
    { fromAddress: 'panel@verris.pl', fromName: 'Verris', swallowErrors: true } as never,
    prisma as never,
    { get: (k: string) => env[k] } as never,
  );
  return { svc, platforma, prisma };
}

const kampania = {
  to: 'odbiorca@example.com',
  subject: 'Nowości',
  text: 't',
  category: 'MARKETING' as const,
  externalRecipient: true,
  transport: 'EMM' as const,
  listUnsubscribeUrl: 'https://api.verris.pl/emm/unsubscribe?token=un_1',
};

afterEach(() => vi.restoreAllMocks());

describe('Q-05 — osobny transport kampanii (EMM_SMTP_URL)', () => {
  it('bez EMM_SMTP_URL: odmowa mimo swallowErrors, SMTP platformy nietknięty, nic w EmailLog', async () => {
    const s = stanowisko({});
    expect(s.svc.emmTransportConfigured()).toBe(false);
    await expect(s.svc.send(kampania)).rejects.toBeInstanceOf(EmmTransportNiedostepnyError);
    expect(s.platforma.send).not.toHaveBeenCalled();
    expect(s.prisma.emailLog.create).not.toHaveBeenCalled();
  });

  it('niepełny adres (zdalny host bez hasła) też nie jest transportem — nie „wysyła” do logu', async () => {
    const s = stanowisko({ EMM_SMTP_URL: 'smtp://emm.example.com:587' });
    expect(s.svc.emmTransportConfigured()).toBe(false);
    await expect(s.svc.send(kampania)).rejects.toBeInstanceOf(EmmTransportNiedostepnyError);
  });

  it('z EMM_SMTP_URL kampania idzie osobnym serwerem, z List-Unsubscribe; poczta transakcyjna dalej platformą', async () => {
    const wywolania: Array<{ host: string; password: string; to: string; unsub?: string }> = [];
    vi.spyOn(SmtpMailerProvider.prototype, 'send').mockImplementation(async function (this: SmtpMailerProvider, m) {
      const c = (this as unknown as { config: { host: string; password: string } }).config;
      wywolania.push({ host: c.host, password: c.password, to: m.to, unsub: m.listUnsubscribeUrl });
      return { providerId: 'smtp', messageId: 'e1' };
    });
    const s = stanowisko({ EMM_SMTP_URL: 'smtp://news%40firma.pl:p%40ss:w0rd@emm.example.com:2525' });

    const wynik = await s.svc.send(kampania);
    expect(wynik.delivered).toBe(true);
    expect(wywolania).toEqual([
      { host: 'emm.example.com', password: 'p@ss:w0rd', to: 'odbiorca@example.com', unsub: kampania.listUnsubscribeUrl },
    ]);
    expect(s.platforma.send).not.toHaveBeenCalled();

    await s.svc.send({ to: 'klient@firma.pl', subject: 'Reset hasła', text: 't' });
    expect(s.platforma.send).toHaveBeenCalledTimes(1);
    expect(wywolania).toHaveLength(1);
  });
});

describe('parseSmtpUrl', () => {
  const d = { fromAddress: 'panel@verris.pl', fromName: 'Verris' };
  it('smtp → STARTTLS:587, smtps → TLS:465, localhost bez TLS, ?from= nadpisuje nadawcę, śmieci → null', () => {
    expect(parseSmtpUrl('smtp://u:p@relay.example', d)).toMatchObject({ host: 'relay.example', port: 587, secure: 'starttls', username: 'u', password: 'p', fromAddress: 'panel@verris.pl' });
    expect(parseSmtpUrl('smtps://u:p@relay.example?from=news@firma.pl', d)).toMatchObject({ port: 465, secure: 'tls', fromAddress: 'news@firma.pl' });
    expect(parseSmtpUrl('smtp://localhost:25', d)).toMatchObject({ secure: 'none', port: 25 });
    expect(parseSmtpUrl('http://u:p@relay.example', d)).toBeNull();
    expect(parseSmtpUrl('nie-adres', d)).toBeNull();
    expect(parseSmtpUrl('', d)).toBeNull();
  });
});
