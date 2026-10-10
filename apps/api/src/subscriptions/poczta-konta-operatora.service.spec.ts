import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service.js';
import { OutboundAbuseGuard } from '../deliverability/outbound-abuse.guard.js';
import { AkcjeKontaOperatoraService } from './akcje-konta-operatora.service.js';
import { KORDON_Z_BLOKADY, PocztaKontaOperatoraService } from './poczta-konta-operatora.service.js';
import { ZawieszenieOperatoraService } from './zawieszenie-operatora.service.js';

/**
 * F3.1 (D4) — blokada wysyłki konta: realna blokada na węźle (directadmin.service.ts ustawBlokadeWysylki), stan w bazie
 * (kto, kiedy, powód), kordon marketingu w OutboundAbuseGuard (prawdziwy, w pamięci) i reguły D2/D3 paska akcji
 * (prawdziwy AkcjeKontaOperatoraService i AuditService): powód, zgłoszenie, dziennik zespołu, wpis „obsługa Verris”.
 */
const WLASCICIEL = 'u-wlasciciel';
const OPERATOR = 's-operator';
type Wiersz = { action: string; userId: string | null; actorUserId: string | null; details: Record<string, unknown> };
type Konto = { id: string; userId: string; mailBlockedAt: Date | null; mailBlockedById: string | null; mailBlockedReason: string | null };

function zbuduj(o: { rola?: string; bladWezla?: Error; konta?: Konto[] } = {}) {
  const wiersze: Wiersz[] = [];
  const konta: Konto[] = o.konta ?? [{ id: 'acc1', userId: WLASCICIEL, mailBlockedAt: null, mailBlockedById: null, mailBlockedReason: null }];
  const k1 = konta[0]!;
  const prisma = {
    subscription: {
      findUnique: vi.fn(async () => ({
        userId: WLASCICIEL,
        user: { email: 'anna@klient.pl', firstName: 'Anna', role: o.rola ?? 'USER' },
        account: { id: 'acc1', domain: 'klient.pl', daUsername: 'klient1', serverId: 'w1' },
      })),
    },
    ticket: { findMany: vi.fn(async () => []) },
    auditLog: { create: vi.fn(async ({ data }: { data: Wiersz }) => (wiersze.push(data), data)) },
    account: {
      findUnique: vi.fn(async () => ({ daUsername: 'klient1', serverId: 'w1', ...k1 })),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; mailBlockedAt: null }; data: Partial<Konto> }) => {
        const k = konta.find((x) => x.id === where.id && x.mailBlockedAt === null);
        if (!k) return { count: 0 };
        Object.assign(k, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Konto> }) => Object.assign(konta.find((x) => x.id === where.id)!, data)),
      count: vi.fn(async ({ where }: { where: { userId: string; id: { not: string } } }) =>
        konta.filter((x) => x.userId === where.userId && x.id !== where.id.not && x.mailBlockedAt !== null).length,
      ),
    },
    user: { findUnique: vi.fn(async () => ({ email: 'l3@verris.pl' })) },
  };
  const audit = new AuditService(prisma as never);
  const naWezle = new Set<string>();
  const directAdmin = {
    ustawBlokadeWysylki: vi.fn(async (_s: string, u: string, on: boolean) => {
      if (o.bladWezla) throw o.bladWezla;
      const zmieniono = naWezle.has(u) !== on;
      if (on) naWezle.add(u);
      else naWezle.delete(u);
      return { zmieniono };
    }),
    blokadaWysylkiNaWezle: vi.fn(async (_s: string, u: string) => {
      if (o.bladWezla) throw o.bladWezla;
      return { obslugiwana: true, zablokowana: naWezle.has(u) };
    }),
  };
  const mailer = { send: vi.fn(async () => ({ delivered: true })) };
  const kordon = new OutboundAbuseGuard({} as never, { record: vi.fn(async () => undefined) } as never, mailer as never);
  const akcje = new AkcjeKontaOperatoraService(
    prisma as never,
    directAdmin as never,
    null as never,
    null as never,
    audit,
    null as never,
    { get: () => 'https://panel.test' } as never,
    new ZawieszenieOperatoraService(prisma as never, null as never),
  );
  const svc = new PocztaKontaOperatoraService(prisma as never, directAdmin as never, akcje, kordon, audit);
  return { svc, prisma, directAdmin, kordon, mailer, wiersze, konta, naWezle };
}

