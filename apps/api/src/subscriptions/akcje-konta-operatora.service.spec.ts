import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service.js';
import { AkcjeKontaOperatoraService } from './akcje-konta-operatora.service.js';
import { ZawieszenieOperatoraService } from './zawieszenie-operatora.service.js';

/**
 * F2.2 — pasek akcji konta: operator działa przez metody panelu klienta z id WŁAŚCICIELA, nigdy nie widzi hasła,
 * powód jest obowiązkowy, dziennik zespołu ma powód i wynik, a klient widzi wpis „obsługa Verris (zgłoszenie #…)”.
 * AuditService jest prawdziwy (z podstawioną tabelą), żeby sprawdzić przepisanie autora wpisów serwisów hostingu.
 */
const WLASCICIEL = 'u-wlasciciel';
const OPERATOR = 's-operator';
const ZGLOSZENIE = 'ab12cd34-0000-4000-8000-000000000001';

type Wiersz = { action: string; userId: string | null; actorUserId: string | null; details: Record<string, unknown> };

function zbuduj(opcje: { sub?: unknown; bladWezla?: Error; uzytkownicyBazy?: string[]; mailRzuca?: boolean } = {}) {
  const wiersze: Wiersz[] = [];
  const sub =
    opcje.sub === undefined
      ? { userId: WLASCICIEL, user: { email: 'anna@klient.pl', firstName: 'Anna', role: 'USER' }, account: { id: 'acc1', domain: 'klient.pl' } }
      : opcje.sub;
  const prisma = {
    subscription: { findUnique: vi.fn(async () => sub) },
    ticket: { findMany: vi.fn(async ({ where }: { where: { userId: string } }) => (where.userId === WLASCICIEL ? [{ id: ZGLOSZENIE }] : [])) },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Wiersz }) => {
        wiersze.push(data);
        return data;
      }),
    },
  };
  const audit = new AuditService(prisma as never);
  const hasla: string[] = [];
  // Serwisy hostingu zapisują jak dla klienta: userId = actorUserId = właściciel (np. directadmin.service.ts).
  const wpisKlienta = (action: string, details: Record<string, unknown>) => (userId: string) =>
    audit.record({ action, userId, actorUserId: userId, details: details as never });
  const directAdmin = {
    changeHostingEmailPassword: vi.fn(async (_s: string, userId: string, i: { email: string; password: string }) => {
      if (opcje.bladWezla) throw opcje.bladWezla;
      hasla.push(i.password);
      await wpisKlienta('HOSTING_EMAIL_PASSWORD_CHANGED', { subscriptionId: 's1', email: i.email })(userId);
      return { ok: true as const };
    }),
    changeHostingFtpPassword: vi.fn(async (_s: string, userId: string, _u: string, password: string) => {
      hasla.push(password);
      await wpisKlienta('HOSTING_FTP_PASSWORD_CHANGED', { subscriptionId: 's1' })(userId);
      return { ok: true as const };
    }),
    listHostingDbUsers: vi.fn(async () => ({ users: opcje.uzytkownicyBazy ?? ['u1_wp'], fetchError: null })),
    changeHostingDbUserPassword: vi.fn(async (_s: string, _u: string, i: { password: string }) => {
      hasla.push(i.password);
      return { ok: true as const };
    }),
    requestLetsEncryptCertificate: vi.fn(async () => ({ ok: true as const })),
    createHostingSiteBackupNow: vi.fn(async () => ({ ok: true as const })),
    createHostingDnsRecord: vi.fn(async () => ({ ok: true as const })),
    editHostingDnsRecord: vi.fn(async () => ({ ok: true as const })),
    deleteHostingDnsRecord: vi.fn(async () => ({ ok: true as const })),
  };
  const php = { setVersionForSubscription: vi.fn(async (_s: string, userId: string) => {
    await audit.record({ action: 'PHP_VERSION_CHANGE_QUEUED', userId, actorUserId: userId, details: { version: '8.3' } });
    return { version: '8.3' };
  }) };
  const malware = { zlec: vi.fn(async () => ({ wToku: true })) };
  const mailer = { send: vi.fn(async () => {
    if (opcje.mailRzuca) throw new Error('SMTP');
    return { delivered: true };
  }) };
  const config = { get: () => 'https://panel.test' };
  const zgloszenia = new ZawieszenieOperatoraService(prisma as never, {} as never);
  const svc = new AkcjeKontaOperatoraService(
    prisma as never,
    directAdmin as never,
    php as never,
    malware as never,
    audit,
    mailer as never,
    config as never,
    zgloszenia,
  );
  return { svc, prisma, directAdmin, php, malware, mailer, wiersze, hasla };
}

