import { AuditService } from '../common/audit/audit.service.js';
import { BlokadyIpWezlaService } from '../servers/blokady-ip-wezla.admin.controller.js';
import { AkcjeKontaOperatoraService } from './akcje-konta-operatora.service.js';
import { BlokadyIpKontaService } from './blokady-ip-konta.service.js';
import { ZawieszenieOperatoraService } from './zawieszenie-operatora.service.js';

/**
 * F3.2 (D5) — „Zablokowało mi IP” na karcie usługi: L2 (IP_UNBLOCK) odblokowuje tylko adres klienta (logowania albo
 * zgłoszenie) i tylko z numerem jego zgłoszenia; NOC (IP_BLOCKS_NODE) i ADMIN — dowolny adres. Prawdziwy przebieg D2/D3
 * (AkcjeKontaOperatoraService, AuditService): powód, dziennik zespołu także przy odmowie, wpis klienta „obsługa Verris”.
 */
const KLIENT = 'u-klient';
const TICKET = 'ab12cd34-0000-4000-8000-000000000001';
const INNY_TICKET = 'ef56ab78-0000-4000-8000-000000000002';
type Wiersz = { action: string; userId: string | null; actorUserId: string | null; details: Record<string, unknown> };

type Odp = { message: string; createdAt: Date; isStaff: boolean; internal: boolean; automatic: string | null; zrodlo: string | null };
type Zgl = { id: string; userId: string; message: string; createdAt: Date; zrodlo: string | null; openedByStaffId: string | null; replies: Odp[] };
const odp = (message: string, o: Partial<Odp> = {}): Odp => ({ message, createdAt: new Date(), isStaff: false, internal: false, automatic: null, zrodlo: 'PANEL', ...o });

function zbuduj(o: { uprawnienia?: string[]; wlascicielRola?: string; zgloszenia?: Zgl[] } = {}) {
  const wiersze: Wiersz[] = [];
  const zadania: Array<Record<string, unknown>> = [];
  const zgloszenia: Zgl[] = o.zgloszenia ?? [
    { id: TICKET, userId: KLIENT, message: 'Nie mogę odebrać poczty, mój adres w biurze to 83.12.44.201', createdAt: new Date(), zrodlo: 'PANEL', openedByStaffId: null, replies: [] },
    { id: INNY_TICKET, userId: KLIENT, message: 'Pytanie o fakturę', createdAt: new Date(), zrodlo: 'PANEL', openedByStaffId: null, replies: [odp('a z domu 91.200.1.2')] },
  ];
  const prisma = {
    subscription: {
      findUnique: vi.fn(async () => ({
        userId: KLIENT,
        user: { email: 'anna@klient.pl', firstName: 'Anna', role: o.wlascicielRola ?? 'USER' },
        account: { id: 'acc1', domain: 'klient.pl', daUsername: 'klient1', serverId: 'w1', status: 'ACTIVE' },
      })),
    },
    loginEvent: { findMany: vi.fn(async () => [{ ipAddress: '::ffff:46.205.1.10', createdAt: new Date() }]) },
    userSession: { findMany: vi.fn(async () => [{ ipAddress: '46.205.1.10', lastSeenAt: new Date() }]) },
    ticket: {
      findMany: vi.fn(async ({ where, select }: { where: { userId: string; id?: string | { startsWith: string } }; select?: { replies?: { where?: Record<string, unknown> } } }) =>
        zgloszenia
          .filter((t) => {
            if (t.userId !== where.userId) return false;
            if (typeof where.id === 'string') return t.id === where.id;
            if (where.id && 'startsWith' in where.id) return t.id.startsWith(where.id.startsWith);
            return true;
          })
          // Filtr odpowiedzi jak w Prismie (równość pól z where).
          .map((t) => ({ ...t, replies: t.replies.filter((r) => Object.entries(select?.replies?.where ?? {}).every(([k, v]) => r[k as keyof Odp] === v)) })),
      ),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: Wiersz }) => (wiersze.push(data), data)) },
    user: {
      findUnique: vi.fn(async () => ({ email: 'op@verris.pl', staffRole: { id: 'r', name: 'r', permissions: o.uprawnienia ?? ['IP_UNBLOCK'] }, staffRoleAssignments: [] })),
      findMany: vi.fn(async () => []),
    },
    server: { findUnique: vi.fn(async () => ({ id: 'w1', status: 'ACTIVE' })) },
    nodeTask: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => (zadania.push(a.data), { id: `t${zadania.length}`, ...a.data })),
    },
  };
  const audit = new AuditService(prisma as never);
  const akcje = new AkcjeKontaOperatoraService(
    prisma as never, null as never, null as never, null as never, audit, null as never,
    { get: () => 'https://panel.test' } as never, new ZawieszenieOperatoraService(prisma as never, null as never),
  );
  const svc = new BlokadyIpKontaService(prisma as never, audit, akcje, new BlokadyIpWezlaService(prisma as never, audit));
  return { svc, wiersze, zadania, prisma };
}

