import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BetaZgloszeniaService, DOBA_MS } from './beta-zgloszenia.service.js';
import { ZgloszenieBetaDto } from './dto/zgloszenie-beta.dto.js';
import { odmowaZgloszeniaBetaTemplate, potwierdzenieZgloszeniaBetaTemplate, zgloszenieBetaNotifyTemplate } from './beta.templates.js';

/** Otwarta beta — zgłoszenia z verris.pl/beta: double opt-in, decyzja w adminie, retencja, ochrona przed nadużyciem. */
type Wiersz = Record<string, unknown> & { id: string; status: string; email: string };

function stanowisko(opts: { invite?: boolean; aktywne?: Wiersz | null; mailDzis?: boolean; wiersz?: Wiersz | null } = {}) {
  const prisma = {
    betaInvite: { findFirst: vi.fn(async () => (opts.invite ? { id: 'inv' } : null)) },
    betaZgloszenie: {
      findFirst: vi.fn(async (a: { where: { status?: unknown; mailAt?: unknown } }) => {
        if (a.where.mailAt) return opts.mailDzis ? { id: 'stare' } : null;
        return opts.aktywne ?? null;
      }),
      findUnique: vi.fn(async () => opts.wiersz ?? null),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 'z1', ...a.data })),
      update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => ({ ...(opts.aktywne ?? {}), id: a.where.id, ...a.data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      deleteMany: vi.fn(async () => ({ count: 2 })),
      findMany: vi.fn(async () => []),
      groupBy: vi.fn(async () => []),
    },
  };
  const mailer = { send: vi.fn(async () => ({ delivered: true })) };
  const config = { get: vi.fn((k: string) => ({ clientPanelUrl: 'https://panel.verris.pl', publicApiUrl: 'https://api.verris.pl/', leadsNotifyEmail: 'zespol@verris.pl' })[k]) };
  const audit = { record: vi.fn(async () => undefined) };
  const beta = { zapros: vi.fn(async () => ({ id: 'inv1', code: 'BETA-AAAAAA', mailWyslany: true })) };
  const svc = new BetaZgloszeniaService(prisma as never, mailer as never, config as never, audit as never, beta as never);
  return { svc, prisma, mailer, audit, beta };
}

const dto = (nadpisz: Partial<ZgloszenieBetaDto> = {}): ZgloszenieBetaDto =>
  ({
    imie: ' Ala ',
    email: ' Ala@Firma.PL ',
    zakres: ['WORDPRESS', 'POCZTA'],
    strona: 'https://firma.pl',
    zgoda: true,
    zgodaTekst: 'Chcę dostać zaproszenie do testów…',
    utm: { source: 'facebook', campaign: 'meta-leadgen-hosting-202611', term: '  ' },
    ...nadpisz,
  }) as ZgloszenieBetaDto;

const teraz = new Date('2026-11-20T10:00:00Z');

describe('BetaZgloszeniaService — formularz', () => {
  it('pułapka na boty: odpowiedź jak sukces, ale nic nie zapisuje i nic nie wysyła', async () => {
    const s = stanowisko();
    expect(await s.svc.zglos(dto({ firma: 'Spam sp. z o.o.' }), {}, teraz)).toEqual({ status: 'pending' });
    expect(s.prisma.betaZgloszenie.create).not.toHaveBeenCalled();
    expect(s.prisma.betaInvite.findFirst).not.toHaveBeenCalled();
    expect(s.mailer.send).not.toHaveBeenCalled();
  });

  it('nowe zgłoszenie: adres małymi literami, NIEPOTWIERDZONE z tokenem, puste UTM odrzucone; mail z linkiem potwierdzenia', async () => {
    const s = stanowisko();
    expect(await s.svc.zglos(dto(), { ip: '1.2.3.4', userAgent: 'UA' }, teraz)).toEqual({ status: 'pending' });
    const data = (s.prisma.betaZgloszenie.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data).toMatchObject({ email: 'ala@firma.pl', imie: 'Ala', status: 'NIEPOTWIERDZONE', ip: '1.2.3.4', zgodaAt: teraz });
    expect(data.utm).toEqual({ source: 'facebook', campaign: 'meta-leadgen-hosting-202611' });
    expect(typeof data.confirmToken).toBe('string');
    const mail = (s.mailer.send.mock.calls[0] as unknown as [{ to: string; text: string }])[0];
    expect(mail.to).toBe('ala@firma.pl');
    expect(mail.text).toContain(`https://api.verris.pl/public/beta/zgloszenia/potwierdz?token=${data.confirmToken as string}`);
    expect(s.prisma.betaZgloszenie.update).toHaveBeenCalledWith({ where: { id: 'z1' }, data: { mailAt: teraz } });
  });

  it('ten sam adres z aktywnym zgłoszeniem: aktualizacja zamiast drugiego wiersza', async () => {
    const s = stanowisko({ aktywne: { id: 'z0', status: 'NIEPOTWIERDZONE', email: 'ala@firma.pl', confirmToken: 't0' } });
    await s.svc.zglos(dto({ strona: 'https://nowa.pl' }), {}, teraz);
    expect(s.prisma.betaZgloszenie.create).not.toHaveBeenCalled();
    expect(s.prisma.betaZgloszenie.update.mock.calls[0]).toEqual([expect.objectContaining({ where: { id: 'z0' }, data: expect.objectContaining({ strona: 'https://nowa.pl' }) })]);
    expect(s.mailer.send).toHaveBeenCalledTimes(1);
  });

  it('najwyżej jeden mail na adres na dobę — kolejne zgłoszenie zapisane, mail nie wychodzi', async () => {
    const s = stanowisko({ mailDzis: true });
    await s.svc.zglos(dto(), {}, teraz);
    expect(s.prisma.betaZgloszenie.create).toHaveBeenCalled();
    const zapytanie = s.prisma.betaZgloszenie.findFirst.mock.calls.find((c) => (c[0] as { where: { mailAt?: unknown } }).where.mailAt)![0] as {
      where: { mailAt: { gte: Date } };
    };
    expect(zapytanie.where.mailAt.gte).toEqual(new Date(teraz.getTime() - DOBA_MS));
    expect(s.mailer.send).not.toHaveBeenCalled();
  });

  it('potwierdzone zgłoszenie wysłane ponownie: bez nowego maila do nadawcy', async () => {
    const s = stanowisko({ aktywne: { id: 'z0', status: 'NOWE', email: 'ala@firma.pl', confirmToken: null } });
    await s.svc.zglos(dto(), {}, teraz);
    expect(s.mailer.send).not.toHaveBeenCalled();
  });

  it('adres z zaproszeniem (albo tester): bez duplikatu i bez maila, ta sama odpowiedź', async () => {
    const s = stanowisko({ invite: true });
    expect(await s.svc.zglos(dto(), {}, teraz)).toEqual({ status: 'pending' });
    expect(s.prisma.betaZgloszenie.create).not.toHaveBeenCalled();
    expect(s.mailer.send).not.toHaveBeenCalled();
  });
});

