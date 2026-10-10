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

function zbuduj(o: { uprawnienia?: string[]; wlascicielRola?: string } = {}) {
  const wiersze: Wiersz[] = [];
  const zadania: Array<Record<string, unknown>> = [];
  const zgloszenia = [
    { id: TICKET, userId: KLIENT, message: 'Nie mogę odebrać poczty, mój adres w biurze to 83.12.44.201', createdAt: new Date(), replies: [] },
    { id: INNY_TICKET, userId: KLIENT, message: 'Pytanie o fakturę', createdAt: new Date(), replies: [{ message: 'a z domu 91.200.1.2', createdAt: new Date() }] },
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
      findMany: vi.fn(async ({ where }: { where: { userId: string; id?: string | { startsWith: string } } }) =>
        zgloszenia.filter((t) => {
          if (t.userId !== where.userId) return false;
          if (typeof where.id === 'string') return t.id === where.id;
          if (where.id && 'startsWith' in where.id) return t.id.startsWith(where.id.startsWith);
          return true;
        }),
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
  return { svc, wiersze, zadania };
}

const POWOD = 'Klient zgłasza brak dostępu do poczty po zmianie hasła';
const z = (o: { zgloszenie?: string; rola?: string } = {}) => ({
  subscriptionId: 's1', operatorUserId: 'op', operatorRole: o.rola ?? 'STAFF', powod: POWOD, zgloszenie: o.zgloszenie,
});

describe('F3.2 BlokadyIpKontaService — „Zablokowało mi IP”', () => {
  it('adresy klienta: logowania (bez prefiksu ::ffff:, bez powtórzeń) i adresy z jego zgłoszeń; odczyt w dzienniku', async () => {
    const { svc, wiersze } = zbuduj();
    const s = await svc.stan('s1', 'op');
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

  it('usługa konta zespołu: personel nie odblokowuje (jak inne akcje F2.2)', async () => {
    const { svc, zadania } = zbuduj({ wlascicielRola: 'STAFF', uprawnienia: ['IP_BLOCKS_NODE'] });
    await expect(svc.odblokuj(z(), '203.0.113.99')).rejects.toMatchObject({ status: 403 });
    expect(zadania).toEqual([]);
  });
});
