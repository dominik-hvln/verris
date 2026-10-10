import { promises as dns } from 'dns';
import { RblReputationScheduler } from './rbl-reputation.scheduler.js';
import { RBL_ZONES } from '../deliverability/rbl.js';

/**
 * Pozycja 23 — monitoring reputacji IP floty: timeout albo odmowa listy to stan „nieznany”, nie „czysto”.
 * Wcześniej awaria DNS po alercie wysyłała adminom „IP znów czyste”.
 */
const NX = () => Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
const TIMEOUT = () => Object.assign(new Error('t'), { code: 'ETIMEOUT' });

function uklad(odpowiedzi: Record<string, string[] | Error>, wpisy: { action: string; createdAt: Date; details: unknown }[] = []) {
  vi.spyOn(dns, 'resolve4').mockImplementation((async (name: string) => {
    const zone = Object.keys(odpowiedzi).find((z) => name.endsWith(z));
    const v = zone ? odpowiedzi[zone] : NX();
    if (v instanceof Error) throw v;
    return v;
  }) as never);
  const zapisane: { action: string; details: unknown }[] = [];
  const maile: { subject: string }[] = [];
  const prisma = {
    server: { findMany: async () => [{ id: 's1', name: 'node-pl-01', hostname: null, ipAddress: '203.0.113.7' }] },
    user: { findMany: async () => [{ id: 'a1', email: 'admin@verris.pl', firstName: 'Ala' }] },
    auditLog: { findMany: async () => [...wpisy].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) },
  };
  const audit = { record: async (p: { action: string; details: unknown }) => void zapisane.push(p) };
  const mailer = { send: async (m: { subject: string }) => void maile.push(m) };
  const s = new RblReputationScheduler(prisma as never, mailer as never, audit as never, { get: () => undefined } as never);
  return { s, zapisane, maile };
}

const godzinTemu = (h: number) => new Date(Date.now() - h * 3600_000);
const alertWczesniej = { action: 'NODE_RBL_ALERT', createdAt: godzinTemu(13), details: { serverId: 's1' } };

describe('RblReputationScheduler — stan „nieznany” (pozycja 23)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('martwa strefa SORBS nie jest sprawdzana', () => {
    expect(RBL_ZONES).not.toContain('dnsbl.sorbs.net');
    expect(RBL_ZONES).toContain('zen.spamhaus.org');
  });

  it('timeout jednej listy po wcześniejszym alercie: bez „IP znów czyste”, jest alert „nieznany”', async () => {
    const { s, zapisane, maile } = uklad({ 'bl.spamcop.net': TIMEOUT() }, [alertWczesniej]);
    await s.scanFleet();
    expect(zapisane.map((z) => z.action)).toEqual(['NODE_RBL_UNKNOWN']);
    expect(zapisane[0].details).toMatchObject({ serverId: 's1', zones: ['bl.spamcop.net'] });
    expect(maile).toHaveLength(1);
    expect(maile[0].subject).toContain('nieznana');
  });

  it('odmowa Spamhausa (127.255.255.254) to „nieznany”, nie wpis i nie „czysto”', async () => {
    const r = await uklad({ 'zen.spamhaus.org': ['127.255.255.254'] }).s.sprawdzIp('203.0.113.7');
    expect(r).toEqual({ listed: [], unknown: ['zen.spamhaus.org'] });
  });

  it('alert „nieznany” najwyżej raz na dobę na węzeł', async () => {
    const { s, zapisane, maile } = uklad({ 'bl.spamcop.net': TIMEOUT() }, [
      { action: 'NODE_RBL_UNKNOWN', createdAt: godzinTemu(6), details: { serverId: 's1' } },
    ]);
    await s.scanFleet();
    expect(zapisane).toEqual([]);
    expect(maile).toEqual([]);
  });

  it('wszystkie listy odpowiedziały NXDOMAIN po alercie — przywrócenie jak dotąd', async () => {
    const { s, zapisane } = uklad({}, [alertWczesniej]);
    await s.scanFleet();
    expect(zapisane.map((z) => z.action)).toEqual(['NODE_RBL_CLEARED']);
  });

  it('wpis wygrywa z „nieznanym” na innej liście', async () => {
    const { s, zapisane } = uklad({ 'bl.spamcop.net': ['127.0.0.2'], 'zen.spamhaus.org': TIMEOUT() });
    await s.scanFleet();
    expect(zapisane.map((z) => z.action)).toEqual(['NODE_RBL_ALERT']);
    expect(zapisane[0].details).toMatchObject({ zones: ['bl.spamcop.net'] });
  });
});
