import { BadRequestException } from '@nestjs/common';
import { DirectAdminClient } from '@verris/directadmin-sdk';
import { DirectAdminService, interpretujLogDa } from './directadmin.service.js';

/**
 * K-04/K-05 — logi WWW domeny (DA CMD_SHOW_LOG). Pilnujemy, że:
 *  - log czytamy wyłącznie dla domeny z konta usługi (jak strefa DNS, F-01),
 *  - do DA idzie typ `log` albo `error` i liczba linii z granicami 20–1000,
 *  - strona HTML albo `error=1` od DA to błąd, a nie „wpisy logu” ze znacznikami,
 *  - awaria DA to `fetchError`, nigdy pusta lista udająca brak ruchu.
 */
type Odp = { data: unknown };
const odp = (v: unknown): Promise<Odp> => (v instanceof Error ? Promise.reject(v) : Promise.resolve({ data: v }));

function stanowisko(log: unknown = '1.2.3.4 - - [24/Sep/2026] "GET / HTTP/1.1" 200\n5.6.7.8 - - [24/Sep/2026] "GET /a HTTP/1.1" 404\n') {
  const trasy: Record<string, unknown> = {
    '/CMD_API_SHOW_DOMAINS': 'list0=firma.pl&list1=sklep.pl',
    '/CMD_API_SHOW_USER_CONFIG': 'domain=firma.pl',
    '/CMD_SHOW_LOG': log,
  };
  const get = vi.fn((path: string, _cfg?: Record<string, unknown>) => odp(trasy[path] ?? ''));
  const klient = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
  Object.assign(klient, { client: { get, post: vi.fn() } });
  const account = { id: 'a1', status: 'SUSPENDED', daUsername: 'klient1', domain: 'firma.pl', daPasswordEnc: 'enc' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    account: { update: vi.fn(async () => account) },
  };
  const svc = new DirectAdminService(prisma as never, {} as never, {} as never, { record: vi.fn() } as never);
  vi.spyOn(svc, 'getClientForHostingAccount').mockResolvedValue(klient);
  const zapytanieLogu = () => get.mock.calls.find((c) => c[0] === '/CMD_SHOW_LOG')?.[1] as { params: Record<string, string> } | undefined;
  return { svc, get, zapytanieLogu };
}

describe('Logi WWW — readHostingLog', () => {
  it('domena spoza konta → 400, DA nie jest pytany o log', async () => {
    const s = stanowisko();
    await expect(s.svc.readHostingLog('s1', 'u1', { type: 'access', domain: 'obca.pl' })).rejects.toBeInstanceOf(BadRequestException);
    expect(s.zapytanieLogu()).toBeUndefined();
  });

  it('błędy: type=error, domyślnie domena główna, linie w granicach', async () => {
    const s = stanowisko();
    const r = await s.svc.readHostingLog('s1', 'u1', { type: 'error', lines: 5000 });
    expect(s.zapytanieLogu()?.params).toEqual({ domain: 'firma.pl', type: 'error', lines: '1000' });
    expect(r.domain).toBe('firma.pl');
    expect(r.fetchError).toBeNull();
  });

  it('dostęp: type=log dla wybranej domeny konta; zawieszone konto też może czytać', async () => {
    const s = stanowisko();
    const r = await s.svc.readHostingLog('s1', 'u1', { type: 'access', domain: ' Sklep.pl ', lines: 5 });
    expect(s.zapytanieLogu()?.params).toEqual({ domain: 'sklep.pl', type: 'log', lines: '20' });
    expect(r.lines).toHaveLength(2);
  });

  it('awaria sieci → fetchError, a nie pusta lista bez komentarza', async () => {
    const s = stanowisko(new Error('ECONNREFUSED'));
    const r = await s.svc.readHostingLog('s1', 'u1', { type: 'access' });
    expect(r.lines).toEqual([]);
    expect(r.fetchError).toContain('ECONNREFUSED');
  });
});

describe('Logi WWW — interpretujLogDa', () => {
  it('zwraca ostatnie N linii bez pustych i zaznacza ucięcie', () => {
    expect(interpretujLogDa('a\nb\n\nc\n', 2)).toEqual({ lines: ['b', 'c'], truncated: true, fetchError: null });
    expect(interpretujLogDa('a\r\nb\r\n', 10)).toEqual({ lines: ['a', 'b'], truncated: false, fetchError: null });
  });

  it('error=1 od DA to błąd z opisem', () => {
    expect(interpretujLogDa('error=1&text=Brak%20dost%C4%99pu', 100).fetchError).toBe('Brak dostępu');
  });

  it('strona HTML (np. logowanie) to błąd, nie „wpisy logu”', () => {
    const r = interpretujLogDa('<!DOCTYPE html><html><body>login</body></html>', 100);
    expect(r.lines).toEqual([]);
    expect(r.fetchError).toMatch(/tekstowej/);
  });

  it('linia logu z „error=1” w adresie nie jest brana za błąd DA', () => {
    const linia = '1.2.3.4 - - "GET /?error=1 HTTP/1.1" 200';
    expect(interpretujLogDa(linia, 100)).toEqual({ lines: [linia], truncated: false, fetchError: null });
  });

  it('pusty log → pusta lista bez błędu (brak ruchu jest prawdziwą odpowiedzią)', () => {
    expect(interpretujLogDa('', 100)).toEqual({ lines: [], truncated: false, fetchError: null });
  });
});
