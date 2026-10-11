import { BadGatewayException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { SZABLONY_MAILI_OBSLUGI, nazwaInfrastruktury, trescPromocyjna, wypelnijSzablon } from '@verris/contracts';
import { sprawdzTrescSerwisowa } from './tresc-serwisowa.js';
import { MailDoKlientaService } from './mail-do-klienta.service.js';
import { trescKomunikatu } from './komunikaty-serwisowe.service.js';
import { mailObslugiTemplate } from '../mail/templates/obsluga-notifications.js';

/**
 * F3.8 — poczta serwisowa od obsługi: bez treści promocyjnych (PKE), bez nazw infrastruktury (white label), bez
 * nieuzupełnionych pól szablonu; mail do klienta z szablonu — tylko do klienta, błąd wysyłki = błąd, ślad w dzienniku.
 */
const OK = 'Dzień dobry,\n\nwykryliśmy problem z usługą firma.pl i już nad nim pracujemy.\n\nZespół obsługi Verris';

describe('F3.8 — treść poczty serwisowej', () => {
  it.each([
    ['Mamy dla Ciebie rabat 20% na kolejny rok.', 'rabat'],
    ['Skorzystaj z promocji do końca tygodnia.', 'promocji'],
    ['Kod rabatowy: JESIEN', 'Kod rabatowy'],
    ['Zapisz się na newsletter Verris.', 'newsletter'],
    ['Polec znajomym i zyskaj.', 'Polec znajomym'],
  ])('treść promocyjna „%s” — odrzucona', (zdanie, fraza) => {
    expect(fraza.toLowerCase()).toContain(trescPromocyjna(zdanie)!.toLowerCase().slice(0, 4));
    expect(() => sprawdzTrescSerwisowa('Usługa firma.pl', `${OK}\n\n${zdanie}`)).toThrow(/promocyjnych/);
  });

  it('szablony obsługi same w sobie przechodzą reguły (po wypełnieniu pól) albo każą uzupełnić pola', () => {
    for (const s of SZABLONY_MAILI_OBSLUGI) {
      expect({ s: s.id, promo: trescPromocyjna(`${s.temat}\n${s.tresc}`), infra: nazwaInfrastruktury(s.tresc) }).toEqual({ s: s.id, promo: null, infra: null });
      const t = wypelnijSzablon(s.temat, { domena: 'firma.pl', imie: 'Anna' });
      const b = wypelnijSzablon(s.tresc, { domena: 'firma.pl', imie: 'Anna' });
      if (/\((opisz|termin)/.test(b)) expect(() => sprawdzTrescSerwisowa(t, b)).toThrow(/Uzupełnij/);
      else expect(sprawdzTrescSerwisowa(t, b).temat).toContain('firma.pl');
    }
  });

  it('nazwy infrastruktury, nieuzupełnione pola, długość — odrzucone', () => {
    expect(() => sprawdzTrescSerwisowa('Awaria', `${OK}\nRestartujemy Exima na serwerze.`)).toThrow(/infrastruktury/);
    expect(() => sprawdzTrescSerwisowa('Awaria', `${OK}\nPanel na porcie :2222`)).toThrow(/infrastruktury/);
    expect(() => sprawdzTrescSerwisowa('Usługa {domena}', OK)).toThrow(/Uzupełnij/);
    // Przegląd F3.8 — „port 2222” i skrót panelu „DA” (wielkimi literami; „da się” przechodzi), LSWS, CustomBuild.
    expect(() => sprawdzTrescSerwisowa('Awaria', `${OK}\nPanel serwera na porcie 2222 nie odpowiada.`)).toThrow(/infrastruktury/);
    expect(() => sprawdzTrescSerwisowa('Awaria', `${OK}\nRestartujemy DA na węźle.`)).toThrow(/infrastruktury/);
    expect(() => sprawdzTrescSerwisowa('Awaria', `${OK}\nAktualizacja Custom Build i LSWS.`)).toThrow(/infrastruktury/);
    expect(sprawdzTrescSerwisowa('Awaria usługi', `${OK}\nDa się już logować do panelu.`).temat).toBe('Awaria usługi');
    expect(() => sprawdzTrescSerwisowa('Hej', OK)).toThrow(/Temat/);
    expect(() => sprawdzTrescSerwisowa('Usługa firma.pl', 'krótko')).toThrow(/Treść/);
  });

  it('przegląd: adres węzła (hostname albo IP) w temacie lub treści — odrzucony; podobny adres klienta przechodzi', () => {
    const wezly = ['fra-01.wezly.example', '203.0.113.7'];
    expect(() => sprawdzTrescSerwisowa('Awaria fra-01.wezly.example', OK, wezly)).toThrow(/adresów serwerów/);
    expect(() => sprawdzTrescSerwisowa('Awaria', `${OK}\nSerwer 203.0.113.7 jest niedostępny.`, wezly)).toThrow(/adresów serwerów/);
    expect(() => trescKomunikatu('Awaria', `Dzień dobry{imie},\n\n${OK}\nWęzeł FRA-01.wezly.example.`, wezly)).toThrow(/adresów serwerów/);
    // Mail do jednego klienta: inny adres zawierający IP węzła jako fragment — przechodzi; poddomena klienta — przechodzi.
    expect(sprawdzTrescSerwisowa('Awaria', `${OK}\nTwój adres 203.0.113.70 odblokowaliśmy.`, wezly, { adresyIp: false }).temat).toBe('Awaria');
    expect(sprawdzTrescSerwisowa('Awaria', `${OK}\nStrona sklep.fra-01.wezly.example.pl działa.`, wezly).temat).toBe('Awaria');
    // Audyt Fali 3 — komunikat do wielu klientów: żaden adres IP.
    expect(() => sprawdzTrescSerwisowa('Awaria', `${OK}\nTwój adres 203.0.113.70 odblokowaliśmy.`, wezly)).toThrow(/adresów serwerów/);
  });

  it('audyt Fali 3 — jeden filtr white label: ModSecurity, OpenLiteSpeed, IPv6 i host panelu węzła, lvectl, CMD_API, ścieżki — odrzucone', () => {
    const wezly = ['n1', 'fra-01.wezly.example', 'panel-n1.infra.example', '203.0.113.7', '2a01:4f8:c17:1::2', null];
    for (const zdanie of [
      'Reguły ModSecurity blokowały formularze.',
      'Wyłączyliśmy regułę mod_security 942100.',
      'Restart OpenLiteSpeed zakończony.',
      'Uruchomiliśmy lvectl i selectorctl.',
      'Błąd CMD_API_SHOW_USERS po aktualizacji.',
      'Pliki w /usr/local/lsws zostały odtworzone.',
      'Filtr Rspamd odrzucał pocztę.',
    ]) {
      expect(() => sprawdzTrescSerwisowa('Awaria', `${OK}\n${zdanie}`, wezly), zdanie).toThrow(/infrastruktury/);
    }
    for (const zdanie of ['Restartujemy serwer 2a01:4f8:c17:1::2.', 'Panel panel-n1.infra.example jest niedostępny.', 'Awaria na 2001:db8::5 i 198.51.100.1.']) {
      expect(() => sprawdzTrescSerwisowa('Awaria', `${OK}\n${zdanie}`, wezly), zdanie).toThrow(/adresów serwerów/);
    }
    // Mail do jednego klienta: IPv6 i host panelu węzła — nadal odrzucone (dokładne dopasowanie z bazy).
    expect(() => sprawdzTrescSerwisowa('Awaria', `${OK}\nSerwer 2a01:4f8:c17:1::2 wrócił.`, wezly, { adresyIp: false })).toThrow(/adresów serwerów/);
    expect(() => sprawdzTrescSerwisowa('Awaria', `${OK}\nPanel panel-n1.infra.example działa.`, wezly, { adresyIp: false })).toThrow(/adresów serwerów/);
    // Wtyczka WordPressa i zwykłe słowa — przechodzą.
    expect(sprawdzTrescSerwisowa('Awaria usługi', `${OK}\nWtyczka LiteSpeed Cache działa, nie da się jej wyłączyć o 12:30:00.`, wezly).temat).toBe('Awaria usługi');
    // Panel (formularze) — ten sam filtr bez węzłów.
    expect(nazwaInfrastruktury('Reguły ModSecurity')).toBe('ModSecurity');
    expect(nazwaInfrastruktury('Twój adres 203.0.113.70', { adresyIp: false })).toBeNull();
    expect(nazwaInfrastruktury('Twój adres 203.0.113.70')).toBe('203.0.113.70');
  });

  it('komunikat: jedyne pole to {imie} (wstawiane przy wysyłce); {domena} trzeba uzupełnić', () => {
    expect(trescKomunikatu('Prace serwisowe', `Dzień dobry{imie},\n\n${OK}`).tresc).toContain('{imie}');
    expect(() => trescKomunikatu('Prace serwisowe', `Usługa {domena}\n\n${OK}`)).toThrow(/Uzupełnij/);
  });

  it('szablon maila: treść operatora escapowana (bez linków i formatowania), stopka serwisowa, nadawca obsługa', () => {
    const m = mailObslugiTemplate({ to: 'k@firma.pl', userId: 'k1', temat: 'Usługa firma.pl', tresc: `${OK}\n\n[kliknij](https://zlo.example) **ważne**`, panelUrl: 'https://panel.verris.pl', tag: 't', zgloszenieId: 'z1' });
    expect(m.html).not.toContain('href="https://zlo.example"');
    expect(m.text).toContain('wiadomość serwisowa');
    expect(m).toMatchObject({ category: 'TRANSACTIONAL', fromRole: 'SUPPORT', userId: 'k1', zgloszenieId: 'z1' });
    expect(m.text).not.toMatch(/wypisz/i);
  });
});

function srodowisko(o: { rola?: string; anon?: boolean; dostarczony?: boolean; wstrzymany?: boolean; zgloszenia?: string[] } = {}) {
  const wyslane: unknown[] = [];
  const audyt: Array<{ action: string; userId?: string; details: Record<string, unknown> }> = [];
  const prisma = {
    user: { findUnique: async () => ({ id: 'k1', role: o.rola ?? 'USER', email: 'anna@firma.pl', anonymizedAt: o.anon ? new Date() : null }) },
    ticket: { findMany: async () => (o.zgloszenia ?? []).map((id) => ({ id })) },
    server: { findMany: async () => [{ hostname: 'fra-01.wezly.example', ipAddress: '203.0.113.7' }, { hostname: null, ipAddress: '198.51.100.20' }] },
  };
  const mailer = {
    send: async (m: unknown) => {
      wyslane.push(m);
      return { providerId: 'smtp', messageId: 'x', emailLogId: 'log1', delivered: o.dostarczony ?? true, ...(o.wstrzymany ? { delivered: false, suppressedReason: 'ANONYMIZED' } : {}) };
    },
  };
  const svc = new MailDoKlientaService(prisma as never, { record: async (a: never) => void audyt.push(a) } as never, mailer as never, { get: () => undefined } as never);
  return { svc, wyslane, audyt };
}

describe('F3.8 — mail do klienta z szablonu', () => {
  const dto = { szablon: 'problem', temat: 'Usługa firma.pl — pracujemy nad problemem', tresc: OK };

  it('wysyła przez obsługę (TRANSACTIONAL, tag szablonu, userId klienta) i zapisuje w dzienniku zespołu', async () => {
    const s = srodowisko({ zgloszenia: ['11111111-2222-3333-4444-555555555555'] });
    expect(await s.svc.wyslij('k1', 'op1', { ...dto, zgloszenie: '#11111111' })).toEqual({ wyslany: true, emailLogId: 'log1' });
    expect(s.wyslane[0]).toMatchObject({ to: 'anna@firma.pl', userId: 'k1', tag: 'obsluga.mail.problem', category: 'TRANSACTIONAL', fromRole: 'SUPPORT', zgloszenieId: '11111111-2222-3333-4444-555555555555' });
    expect(s.audyt[0]).toMatchObject({ action: 'OPERATOR_CUSTOMER_MAILED', userId: 'k1', details: { szablon: 'problem', emailLogId: 'log1', wynik: 'wyslany' } });
  });

  it('konto zespołu, zanonimizowane, treść promocyjna, obce zgłoszenie, nieznany szablon — odmowa bez wysyłki', async () => {
    await expect(srodowisko({ rola: 'STAFF' }).svc.wyslij('k1', 'op1', dto)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(srodowisko({ anon: true }).svc.wyslij('k1', 'op1', dto)).rejects.toBeInstanceOf(BadRequestException);
    const s = srodowisko();
    await expect(s.svc.wyslij('k1', 'op1', { ...dto, tresc: `${OK}\n\nRabat 10% dla stałych klientów.` })).rejects.toThrow(/promocyjnych/);
    await expect(s.svc.wyslij('k1', 'op1', { ...dto, zgloszenie: '#abcdef12' })).rejects.toThrow(/Nie ma takiego zgłoszenia/);
    await expect(s.svc.wyslij('k1', 'op1', { ...dto, szablon: 'reklama' })).rejects.toThrow(/szablon/);
    await expect(s.svc.wyslij('k1', 'op1', { ...dto, tresc: `${OK}\n\nSerwer 198.51.100.20 wrócił.` })).rejects.toThrow(/adresów serwerów/);
    expect(s.wyslane).toEqual([]);
  });

  it('błąd serwera poczty = błąd dla operatora (502), wpis w dzienniku z wynikiem „blad”', async () => {
    const s = srodowisko({ dostarczony: false });
    await expect(s.svc.wyslij('k1', 'op1', dto)).rejects.toBeInstanceOf(BadGatewayException);
    expect(s.audyt[0].details.wynik).toBe('blad');
  });
});