describe('BetaZgloszeniaService — potwierdzenie i decyzje', () => {
  it('potwierdzenie: NIEPOTWIERDZONE → NOWE, token zerowany, mail do zespołu; brak/obcy token → nieaktualny', async () => {
    const s = stanowisko({ wiersz: { id: 'z1', status: 'NIEPOTWIERDZONE', email: 'ala@firma.pl', imie: 'Ala', zakres: ['SKLEP'], utm: { source: 'facebook' } } });
    expect(await s.svc.potwierdz('tok', teraz)).toEqual({ ok: true });
    expect(s.prisma.betaZgloszenie.updateMany).toHaveBeenCalledWith({
      where: { id: 'z1', status: 'NIEPOTWIERDZONE' },
      data: { status: 'NOWE', potwierdzoneAt: teraz, confirmToken: null },
    });
    const mail = (s.mailer.send.mock.calls[0] as unknown as [{ to: string; text: string }])[0];
    expect(mail.to).toBe('zespol@verris.pl');
    expect(mail.text).toContain('Sklep');
    expect(await s.svc.potwierdz(undefined)).toEqual({ ok: false });
    const obcy = stanowisko({ wiersz: null });
    expect(await obcy.svc.potwierdz('x')).toEqual({ ok: false });
  });

  it('zaproś: niepotwierdzone → 409 bez kodu; nowe → kod z BetaService i status ZAPROSZONE z powiązaniem', async () => {
    const n = stanowisko({ wiersz: { id: 'z1', status: 'NIEPOTWIERDZONE', email: 'a@b.pl', imie: 'Ala' } });
    await expect(n.svc.zapros('z1', 'admin')).rejects.toBeInstanceOf(ConflictException);
    expect(n.beta.zapros).not.toHaveBeenCalled();

    const s = stanowisko({ wiersz: { id: 'z1', status: 'NOWE', email: 'a@b.pl', imie: 'Ala' } });
    const r = await s.svc.zapros('z1', 'admin');
    expect(s.beta.zapros).toHaveBeenCalledWith({ email: 'a@b.pl', name: 'Ala' }, 'admin');
    expect(r.code).toBe('BETA-AAAAAA');
    expect(s.prisma.betaZgloszenie.update).toHaveBeenCalledWith({
      where: { id: 'z1' },
      data: expect.objectContaining({ status: 'ZAPROSZONE', betaInviteId: 'inv1', decyzjaPrzezId: 'admin' }),
    });

    const juz = stanowisko({ wiersz: { id: 'z1', status: 'ZAPROSZONE', email: 'a@b.pl', imie: 'Ala' } });
    await expect(juz.svc.zapros('z1', 'admin')).rejects.toBeInstanceOf(ConflictException);
  });

  it('odrzuć: z powiadomieniem — uprzejmy mail; bez — cisza; niepotwierdzony adres — bez maila; zaproszone → 409', async () => {
    const potw = { id: 'z1', status: 'NOWE', email: 'a@b.pl', imie: 'Ala', potwierdzoneAt: new Date() };
    const z = stanowisko({ wiersz: potw });
    expect(await z.svc.odrzuc('z1', true, 'admin')).toEqual({ ok: true, mailWyslany: true });
    expect((z.mailer.send.mock.calls[0] as unknown as [{ to: string; tag: string }])[0]).toMatchObject({ to: 'a@b.pl', tag: 'beta.zgloszenie.odmowa' });
    expect(z.prisma.betaZgloszenie.update).toHaveBeenCalledWith({ where: { id: 'z1' }, data: expect.objectContaining({ status: 'ODRZUCONE' }) });

    const bez = stanowisko({ wiersz: potw });
    expect(await bez.svc.odrzuc('z1', false, 'admin')).toEqual({ ok: true, mailWyslany: false });
    expect(bez.mailer.send).not.toHaveBeenCalled();

    const niepotw = stanowisko({ wiersz: { id: 'z1', status: 'NIEPOTWIERDZONE', email: 'a@b.pl', imie: 'Ala', potwierdzoneAt: null } });
    expect(await niepotw.svc.odrzuc('z1', true, 'admin')).toEqual({ ok: true, mailWyslany: false });
    expect(niepotw.mailer.send).not.toHaveBeenCalled();

    const zapr = stanowisko({ wiersz: { ...potw, status: 'ZAPROSZONE' } });
    await expect(zapr.svc.odrzuc('z1', true, 'admin')).rejects.toBeInstanceOf(ConflictException);

    const drugi = stanowisko({ wiersz: { ...potw, status: 'ODRZUCONE' } });
    expect(await drugi.svc.odrzuc('z1', true, 'admin')).toEqual({ ok: true, mailWyslany: false });
    expect(drugi.mailer.send).not.toHaveBeenCalled();
  });

  it('retencja: niepotwierdzone starsze niż 7 dni, nowe i odrzucone starsze niż 90; zaproszone nietknięte', async () => {
    const s = stanowisko();
    expect(await s.svc.usunStare(teraz)).toBe(4);
    const [a, b] = s.prisma.betaZgloszenie.deleteMany.mock.calls.map((c) => (c as unknown as [{ where: Record<string, unknown> }])[0].where);
    expect(a).toEqual({ status: 'NIEPOTWIERDZONE', createdAt: { lt: new Date(teraz.getTime() - 7 * DOBA_MS) } });
    expect(b).toEqual({ status: { in: ['NOWE', 'ODRZUCONE'] }, createdAt: { lt: new Date(teraz.getTime() - 90 * DOBA_MS) } });
  });
});