const z = (powod = 'Klient zgłosił wyciek hasła skrzynki', zgloszenie?: string, operatorRole = 'STAFF') => ({ subscriptionId: 's1', operatorUserId: OPERATOR, operatorRole, powod, zgloszenie });
const dziennikZespolu = (w: Wiersz[]) => w.filter((r) => r.action === 'OPERATOR_ACCOUNT_CHANGED');

describe('F2.2 AkcjeKontaOperatoraService — reset hasła skrzynki', () => {
  it('woła metodę klienta z id właściciela, hasło losowe nie wraca w odpowiedzi, mailu ani dzienniku', async () => {
    const { svc, directAdmin, mailer, wiersze, hasla } = zbuduj();
    const wynik = await svc.resetHaslaSkrzynki(z(undefined, '#ab12cd34'), 'Jan@Klient.pl');

    expect(directAdmin.changeHostingEmailPassword).toHaveBeenCalledWith('s1', WLASCICIEL, { email: 'jan@klient.pl', password: expect.any(String) });
    expect(hasla).toHaveLength(1);
    expect(hasla[0]).toMatch(/^[A-Za-z0-9]{24}$/);
    expect(wynik).toEqual({ ok: true, mailDoKlienta: true, klient: 'anna@klient.pl' });

    const mail = (mailer.send.mock.calls as unknown as [{ to: string; text: string; html: string }][])[0][0];
    expect(mail.to).toBe('anna@klient.pl');
    expect(mail.text).toContain('jan@klient.pl');
    expect(mail.text).toContain('#ab12cd34');
    // Zakładka „Poczta” usługi (MailTab ma „Zmień hasło”); strona domeny pokazuje samą listę adresów.
    expect(mail.text).toContain('https://panel.test/dashboard/services/s1?tab=mail');
    expect(mail.text).not.toContain('/sites/');
    expect(`${mail.text}${mail.html}${JSON.stringify(wynik)}${JSON.stringify(wiersze)}`).not.toContain(hasla[0]);
  });

  it('klient widzi wpis serwisu z autorem = operator i numerem zgłoszenia; zespół ma powód i wynik', async () => {
    const { svc, wiersze } = zbuduj();
    await svc.resetHaslaSkrzynki(z(undefined, '#ab12cd34'), 'jan@klient.pl');
    const klienta = wiersze.find((r) => r.action === 'HOSTING_EMAIL_PASSWORD_CHANGED')!;
    expect(klienta).toMatchObject({ userId: WLASCICIEL, actorUserId: OPERATOR, details: { email: 'jan@klient.pl', zgloszenieId: ZGLOSZENIE } });
    expect(dziennikZespolu(wiersze)).toEqual([
      expect.objectContaining({
        userId: WLASCICIEL,
        actorUserId: OPERATOR,
        details: {
          subscriptionId: 's1',
          akcja: 'haslo-skrzynki',
          powod: 'Klient zgłosił wyciek hasła skrzynki',
          zgloszenieId: ZGLOSZENIE,
          email: 'jan@klient.pl',
          wynik: 'ok',
          mailDoKlienta: true,
        },
      }),
    ]);
  });

  it('mail nie wyszedł: reset zostaje, operator i dziennik o tym wiedzą', async () => {
    const { svc, wiersze } = zbuduj({ mailRzuca: true });
    const wynik = await svc.resetHaslaSkrzynki(z(), 'jan@klient.pl');
    expect(wynik.mailDoKlienta).toBe(false);
    expect(dziennikZespolu(wiersze)[0].details).toMatchObject({ wynik: 'ok', mailDoKlienta: false });
  });

  it('powód krótszy niż 10 znaków → 400 bez wołania węzła i bez wpisów', async () => {
    const { svc, directAdmin, wiersze } = zbuduj();
    await expect(svc.resetHaslaSkrzynki(z('   krótko  '), 'jan@klient.pl')).rejects.toBeInstanceOf(BadRequestException);
    expect(directAdmin.changeHostingEmailPassword).not.toHaveBeenCalled();
    expect(wiersze).toEqual([]);
  });

  it('zgłoszenie innego klienta → 400 bez zmiany', async () => {
    const { svc, prisma, directAdmin } = zbuduj();
    prisma.ticket.findMany.mockResolvedValueOnce([]);
    await expect(svc.resetHaslaSkrzynki(z(undefined, '#ffffffff'), 'jan@klient.pl')).rejects.toBeInstanceOf(BadRequestException);
    expect(directAdmin.changeHostingEmailPassword).not.toHaveBeenCalled();
  });

  it('brak usługi albo konta → 404 bez wpisu', async () => {
    for (const sub of [null, { userId: WLASCICIEL, user: { email: 'a@b.pl', firstName: null, role: 'USER' }, account: null }]) {
      const { svc, wiersze } = zbuduj({ sub });
      await expect(svc.kopia(z())).rejects.toBeInstanceOf(NotFoundException);
      expect(wiersze).toEqual([]);
    }
  });

  it('przegląd: STAFF nie zmienia usługi konta zespołu (ADMIN/STAFF) — 403 bez węzła i wpisów; ADMIN może', async () => {
    for (const rola of ['ADMIN', 'STAFF']) {
      const sub = { userId: WLASCICIEL, user: { email: 'szef@verris.pl', firstName: null, role: rola }, account: { id: 'acc1', domain: 'verris.pl' } };
      const { svc, directAdmin, mailer, wiersze } = zbuduj({ sub });
      await expect(svc.dnsDodaj(z(), { domain: 'verris.pl', name: '@', type: 'MX', value: '10 mx.obcy.pl.' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.resetHaslaSkrzynki(z(), 'szef@verris.pl')).rejects.toBeInstanceOf(ForbiddenException);
      expect(directAdmin.createHostingDnsRecord).not.toHaveBeenCalled();
      expect(directAdmin.changeHostingEmailPassword).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
      expect(wiersze).toEqual([]);

      const admin = zbuduj({ sub });
      await admin.svc.kopia(z(undefined, undefined, 'ADMIN'));
      expect(admin.directAdmin.createHostingSiteBackupNow).toHaveBeenCalledWith('s1', WLASCICIEL);
    }
  });

  it('błąd węzła = błąd dla operatora (z treścią), wpis zespołu „blad”, bez maila i bez wpisu klienta', async () => {
    const { svc, mailer, wiersze } = zbuduj({ bladWezla: new BadRequestException('DirectAdmin: Unable to modify the account') });
    await expect(svc.resetHaslaSkrzynki(z(), 'jan@klient.pl')).rejects.toThrow('DirectAdmin: Unable to modify the account');
    expect(mailer.send).not.toHaveBeenCalled();
    expect(wiersze.map((r) => r.action)).toEqual(['OPERATOR_ACCOUNT_CHANGED']);
    expect(wiersze[0].details).toMatchObject({ wynik: 'blad', blad: 'DirectAdmin: Unable to modify the account' });
  });
});

describe('F2.2 AkcjeKontaOperatoraService — pozostałe akcje', () => {
  it('FTP: losowe hasło przez metodę klienta, mail z linkiem do zakładki FTP', async () => {
    const { svc, directAdmin, mailer } = zbuduj();
    await svc.resetHaslaFtp(z(), 'ftp@klient.pl');
    expect(directAdmin.changeHostingFtpPassword).toHaveBeenCalledWith('s1', WLASCICIEL, 'ftp@klient.pl', expect.stringMatching(/^[A-Za-z0-9]{24}$/));
    expect((mailer.send.mock.calls as unknown as [{ text: string }][])[0][0].text).toContain('https://panel.test/dashboard/services/s1?tab=ftp');
  });

  it('baza: użytkownik spoza bazy → 404, hasło bez zmian; użytkownik bazy → reset i mail', async () => {
    const zly = zbuduj({ uzytkownicyBazy: ['u1_inny'] });
    await expect(zly.svc.resetHaslaBazy(z(), 'u1_wp', 'u1_wp')).rejects.toBeInstanceOf(NotFoundException);
    expect(zly.directAdmin.changeHostingDbUserPassword).not.toHaveBeenCalled();

    const ok = zbuduj();
    const wynik = await ok.svc.resetHaslaBazy(z(), 'u1_wp', 'u1_wp');
    expect(ok.directAdmin.listHostingDbUsers).toHaveBeenCalledWith('s1', WLASCICIEL, 'u1_wp');
    expect(ok.directAdmin.changeHostingDbUserPassword).toHaveBeenCalledWith('s1', WLASCICIEL, { db: 'u1_wp', user: 'u1_wp', password: expect.any(String) });
    expect(wynik.mailDoKlienta).toBe(true);
    expect((ok.mailer.send.mock.calls as unknown as [{ text: string }][])[0][0].text).toContain('https://panel.test/dashboard/services/s1?tab=databases');
  });

  it('SSL, kopia, PHP, DNS: wpis klienta z autorem = operator (serwis sam go nie robi), bez wildcard', async () => {
    const { svc, directAdmin, php, wiersze } = zbuduj();
    await svc.ssl(z(undefined, '#ab12cd34'), 'Klient.pl', true);
    await svc.kopia(z());
    await svc.wersjaPhp(z(), '8.3');
    await svc.dnsDodaj(z(), { domain: 'klient.pl', name: 'www', type: 'A', value: '203.0.113.5', ttl: 300 });
    await svc.dnsZmien(z(), { domain: 'klient.pl', old: { name: 'www', type: 'A', value: '203.0.113.5' }, next: { name: 'www', type: 'A', value: '203.0.113.6', ttl: 300 } });
    await svc.dnsUsun(z(), { domain: 'klient.pl', name: 'www', type: 'A', value: '203.0.113.6' });

    expect(directAdmin.requestLetsEncryptCertificate).toHaveBeenCalledWith('s1', WLASCICIEL, { domain: 'klient.pl', includeWww: true, wildcard: false });
    expect(directAdmin.createHostingSiteBackupNow).toHaveBeenCalledWith('s1', WLASCICIEL);
    expect(php.setVersionForSubscription).toHaveBeenCalledWith('s1', WLASCICIEL, '8.3');
    expect(directAdmin.createHostingDnsRecord).toHaveBeenCalledWith('s1', WLASCICIEL, expect.objectContaining({ value: '203.0.113.5' }));

    const klienta = wiersze.filter((r) => r.action.startsWith('HOSTING_'));
    expect(klienta.map((r) => r.action)).toEqual([
      'HOSTING_SSL_REQUESTED',
      'HOSTING_BACKUP_CREATED',
      'HOSTING_PHP_VERSION_CHANGED',
      'HOSTING_DNS_RECORD_CREATED',
      'HOSTING_DNS_RECORD_UPDATED',
      'HOSTING_DNS_RECORD_DELETED',
    ]);
    for (const r of klienta) expect({ a: r.action, autor: r.actorUserId, kto: r.userId }).toEqual({ a: r.action, autor: OPERATOR, kto: WLASCICIEL });
    expect(klienta[0].details).toMatchObject({ domain: 'klient.pl', zgloszenieId: ZGLOSZENIE });
    // Wpis samego serwisu PHP (kolejka zadania) też nie mówi, że zrobił to klient.
    expect(wiersze.find((r) => r.action === 'PHP_VERSION_CHANGE_QUEUED')?.actorUserId).toBe(OPERATOR);
    expect(dziennikZespolu(wiersze).map((r) => r.details.akcja)).toEqual(['ssl', 'kopia', 'php', 'dns-dodaj', 'dns-zmien', 'dns-usun']);
  });

  it('skan: zadanie MALWARE_SCAN przez serwis klienta z id właściciela', async () => {
    const { svc, malware, wiersze } = zbuduj();
    await svc.skan(z());
    expect(malware.zlec).toHaveBeenCalledWith('s1', WLASCICIEL, 'scan');
    expect(dziennikZespolu(wiersze)[0].details).toMatchObject({ akcja: 'skan', wynik: 'ok' });
  });
});
