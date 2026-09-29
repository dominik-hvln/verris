import type { DaMessage } from '@verris/directadmin-sdk';
import { WiadomosciWezlaScheduler, domenaWTekscie, klasyfikujWiadomosc } from './wiadomosci-wezla.scheduler.js';

/**
 * Wiadomości systemowe węzła → mail Verris + panel (decyzja 29.09.2026). Pilnujemy, że klient dostaje
 * tylko nasze komunikaty dla ważnych zdarzeń, pierwszy przebieg niczego nie wysyła, dedup trzyma dobę,
 * a martwy węzeł nie zasypuje logów.
 */
const LE_BLAD = 'Błąd przy żądaniu LetsEncrypt';
const LE_OK = 'Żądanie LetsEncrypt zakończone sukcesem';
const KLUCZ = "Twój klucz logowania 'cli' został utworzony";

describe('klasyfikujWiadomosc', () => {
  it.each([
    [LE_BLAD, 'ssl-blad'],
    [LE_OK, 'ssl-ok'],
    ['Twoje kopie zapasowe są gotowe', 'nic'],
    ['Błąd podczas tworzenia kopii zapasowej', 'kopia-blad'],
    ['Backup failed', 'kopia-blad'],
    ["Twój Hash URL Login 'x' został utworzony", 'nic'],
    [KLUCZ, 'nic'],
    ["Twój klucz logowania 'backup-błąd' został utworzony", 'nic'],
    ['Użytkownik klient1 przekroczył limit miejsca na dysku', 'limit-dysku'],
    ['Użytkownik klient1 zbliża się do limitu transferu', 'limit-transferu'],
    ['Bandwidth limit exceeded', 'limit-transferu'],
    ['Disk quota exceeded', 'limit-dysku'],
    ['Coś zupełnie innego', 'nic'],
  ])('%s → %s', (temat, rodzaj) => {
    expect(klasyfikujWiadomosc(temat)).toBe(rodzaj);
  });
});

describe('domenaWTekscie', () => {
  it('tylko domeny konta, dłuższa przed krótszą, poddomena → nadrzędna, bez dopasowań w środku innej nazwy', () => {
    expect(domenaWTekscie('Certyfikat dla sklep.firma.pl nie powstał', ['firma.pl', 'sklep.firma.pl'])).toBe('sklep.firma.pl');
    expect(domenaWTekscie('dla www.firma.pl', ['firma.pl'])).toBe('firma.pl');
    expect(domenaWTekscie('dla mojafirma.pl', ['firma.pl'])).toBeNull();
    expect(domenaWTekscie('Domena: firma.pl.', ['firma.pl'])).toBe('firma.pl');
    expect(domenaWTekscie('nic tu nie ma', ['firma.pl'])).toBeNull();
  });
});

type Wpis = { action: string; details: Record<string, unknown>; createdAt: Date };

function zbuduj(opts: { konta?: Array<{ id: string; serverId?: string; seen?: number | null }> } = {}) {
  const konta = (opts.konta ?? [{ id: 'a1', seen: 3 }]).map((k) => ({
    id: k.id,
    userId: `u-${k.id}`,
    domain: 'firma.pl',
    serverId: k.serverId ?? 'n1',
    subscriptionId: `s-${k.id}`,
    daMessageSeen: k.seen === undefined ? 3 : k.seen,
    user: { email: `${k.id}@firma.pl`, firstName: 'Jan' },
  }));
  const wpisy: Wpis[] = [];
  const prisma = {
    account: {
      findMany: vi.fn(async (a: { take: number; cursor?: { id: string } }) => {
        const od = a.cursor ? konta.findIndex((k) => k.id === a.cursor?.id) + 1 : 0;
        return konta.slice(od, od + a.take).map((k) => ({ ...k }));
      }),
      update: vi.fn(async (a: { where: { id: string }; data: { daMessageSeen: number } }) => {
        const k = konta.find((x) => x.id === a.where.id);
        if (k) k.daMessageSeen = a.data.daMessageSeen;
        return k;
      }),
    },
    auditLog: {
      findFirst: vi.fn(async (a: { where: { action: string; createdAt: { gte: Date }; details: { equals: string } } }) =>
        wpisy.find((w) => w.action === a.where.action && w.createdAt >= a.where.createdAt.gte && w.details.klucz === a.where.details.equals) ?? null,
      ),
    },
  };
  const audit = {
    record: vi.fn(async (p: { action: string; userId?: string | null; details: Record<string, unknown> }) => {
      wpisy.push({ action: p.action, details: p.details, createdAt: new Date() });
    }),
  };
  // Stan węzła: wiadomości per konto, treści, domeny, awarie.
  const wiadomosci: Record<string, DaMessage[]> = {};
  const tresci: Record<string, string> = {};
  const awarie: Record<string, Error> = {};
  const klient = (id: string) => ({
    listMessages: vi.fn(async () => {
      if (awarie[id]) throw awarie[id];
      return wiadomosci[id] ?? [];
    }),
    getMessage: vi.fn(async (n: string) => ({ id: n, subject: '', body: tresci[n] ?? '', from: 'diradmin', time: null })),
    getDomains: vi.fn(async () => ['firma.pl', 'sklep.pl']),
  });
  const klienci: Record<string, ReturnType<typeof klient>> = {};
  const da = {
    getClientForHostingAccount: vi.fn(async (id: string) => (klienci[id] ??= klient(id))),
  };
  const mailer = { send: vi.fn(async () => ({ delivered: true })) };
  const notifications = { create: vi.fn(async () => undefined) };
  const config = { get: () => 'https://panel.test' };
  const s = new WiadomosciWezlaScheduler(prisma as never, da as never, mailer as never, notifications as never, audit as never, config as never);
  const dodaj = (konto: string, numer: number, subject: string, tresc = '') => {
    const id = String(numer).padStart(9, '0');
    (wiadomosci[konto] ??= []).unshift({ id, number: numer, subject, isNew: true });
    tresci[id] = tresc;
  };
  return { s, konta, wpisy, prisma, da, mailer, notifications, audit, dodaj, awarie, klienci };
}