const z = (powod = 'Spam z formularza kontaktowego, zgłoszenie z RBL', operatorRole = 'STAFF') => ({
  subscriptionId: 's1',
  operatorUserId: OPERATOR,
  operatorRole,
  powod,
});

describe('F3.1 PocztaKontaOperatoraService — blokada wysyłki', () => {
  const env = process.env.SECURITY_ALERT_EMAIL;
  beforeEach(() => {
    process.env.SECURITY_ALERT_EMAIL = 'security@verris.test';
  });
  afterEach(() => {
    process.env.SECURITY_ALERT_EMAIL = env;
  });

  it('blokuje na węźle (konto DA właściciela), zapisuje kto/kiedy/powód, nakłada kordon marketingu bez alertu „auto-cordon”', async () => {
    const { svc, directAdmin, kordon, mailer, konta, wiersze } = zbuduj();
    const r = await svc.zablokuj(z());
    expect(directAdmin.ustawBlokadeWysylki).toHaveBeenCalledWith('w1', 'klient1', true);
    expect(r).toMatchObject({ ok: true, zablokowana: true, juzByla: false, zmienionoNaWezle: true });
    expect(konta[0]).toMatchObject({ mailBlockedById: OPERATOR, mailBlockedReason: 'Spam z formularza kontaktowego, zgłoszenie z RBL' });
    expect(konta[0]!.mailBlockedAt).toBeInstanceOf(Date);
    expect(await kordon.isCordoned(WLASCICIEL)).toBe(true);
    expect(await kordon.powodKordonu(WLASCICIEL)).toMatch(new RegExp(`^${KORDON_Z_BLOKADY}: Spam`));
    expect(mailer.send).not.toHaveBeenCalled();
    // D3 — klient widzi wpis z autorem = operator („obsługa Verris”); zespół — powód i wynik.
    expect(wiersze.find((w) => w.action === 'HOSTING_MAIL_SENDING_BLOCKED')).toMatchObject({ userId: WLASCICIEL, actorUserId: OPERATOR });
    expect(wiersze.find((w) => w.action === 'OPERATOR_ACCOUNT_CHANGED')?.details).toMatchObject({
      akcja: 'blokada-wysylki',
      powod: 'Spam z formularza kontaktowego, zgłoszenie z RBL',
      wynik: 'ok',
    });
  });

  it('idempotentna: drugie „Zablokuj” nie nadpisuje pierwotnego kto/kiedy/powód i niczego nie zmienia na węźle', async () => {
    const { svc, konta } = zbuduj();
    await svc.zablokuj(z());
    const pierwszy = { ...konta[0]! };
    const r = await svc.zablokuj({ ...z('Drugie kliknięcie innego operatora'), operatorUserId: 's-inny' });
    expect(r).toMatchObject({ juzByla: true, zmienionoNaWezle: false });
    expect(konta[0]).toEqual(pierwszy);
  });

  it('błąd węzła = błąd: brak stanu w bazie i kordonu, w dzienniku zespołu wynik „blad” z treścią', async () => {
    const { svc, kordon, konta, wiersze } = zbuduj({ bladWezla: new Error('Węzeł nie potwierdził blokady wysyłki') });
    await expect(svc.zablokuj(z())).rejects.toThrow(/nie potwierdził/);
    expect(konta[0]!.mailBlockedAt).toBeNull();
    expect(await kordon.isCordoned(WLASCICIEL)).toBe(false);
    expect(wiersze.find((w) => w.action === 'OPERATOR_ACCOUNT_CHANGED')?.details).toMatchObject({ wynik: 'blad', blad: 'Węzeł nie potwierdził blokady wysyłki' });
    expect(wiersze.some((w) => w.action === 'HOSTING_MAIL_SENDING_BLOCKED')).toBe(false);
  });

  it('powód krótszy niż 10 znaków → 400 przed węzłem; STAFF na usłudze konta zespołu → 403', async () => {
    const a = zbuduj();
    await expect(a.svc.zablokuj(z('spam'))).rejects.toBeInstanceOf(BadRequestException);
    expect(a.directAdmin.ustawBlokadeWysylki).not.toHaveBeenCalled();
    const b = zbuduj({ rola: 'STAFF' });
    await expect(b.svc.zablokuj(z())).rejects.toBeInstanceOf(ForbiddenException);
    expect(b.directAdmin.ustawBlokadeWysylki).not.toHaveBeenCalled();
  });

  it('zwolnienie: zdejmuje blokadę na węźle i w bazie oraz kordon z blokady; wpis klienta „przywrócono”', async () => {
    const { svc, directAdmin, kordon, konta, naWezle, wiersze } = zbuduj();
    await svc.zablokuj(z());
    const r = await svc.zwolnij(z('Klient usunął formularz, skan czysty'));
    expect(directAdmin.ustawBlokadeWysylki).toHaveBeenLastCalledWith('w1', 'klient1', false);
    expect(naWezle.has('klient1')).toBe(false);
    expect(konta[0]).toMatchObject({ mailBlockedAt: null, mailBlockedById: null, mailBlockedReason: null });
    expect(r).toMatchObject({ zablokowana: false, kordonZdjety: true });
    expect(await kordon.isCordoned(WLASCICIEL)).toBe(false);
    expect(wiersze.find((w) => w.action === 'HOSTING_MAIL_SENDING_UNBLOCKED')).toMatchObject({ actorUserId: OPERATOR });
  });

  it('zwolnienie zostawia kordon automatyczny (skok wysyłki) i kordon, gdy inne konto klienta jest dalej zablokowane', async () => {
    const auto = zbuduj();
    await auto.kordon.cordon(WLASCICIEL, 'skok wysyłki: 500/min > 200');
    expect((await auto.svc.zwolnij(z())).kordonZdjety).toBe(false);
    expect(await auto.kordon.isCordoned(WLASCICIEL)).toBe(true);

    const dwa = zbuduj({
      konta: [
        { id: 'acc1', userId: WLASCICIEL, mailBlockedAt: null, mailBlockedById: null, mailBlockedReason: null },
        { id: 'acc2', userId: WLASCICIEL, mailBlockedAt: new Date(), mailBlockedById: OPERATOR, mailBlockedReason: 'drugie konto' },
      ],
    });
    await dwa.svc.zablokuj(z());
    expect((await dwa.svc.zwolnij(z())).kordonZdjety).toBe(false);
    expect(await dwa.kordon.isCordoned(WLASCICIEL)).toBe(true);
  });

  it('przegląd: blokada na koncie już w kordonie automatycznym nie podmienia jego powodu — zwolnienie blokady go nie zdejmuje', async () => {
    const { svc, kordon } = zbuduj();
    await kordon.cordon(WLASCICIEL, 'skok wysyłki: 500/min > 200');
    await svc.zablokuj(z());
    expect(await kordon.powodKordonu(WLASCICIEL)).toBe('skok wysyłki: 500/min > 200');
    expect((await svc.zwolnij(z('Klient usunął formularz, skan czysty'))).kordonZdjety).toBe(false);
    expect(await kordon.isCordoned(WLASCICIEL)).toBe(true);
  });

  it('stan: baza (kto, kiedy, powód) i węzeł; błąd odczytu z węzła nie ukrywa stanu z bazy', async () => {
    const ok = zbuduj();
    await ok.svc.zablokuj(z());
    expect(await ok.svc.stan('s1')).toMatchObject({ zablokowana: true, przez: 'l3@verris.pl', powod: 'Spam z formularza kontaktowego, zgłoszenie z RBL', naWezle: true, obslugiwana: true, bladWezla: null });
    const blad = zbuduj({
      bladWezla: new Error('timeout'),
      konta: [{ id: 'acc1', userId: WLASCICIEL, mailBlockedAt: new Date('2026-10-10T10:00:00Z'), mailBlockedById: OPERATOR, mailBlockedReason: 'spam z konta' }],
    });
    expect(await blad.svc.stan('s1')).toMatchObject({ zablokowana: true, od: '2026-10-10T10:00:00.000Z', naWezle: null, bladWezla: 'timeout' });
  });
});
