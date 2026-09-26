import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AbuseService, hostZAdresu, kandydaciDomeny } from './abuse.service.js';
import { ZgloszenieNaduzyciaDto } from './abuse.dto.js';

const flush = () => new Promise((r) => setImmediate(r));

function zbuduj(opts: { konto?: object | null; domena?: object | null; raport?: object } = {}) {
  const prisma = {
    account: { findFirst: vi.fn().mockResolvedValue(opts.konto ?? null) },
    domain: { findFirst: vi.fn().mockResolvedValue(opts.domena ?? null) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 'klient@example.pl' }) },
    abuseReport: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'r1', ...data })),
      findUnique: vi.fn().mockResolvedValue(opts.raport ?? null),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'r1', ...data })),
    },
  };
  const mailer = { send: vi.fn().mockResolvedValue({}) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { s: new AbuseService(prisma as never, mailer as never, audit as never), prisma, mailer, audit };
}

const ZGL = {
  category: 'PHISHING' as const, url: 'https://sklep.example.pl/logowanie', description: 'Strona podszywa się pod bank i zbiera hasła.',
  reporterEmail: 'Zglaszajacy@Example.com', goodFaith: true,
};

describe('N-13 — zgłoszenia nadużyć', () => {
  it('host z adresu: bez www, małe litery; śmieci → null', () => {
    expect(hostZAdresu('https://WWW.Sklep.Example.pl/a?b')).toBe('sklep.example.pl');
    expect(hostZAdresu('sklep.example.pl/x')).toBe('sklep.example.pl');
    expect(hostZAdresu('javascript:alert(1)')).toBeNull();
    expect(hostZAdresu('nie adres')).toBeNull();
    expect(kandydaciDomeny('a.sklep.example.pl')).toEqual(['a.sklep.example.pl', 'sklep.example.pl', 'example.pl']);
  });

  it('DTO wymaga oświadczenia o dobrej wierze i opisu (DSA art. 16 ust. 2)', () => {
    const e = validateSync(plainToInstance(ZgloszenieNaduzyciaDto, { ...ZGL, goodFaith: false, description: 'krótko' }));
    expect(e.map((x) => x.property).sort()).toEqual(['description', 'goodFaith']);
    expect(validateSync(plainToInstance(ZgloszenieNaduzyciaDto, ZGL))).toEqual([]);
  });

  it('zgłoszenie: dopasowanie do usługi po domenie, potwierdzenie do zgłaszającego, sygnał do obsługi', async () => {
    const { s, prisma, mailer } = zbuduj({ konto: { subscriptionId: 's1', userId: 'u1', domain: 'example.pl' } });
    await expect(s.zglos(ZGL, { ip: '1.2.3.4' })).resolves.toEqual({ id: 'r1', status: 'received' });
    expect(prisma.account.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { domain: { in: ['sklep.example.pl', 'example.pl'] } } }));
    expect(prisma.abuseReport.create).toHaveBeenCalledWith({ data: expect.objectContaining({ subscriptionId: 's1', userId: 'u1', reporterEmail: 'zglaszajacy@example.com', host: 'sklep.example.pl' }) });
    await flush();
    const do_ = mailer.send.mock.calls.map((c) => c[0].to);
    expect(do_).toContain('zglaszajacy@example.com');
    expect(do_).toHaveLength(2);
  });

  it('pułapka na boty: wypełnione pole website → nic nie zapisujemy, udajemy sukces', async () => {
    const { s, prisma, mailer } = zbuduj();
    await expect(s.zglos({ ...ZGL, website: 'http://spam' }, {})).resolves.toEqual({ id: null, status: 'received' });
    expect(prisma.abuseReport.create).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('adres, który nie jest stroną → 400', async () => {
    const { s } = zbuduj();
    await expect(s.zglos({ ...ZGL, url: 'ftp' }, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('decyzja końcowa bez uzasadnienia → 400; z uzasadnieniem → mail do zgłaszającego', async () => {
    const raport = { id: 'r1', url: ZGL.url, category: 'PHISHING', reporterEmail: 'z@example.com', userId: 'u1', assignedToId: null };
    const { s, mailer, prisma } = zbuduj({ raport });
    await expect(s.decyzja('r1', { status: 'REJECTED', decision: 'nie' }, 'staff1')).rejects.toBeInstanceOf(BadRequestException);
    await s.decyzja('r1', { status: 'REJECTED', decision: 'Strona jest oryginalną stroną banku, domena należy do banku.' }, 'staff1');
    await flush();
    expect(mailer.send.mock.calls.map((c) => c[0].to)).toEqual(['z@example.com']);
    expect(prisma.abuseReport.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED', decidedById: 'staff1' }) }));
  });

  it('ACTION_TAKEN z powiadomieniem klienta → uzasadnienie do klienta (DSA art. 17) i do zgłaszającego', async () => {
    const raport = { id: 'r1', url: ZGL.url, category: 'PHISHING', reporterEmail: 'z@example.com', userId: 'u1', assignedToId: null };
    const { s, mailer, prisma } = zbuduj({ raport });
    await s.decyzja('r1', { status: 'ACTION_TAKEN', decision: 'Podstrona phishingowa zablokowana, konto zabezpieczone.', notifyCustomer: true }, 'staff1');
    await flush();
    expect(mailer.send.mock.calls.map((c) => c[0].to).sort()).toEqual(['klient@example.pl', 'z@example.com']);
    expect(prisma.abuseReport.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ customerNotifiedAt: expect.any(Date) }) }));
  });

  it('IN_REVIEW nie wysyła nic i nie wymaga uzasadnienia', async () => {
    const raport = { id: 'r1', url: ZGL.url, category: 'SPAM', reporterEmail: 'z@example.com', userId: null, assignedToId: null };
    const { s, mailer } = zbuduj({ raport });
    await s.decyzja('r1', { status: 'IN_REVIEW' }, 'staff1');
    await flush();
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