describe('WiadomosciWezlaScheduler', () => {
  afterEach(() => vi.useRealTimers());

  it('pierwszy przebieg dla konta: zapamiętuje najnowszy numer, zaległych nie wysyła', async () => {
    const t = zbuduj({ konta: [{ id: 'a1', seen: null }] });
    t.dodaj('a1', 5, LE_BLAD);
    t.dodaj('a1', 6, LE_BLAD);
    await t.s.run();
    expect(t.konta[0].daMessageSeen).toBe(6);
    expect(t.mailer.send).not.toHaveBeenCalled();
    expect(t.notifications.create).not.toHaveBeenCalled();
  });

  it('pusta skrzynka przy pierwszym przebiegu → 0, kolejna wiadomość już idzie do klienta', async () => {
    const t = zbuduj({ konta: [{ id: 'a1', seen: null }] });
    await t.s.run();
    expect(t.konta[0].daMessageSeen).toBe(0);
    t.dodaj('a1', 1, LE_BLAD);
    await t.s.run();
    expect(t.mailer.send).toHaveBeenCalledTimes(1);
  });

  it('nowy błąd LE → mail + panel raz; treść nasza, bez nazwy silnika, portu i surowego tekstu węzła', async () => {
    const t = zbuduj();
    t.dodaj('a1', 3, LE_BLAD); // już widziana
    t.dodaj('a1', 4, LE_BLAD, "Musi być wybrana co najmniej jedna pozycja Let's Encrypt. sklep.pl");
    await t.s.run();
    await t.s.run();
    expect(t.notifications.create).toHaveBeenCalledTimes(1);
    expect(t.mailer.send).toHaveBeenCalledTimes(1);
    expect(t.konta[0].daMessageSeen).toBe(4);

    const powiadomienie = (t.notifications.create.mock.calls[0] as unknown[])[0] as Record<string, string>;
    expect(powiadomienie).toMatchObject({
      userId: 'u-a1',
      category: 'SSL',
      severity: 'warning',
      title: 'Nie udało się wystawić certyfikatu SSL dla sklep.pl',
      link: '/dashboard/services/s-a1?tab=ssl',
      subscriptionId: 's-a1',
    });
    expect(powiadomienie.body).toMatch(/Domeny i DNS/);
    expect(powiadomienie.body).toMatch(/Certyfikaty SSL/);

    const mail = (t.mailer.send.mock.calls[0] as unknown[])[0] as Record<string, string>;
    expect(mail).toMatchObject({ to: 'a1@firma.pl', category: 'TRANSACTIONAL', tag: 'hosting.komunikat.ssl-blad', userId: 'u-a1' });
    expect(mail.subject).toBe('[Verris] Nie udało się wystawić certyfikatu SSL dla sklep.pl');
    expect(mail.text).toContain('https://panel.test/dashboard/services/s-a1?tab=ssl');
    for (const tekst of [mail.subject, mail.text, mail.html, powiadomienie.title, powiadomienie.body]) {
      expect(tekst).not.toMatch(/DirectAdmin|diradmin|:2222|Musi być wybrana|Message System/);
    }
    // Operator widzi wszystko w audycie — bez userId (dziennik i eksport klienta tego nie pokazują).
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'NODE_SYSTEM_MESSAGE', details: expect.objectContaining({ numer: '000000004', temat: LE_BLAD }) }));
    expect(t.audit.record.mock.calls.every((c) => !('userId' in (c[0] as object)))).toBe(true);
  });

  it('dedup: ten sam błąd dla tej samej domeny drugi raz w ciągu doby → tylko audyt; po dobie znów wysyłka', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T10:00:00Z'));
    const t = zbuduj();
    t.dodaj('a1', 4, LE_BLAD);
    await t.s.run();
    vi.setSystemTime(new Date('2026-09-29T20:00:00Z'));
    t.dodaj('a1', 5, LE_BLAD);
    await t.s.run();
    expect(t.mailer.send).toHaveBeenCalledTimes(1);
    expect(t.notifications.create).toHaveBeenCalledTimes(1);
    expect(t.wpisy.at(-1)?.details).toMatchObject({ pominieto: 'dedup-24h', domena: 'firma.pl' });

    // Inna domena konta w tej samej dobie — to osobne zdarzenie.
    t.dodaj('a1', 6, LE_BLAD, 'sklep.pl');
    await t.s.run();
    expect(t.mailer.send).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date('2026-09-30T10:30:00Z'));
    t.dodaj('a1', 7, LE_BLAD);
    await t.s.run();
    expect(t.mailer.send).toHaveBeenCalledTimes(3);
  });

  it('sukces LE → tylko panel, bez maila', async () => {
    const t = zbuduj();
    t.dodaj('a1', 4, LE_OK);
    await t.s.run();
    expect(t.mailer.send).not.toHaveBeenCalled();
    expect(t.notifications.create).toHaveBeenCalledWith(expect.objectContaining({ category: 'SSL', severity: 'info', title: 'Certyfikat SSL dla firma.pl został wystawiony' }));
  });

  it('klucz logowania, Hash URL, kopie gotowe → nic dla klienta, tylko audyt operatora', async () => {
    const t = zbuduj();
    t.dodaj('a1', 4, KLUCZ);
    t.dodaj('a1', 5, "Twój Hash URL Login 'x' został utworzony");
    t.dodaj('a1', 6, 'Twoje kopie zapasowe są gotowe');
    await t.s.run();
    expect(t.mailer.send).not.toHaveBeenCalled();
    expect(t.notifications.create).not.toHaveBeenCalled();
    expect(t.klienci.a1.getMessage).not.toHaveBeenCalled();
    expect(t.wpisy.map((w) => w.details.rodzaj)).toEqual(['nic', 'nic', 'nic']);
    expect(t.konta[0].daMessageSeen).toBe(6);
  });

  it('limit dysku i błąd kopii → mail + panel z właściwą zakładką', async () => {
    const t = zbuduj();
    t.dodaj('a1', 4, 'Użytkownik klient1 przekroczył limit miejsca na dysku');
    t.dodaj('a1', 5, 'Błąd podczas tworzenia kopii zapasowej');
    await t.s.run();
    const tagi = t.mailer.send.mock.calls.map((c) => ((c as unknown[])[0] as { tag: string }).tag);
    expect(tagi).toEqual(['hosting.komunikat.limit-dysku', 'hosting.komunikat.kopia-blad']);
    const linki = t.notifications.create.mock.calls.map((c) => ((c as unknown[])[0] as { link: string }).link);
    expect(linki).toEqual(['/dashboard/services/s-a1?tab=usage', '/dashboard/services/s-a1?tab=backups']);
  });

  it('numeracja od nowa (konto na innym węźle) → tylko zapamiętaj, bez wysyłki', async () => {
    const t = zbuduj({ konta: [{ id: 'a1', seen: 40 }] });
    t.dodaj('a1', 2, LE_BLAD);
    await t.s.run();
    expect(t.konta[0].daMessageSeen).toBe(2);
    expect(t.mailer.send).not.toHaveBeenCalled();
  });

  it('martwy węzeł: reszta jego kont pominięta, inne węzły obsłużone, jedna linia w logu', async () => {
    const t = zbuduj({ konta: [{ id: 'a1', serverId: 'n1' }, { id: 'a2', serverId: 'n1' }, { id: 'a3', serverId: 'n2' }] });
    t.awarie.a1 = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    t.dodaj('a3', 4, LE_BLAD);
    const warn = vi.spyOn((t.s as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn').mockImplementation(() => undefined);
    await t.s.run();
    expect(t.da.getClientForHostingAccount.mock.calls.map((c) => c[0])).toEqual(['a1', 'a3']);
    expect(t.mailer.send).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/niedostępne węzły: n1/);
  });

  it('błąd jednego konta (nie sieć) nie wyłącza węzła ani reszty kont', async () => {
    const t = zbuduj({ konta: [{ id: 'a1' }, { id: 'a2' }] });
    t.awarie.a1 = new Error('Brak dostępu');
    t.dodaj('a2', 4, LE_BLAD);
    vi.spyOn((t.s as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn').mockImplementation(() => undefined);
    await t.s.run();
    expect(t.mailer.send).toHaveBeenCalledTimes(1);
    expect(t.konta[0].daMessageSeen).toBe(3);
  });
});