describe('ZgloszenieBetaDto — walidacja formularza', () => {
  const bledy = async (p: Record<string, unknown>) =>
    (await validate(plainToInstance(ZgloszenieBetaDto, { ...dto({ email: 'ala@firma.pl' }), ...p }), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);

  it('poprawne zgłoszenie przechodzi', async () => {
    expect(await bledy({})).toEqual([]);
  });

  it('odrzuca: brak zgody, nieznany albo powtórzony zakres, pusta lista, adres strony spoza http(s), za długi UTM', async () => {
    expect(await bledy({ zgoda: false })).toContain('zgoda');
    expect(await bledy({ zakres: ['VPS'] })).toContain('zakres');
    expect(await bledy({ zakres: ['POCZTA', 'POCZTA'] })).toContain('zakres');
    expect(await bledy({ zakres: [] })).toContain('zakres');
    expect(await bledy({ strona: 'javascript:alert(1)' })).toContain('strona');
    expect(await bledy({ utm: { source: 'x'.repeat(101) } })).toContain('utm');
    expect(await bledy({ imie: '' })).toContain('imie');
  });
});

describe('maile zgłoszeń do bety', () => {
  const zakazane = /DirectAdmin|CustomBuild|2222|\bDA\b/;
  it('potwierdzenie, powiadomienie zespołu i odmowa: po polsku, bez nazw zaplecza, bez obietnic rabatów', () => {
    const p = potwierdzenieZgloszeniaBetaTemplate({ to: 'a@b.pl', imie: 'Ala', confirmUrl: 'https://api.verris.pl/x', panelUrl: 'https://panel.verris.pl' });
    const n = zgloszenieBetaNotifyTemplate({ to: 'z@verris.pl', imie: 'Ala', email: 'a@b.pl', zakres: ['STRONY_DLA_KLIENTOW'], panelUrl: 'https://panel.verris.pl' });
    const o = odmowaZgloszeniaBetaTemplate({ to: 'a@b.pl', imie: 'Ala', panelUrl: 'https://panel.verris.pl' });
    expect(p.html).toContain('https://api.verris.pl/x');
    // Zgłoszenia zbieramy kilka tygodni przed startem — mail mówi, od kiedy ruszają testy.
    expect(p.text).toContain('Testy ruszają 7 grudnia 2026');
    expect(n.text).toContain('Strony dla klientów');
    for (const m of [p, n, o]) expect(`${m.subject} ${m.text}`).not.toMatch(zakazane);
    expect(o.text).not.toMatch(/rabat|zniżk|promocj/i);
  });
});