const POWOD = 'Klient zgłasza brak dostępu do poczty po zmianie hasła';
const z = (o: { zgloszenie?: string; rola?: string } = {}) => ({
  subscriptionId: 's1', operatorUserId: 'op', operatorRole: o.rola ?? 'STAFF', powod: POWOD, zgloszenie: o.zgloszenie,
});

describe('F3.2 BlokadyIpKontaService — „Zablokowało mi IP”', () => {
  it('adresy klienta: logowania (bez prefiksu ::ffff:, bez powtórzeń) i adresy z jego zgłoszeń; odczyt w dzienniku', async () => {
    const { svc, wiersze } = zbuduj();
    const s = await svc.stan('s1', 'op', 'STAFF');
    expect(s.adresy.map((a) => [a.ip, a.zrodla])).toEqual(
      expect.arrayContaining([
        ['46.205.1.10', ['logowanie']],
        ['83.12.44.201', ['zgloszenie']],
        ['91.200.1.2', ['zgloszenie']],
      ]),
    );
    expect(s.adresy.find((a) => a.ip === '83.12.44.201')?.zgloszenia).toEqual([TICKET]);
    expect(wiersze.find((w) => w.action === 'OPERATOR_ACCOUNT_VIEWED')?.details).toMatchObject({ sekcja: 'blokady-ip' });
  });

  it('odpytywanie w trakcie sprawdzania nie dopisuje wpisów odczytu (tylko wydanie wyniku)', async () => {
    const { svc, wiersze, prisma } = zbuduj();
    prisma.nodeTask.findMany.mockResolvedValueOnce([{ status: 'RUNNING', payload: { mode: 'list', ip: '83.12.44.201' }, outputLog: null, errorMessage: null, createdAt: new Date(), completedAt: null }] as never);
    expect((await svc.stan('s1', 'op', 'STAFF')).wToku).toBe(true);
    expect(wiersze.filter((w) => w.action === 'OPERATOR_ACCOUNT_VIEWED')).toEqual([]);
    await svc.stan('s1', 'op', 'STAFF');
    expect(wiersze.filter((w) => w.action === 'OPERATOR_ACCOUNT_VIEWED')).toHaveLength(1);
  });

  it('L2: adres ze zgłoszenia + numer tego zgłoszenia → zadanie unban na węźle konta, wpis klienta i dziennik zespołu', async () => {
    const { svc, wiersze, zadania } = zbuduj();
    const r = await svc.odblokuj(z({ zgloszenie: '#ab12cd34' }), '83.12.44.201');
    expect(r).toMatchObject({ ok: true });
    expect(zadania).toEqual([expect.objectContaining({ serverId: 'w1', accountId: 'acc1', kind: 'IP_BLOCKS', payload: { mode: 'unban', ip: '83.12.44.201' } })]);
    expect(wiersze.find((w) => w.action === 'HOSTING_IP_UNBLOCK_QUEUED')).toMatchObject({ userId: KLIENT, actorUserId: 'op', details: expect.objectContaining({ target: '83.12.44.201' }) });
    expect(wiersze.find((w) => w.action === 'OPERATOR_ACCOUNT_CHANGED')?.details).toMatchObject({ akcja: 'odblokowanie-ip', ip: '83.12.44.201', powod: POWOD, zgloszenieId: TICKET, wynik: 'ok' });
  });

  it('L2: adres z logowań klienta też wolno (ze zgłoszeniem klienta)', async () => {
    const { svc, zadania } = zbuduj();
    await svc.odblokuj(z({ zgloszenie: '#ab12cd34' }), '46.205.1.10');
    expect(zadania).toHaveLength(1);
  });

  it('L2 bez zgłoszenia, z adresem spoza klienta albo z adresem z INNEGO zgłoszenia → odmowa, bez zadania; odmowa w dzienniku', async () => {
    const bez = zbuduj();
    await expect(bez.svc.odblokuj(z(), '83.12.44.201')).rejects.toMatchObject({ status: 400 });
    expect(bez.zadania).toEqual([]);
    expect(bez.wiersze.find((w) => w.action === 'OPERATOR_ACCOUNT_CHANGED')?.details).toMatchObject({ wynik: 'blad' });
    const obcy = zbuduj();
    await expect(obcy.svc.odblokuj(z({ zgloszenie: '#ab12cd34' }), '203.0.113.99')).rejects.toMatchObject({ status: 403 });
    expect(obcy.zadania).toEqual([]);
    const inne = zbuduj();
    await expect(inne.svc.odblokuj(z({ zgloszenie: '#ab12cd34' }), '91.200.1.2')).rejects.toMatchObject({ status: 403 });
    expect(inne.zadania).toEqual([]);
    expect(inne.wiersze.some((w) => w.action === 'HOSTING_IP_UNBLOCK_QUEUED')).toBe(false);
  });

  it('audyt Fali 3: adres wpisany przez obsługę (zgłoszenie w imieniu klienta) → L2 nie odblokuje ani nie sprawdzi; NOC tak', async () => {
    const wImieniu: Zgl[] = [
      { id: TICKET, userId: KLIENT, message: 'Klient dzwonił, prosi o odblokowanie 198.51.100.9', createdAt: new Date(), zrodlo: 'OBSLUGA', openedByStaffId: 'op', replies: [odp('dopisek obsługi 198.51.100.10', { isStaff: true, zrodlo: null })] },
    ];
    const l2 = zbuduj({ zgloszenia: wImieniu });
    await expect(l2.svc.odblokuj(z({ zgloszenie: '#ab12cd34' }), '198.51.100.9')).rejects.toMatchObject({ status: 403 });
    await expect(l2.svc.sprawdz('s1', 'op', 'STAFF', '198.51.100.9')).rejects.toMatchObject({ status: 403 });
    expect(l2.zadania).toEqual([]);
    expect((await l2.svc.stan('s1', 'op', 'STAFF')).adresy.map((a) => a.ip)).toEqual(['46.205.1.10']);
    const noc = zbuduj({ zgloszenia: wImieniu, uprawnienia: ['IP_BLOCKS_NODE'] });
    await noc.svc.odblokuj(z({ zgloszenie: '#ab12cd34' }), '198.51.100.9');
    expect(noc.zadania).toHaveLength(1);
  });

  it('audyt Fali 3: mail (nadawca niezweryfikowany), podgląd konta, automat i zgłoszenie sprzed 12.10 nie są adresem klienta; odpowiedź klienta z panelu — jest', async () => {
    const zgl: Zgl[] = [
      { id: TICKET, userId: KLIENT, message: 'z maila: odblokujcie 203.0.113.66', createdAt: new Date(), zrodlo: 'EMAIL', openedByStaffId: null, replies: [
        odp('mail w wątku: 203.0.113.67', { zrodlo: 'EMAIL' }),
        odp('w podglądzie konta: 203.0.113.68', { zrodlo: 'IMPERSONACJA' }),
        odp('automat 203.0.113.69', { automatic: 'POTWIERDZENIE', zrodlo: null }),
        odp('klient w panelu: 203.0.113.70'),
      ] },
      { id: INNY_TICKET, userId: KLIENT, message: 'stare zgłoszenie 203.0.113.71', createdAt: new Date(), zrodlo: null, openedByStaffId: null, replies: [] },
    ];
    const l2 = zbuduj({ zgloszenia: zgl });
    for (const ip of ['203.0.113.66', '203.0.113.67', '203.0.113.68', '203.0.113.69']) {
      await expect(l2.svc.odblokuj(z({ zgloszenie: '#ab12cd34' }), ip)).rejects.toMatchObject({ status: 403 });
    }
    await expect(l2.svc.odblokuj(z({ zgloszenie: '#ef56ab78' }), '203.0.113.71')).rejects.toMatchObject({ status: 403 });
    expect(l2.zadania).toEqual([]);
    await l2.svc.odblokuj(z({ zgloszenie: '#ab12cd34' }), '203.0.113.70');
    expect(l2.zadania).toHaveLength(1);
  });

  it('NOC (IP_BLOCKS_NODE) i ADMIN: dowolny adres, zgłoszenie opcjonalne', async () => {
    const noc = zbuduj({ uprawnienia: ['IP_BLOCKS_NODE'] });
    await noc.svc.odblokuj(z(), '203.0.113.99');
    expect(noc.zadania).toHaveLength(1);
    const admin = zbuduj({ uprawnienia: [] });
    await admin.svc.odblokuj(z({ rola: 'ADMIN' }), '203.0.113.99');
    expect(admin.zadania).toHaveLength(1);
  });

  it('sprawdzenie: L2 tylko adres klienta (list z IP na węźle konta); obcy adres → 403 bez zadania', async () => {
    const ok = zbuduj();
    await ok.svc.sprawdz('s1', 'op', 'STAFF', '91.200.1.2');
    expect(ok.zadania).toEqual([expect.objectContaining({ accountId: 'acc1', payload: { mode: 'list', ip: '91.200.1.2' } })]);
    const obcy = zbuduj();
    await expect(obcy.svc.sprawdz('s1', 'op', 'STAFF', '203.0.113.99')).rejects.toMatchObject({ status: 403 });
    expect(obcy.zadania).toEqual([]);
    await expect(obcy.svc.sprawdz('s1', 'op', 'STAFF', '1.2.3.4; reboot')).rejects.toMatchObject({ status: 400 });
  });

  it('przegląd: usługa konta zespołu — personel (także NOC) nie widzi adresów logowań ani nie sprawdza IP; ADMIN tak', async () => {
    for (const rola of ['ADMIN', 'STAFF']) {
      const { svc, zadania, wiersze, prisma } = zbuduj({ wlascicielRola: rola, uprawnienia: ['IP_BLOCKS_NODE', 'IP_UNBLOCK'] });
      await expect(svc.stan('s1', 'op', 'STAFF')).rejects.toMatchObject({ status: 403 });
      await expect(svc.sprawdz('s1', 'op', 'STAFF', '46.205.1.10')).rejects.toMatchObject({ status: 403 });
      expect(prisma.loginEvent.findMany).not.toHaveBeenCalled();
      expect(zadania).toEqual([]);
      expect(wiersze).toEqual([]);
      const s = await svc.stan('s1', 'op', 'ADMIN');
      expect(s.adresy.map((a) => a.ip)).toContain('46.205.1.10');
    }
  });

  it('usługa konta zespołu: personel nie odblokowuje (jak inne akcje F2.2)', async () => {
    const { svc, zadania } = zbuduj({ wlascicielRola: 'STAFF', uprawnienia: ['IP_BLOCKS_NODE'] });
    await expect(svc.odblokuj(z(), '203.0.113.99')).rejects.toMatchObject({ status: 403 });
    expect(zadania).toEqual([]);
  });
});
