import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DirectAdminClient } from '@verris/directadmin-sdk';
import { DirectAdminService } from './directadmin.service.js';

/**
 * X-09 — cron, FTP, autorespondery i hosty dostępu do bazy w DirectAdminService (dotąd bez testów).
 * Mock na granicy HTTP (axios w prawdziwym DirectAdminClient): dokładne pola wysyłane do DA,
 * walidacja przed DA, konto zawieszone bez mutacji, wpis w audycie po udanej operacji.
 */
type Odp = { data: unknown };
const odp = (v: unknown): Promise<Odp> => (v instanceof Error ? Promise.reject(v) : Promise.resolve({ data: v }));

function stanowisko(o: { status?: string; get?: Record<string, unknown>; post?: Record<string, unknown>; sloty?: string[] } = {}) {
  const trasyGet: Record<string, unknown> = {
    '/CMD_API_SHOW_DOMAINS': 'list0=firma.pl&list1=sklep.pl',
    '/CMD_API_SHOW_USER_CONFIG': 'domain=firma.pl',
    ...o.get,
  };
  const get = vi.fn((path: string, _cfg?: Record<string, unknown>) => odp(trasyGet[path] ?? ''));
  const post = vi.fn((path: string, _body?: unknown, _cfg?: Record<string, unknown>) =>
    odp(o.post?.[path] ?? 'error=0&text=OK'),
  );
  const klient = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
  Object.assign(klient, { client: { get, post } });
  const account = { id: 'a1', status: o.status ?? 'ACTIVE', daUsername: 'klient1', domain: 'firma.pl', daPasswordEnc: 'enc' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    account: {
      update: vi.fn(async () => account),
      // Z-10: domena główna innego klienta.
      findFirst: vi.fn(async (a: { where: { domain: { in: string[] } } }) => (a.where.domain.in.includes('cudza.pl') ? { id: 'a2' } : null)),
    },
    domain: { findFirst: vi.fn(async (a: { where: { name: { in: string[] } } }) => (a.where.name.in.includes('zarejestrowana.pl') ? { id: 'd2' } : null)) },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const platformSettings = { getPhpSlotReleases: vi.fn(async () => o.sloty ?? ['8.3', '8.2', '7.4']) };
  const svc = new DirectAdminService(prisma as never, {} as never, platformSettings as never, audit as never);
  vi.spyOn(svc, 'getClientForHostingAccount').mockResolvedValue(klient);
  const wyslane = (n = 0) => Object.fromEntries(new URLSearchParams(String(post.mock.calls[n]?.[1] ?? '')));
  return { svc, get, post, audit, wyslane };
}


describe('cron (CMD_API_CRON)', () => {
  const zadanie = { minute: '*/5', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*', command: 'php ~/domains/firma.pl/public_html/cron.php' };

  it('dodanie: pola crona 1:1 do DA i wpis w audycie z komendą', async () => {
    const s = stanowisko();
    await s.svc.createHostingCronJob('s1', 'u1', zadanie);
    expect(s.wyslane()).toEqual({ action: 'create', minute: '*/5', hour: '*', day_of_month: '*', month: '*', day_of_week: '*', command: zadanie.command, api: 'yes' });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_CRON_CREATED', details: { subscriptionId: 's1', command: zadanie.command } }));
  });

  it('usunięcie i zmiana: identyfikator tylko liczbowy, inaczej 400 bez DA', async () => {
    const s = stanowisko();
    await expect(s.svc.deleteHostingCronJob('s1', 'u1', '1&action=create')).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.updateHostingCronJob('s1', 'u1', 'x', zadanie)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.post).not.toHaveBeenCalled();
    await s.svc.deleteHostingCronJob('s1', 'u1', '12');
    expect(s.wyslane()).toEqual({ action: 'delete', select0: '12', api: 'yes' });
  });

  it('zmiana: najpierw nowy wpis, potem usunięcie starego (nigdy utrata zadania)', async () => {
    const s = stanowisko();
    await s.svc.updateHostingCronJob('s1', 'u1', '7', zadanie);
    expect(s.wyslane(0).action).toBe('create');
    expect(s.wyslane(1)).toEqual({ action: 'delete', select0: '7', api: 'yes' });
  });

  it('konto zawieszone → bez mutacji w DA', async () => {
    const s = stanowisko({ status: 'SUSPENDED' });
    await expect(s.svc.createHostingCronJob('s1', 'u1', zadanie)).rejects.toThrow();
    expect(s.post).not.toHaveBeenCalled();
  });
});

describe('FTP — zmiana hasła', () => {
  const lista = { '/CMD_API_FTP': 'error=0&user0=ftp1@firma.pl&path0=/domains/firma.pl/public_html/sklep' };

  it('konto spoza listy usługi → 404, bez modyfikacji', async () => {
    const s = stanowisko({ post: lista });
    await expect(s.svc.changeHostingFtpPassword('s1', 'u1', 'obcy@firma.pl', 'Haslo123!x')).rejects.toBeInstanceOf(NotFoundException);
    expect(s.post.mock.calls.map((c) => new URLSearchParams(String(c[1])).get('action'))).toEqual(['list']);
  });

  it('znane konto → modify z zachowaniem katalogu (custom_val) i bez hasła w audycie', async () => {
    const s = stanowisko({ post: lista });
    await s.svc.changeHostingFtpPassword('s1', 'u1', 'ftp1@firma.pl', 'Haslo123!x');
    const modify = s.post.mock.calls.map((c) => Object.fromEntries(new URLSearchParams(String(c[1])))).find((b) => b.action === 'modify');
    expect(modify).toMatchObject({ domain: 'firma.pl', user: 'ftp1', passwd: 'Haslo123!x', passwd2: 'Haslo123!x', type: 'custom', custom_val: '/domains/firma.pl/public_html/sklep' });
    expect(JSON.stringify(s.audit.record.mock.calls)).not.toContain('Haslo123!x');
  });
});

describe('autorespondery i hosty dostępu do bazy', () => {
  it('usunięcie autorespondera: sama nazwa skrzynki (bez @domeny) w domenie konta', async () => {
    const s = stanowisko();
    await s.svc.deleteHostingAutoresponder('s1', 'u1', 'Biuro@firma.pl');
    expect(s.wyslane(s.post.mock.calls.length - 1)).toEqual({ action: 'delete', domain: 'firma.pl', select0: 'biuro', api: 'yes' });
    await expect(s.svc.deleteHostingAutoresponder('s1', 'u1', '  ')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('usunięcie hosta dostępu: wymaga bazy i hosta; pola accesshosts dla DA', async () => {
    const s = stanowisko();
    await expect(s.svc.deleteHostingDbAccessHost('s1', 'u1', { db: '', host: '%' })).rejects.toBeInstanceOf(BadRequestException);
    expect(s.post).not.toHaveBeenCalled();
    await s.svc.deleteHostingDbAccessHost('s1', 'u1', { db: 'klient1_wp', host: '203.0.113.5' });
    expect(s.wyslane()).toEqual({ action: 'accesshosts', delete: 'yes', db: 'klient1_wp', select0: '203.0.113.5', api: 'yes' });
  });
});
