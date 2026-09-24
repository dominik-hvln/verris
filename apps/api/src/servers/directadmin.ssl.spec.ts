import { X509Certificate } from 'crypto';
import { DirectAdminClient } from '@verris/directadmin-sdk';
import { DirectAdminService } from './directadmin.service';

/**
 * SSL w DirectAdminService: wystawienie Let's Encrypt, wklejenie własnego certyfikatu
 * i odczyt stanu certyfikatów. Pilnujemy, że:
 *  - certyfikat zamawiamy tylko dla domeny, która należy do konta usługi,
 *  - błąd ACME zwrócony przez DA jako 200 + error=1 kończy się wyjątkiem, nie „wystawiono”,
 *  - status VALID/EXPIRING/EXPIRED wynika z prawdziwego X.509, a błąd DA to NONE (nigdy VALID),
 *  - z odpowiedzi DA czytamy certyfikat, nigdy klucz prywatny.
 */
type Odp = { data: unknown };
const odp = (v: unknown): Promise<Odp> => (v instanceof Error ? Promise.reject(v) : Promise.resolve({ data: v }));

function stanowisko(o: { status?: string; get?: Record<string, unknown>; post?: Record<string, unknown> } = {}) {
  const trasyGet: Record<string, unknown> = {
    '/CMD_API_SHOW_DOMAINS': 'list0=firma.pl',
    '/CMD_API_SHOW_USER_CONFIG': 'domain=firma.pl',
    ...o.get,
  };
  const get = jest.fn((path: string, _cfg?: Record<string, unknown>) => odp(trasyGet[path] ?? ''));
  const post = jest.fn((path: string, _body?: unknown, _cfg?: Record<string, unknown>) =>
    odp(o.post?.[path] ?? 'error=0&text=OK'),
  );
  const klient = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
  Object.assign(klient, { client: { get, post } });
  const account = { id: 'a1', status: o.status ?? 'ACTIVE', daUsername: 'klient1', domain: 'firma.pl', daPasswordEnc: 'enc' };
  const prisma = {
    subscription: { findFirst: jest.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    account: { update: jest.fn(async () => account) },
  };
  const svc = new DirectAdminService(prisma as never, {} as never, {} as never, { record: jest.fn() } as never);
  jest.spyOn(svc, 'getClientForHostingAccount').mockResolvedValue(klient);
  const wyslane = (n = 0) => Object.fromEntries(new URLSearchParams(String(post.mock.calls[n]?.[1] ?? '')));
  return { svc, get, post, wyslane };
}

/** Samopodpisany certyfikat testowy: O=Let's Encrypt, SAN firma.pl + *.firma.pl, ważny 90 dni. */
const PEM = `-----BEGIN CERTIFICATE-----
MIIB2jCCAYCgAwIBAgIUQQx4YuupOMYXNuTdzWQ3O+COmy8wCgYIKoZIzj0EAwIw
MjELMAkGA1UEBhMCVVMxFjAUBgNVBAoMDUxldCdzIEVuY3J5cHQxCzAJBgNVBAMM
AlIzMB4XDTI2MDkyMzIyMjEwOFoXDTI2MTIyMjIyMjEwOFowMjELMAkGA1UEBhMC
VVMxFjAUBgNVBAoMDUxldCdzIEVuY3J5cHQxCzAJBgNVBAMMAlIzMFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAEbIqafeqx5nJ+c8fLZug08Nd4aCyC8EVCq78KD3rL
BVHOtBFoEaEp2CS3bTHk5h1q/6LBh9Sph+ggQ+y1s79dYqN0MHIwHQYDVR0OBBYE
FEuprpWDKUkjxx07WwZtdKpbV6QyMB8GA1UdIwQYMBaAFEuprpWDKUkjxx07WwZt
dKpbV6QyMA8GA1UdEwEB/wQFMAMBAf8wHwYDVR0RBBgwFoIIZmlybWEucGyCCiou
ZmlybWEucGwwCgYIKoZIzj0EAwIDSAAwRQIhAJbF61gQZSHL5dIoQyblUwjfdF6q
eLeVK2tCX4M5xdqtAiBIWFPvyYo/NNoPtHS1SUbfcvUJMjd5ICaEQznVKTHSbg==
-----END CERTIFICATE-----`;
const KONIEC = new Date(new X509Certificate(PEM).validTo).getTime();
const DZIEN = 24 * 60 * 60 * 1000;
const KLUCZ = '-----BEGIN PRIVATE KEY-----\nTAJNE\n-----END PRIVATE KEY-----';

describe("SSL — zamówienie Let's Encrypt (CMD_API_SSL)", () => {
  it('domena spoza konta → 400, DA nie dostaje zamówienia', async () => {
    const s = stanowisko();
    await expect(s.svc.requestLetsEncryptCertificate('s1', 'u1', { domain: 'obca.pl' })).rejects.toThrow('nie jest przypisana');
    expect(s.post).not.toHaveBeenCalled();
  });

  it('nie da się ustalić domen konta (błąd sieci) → 400, bez zamówienia', async () => {
    const s = stanowisko({ get: { '/CMD_API_SHOW_DOMAINS': new Error('ECONNREFUSED') } });
    await expect(s.svc.requestLetsEncryptCertificate('s1', 'u1', { domain: 'firma.pl' })).rejects.toThrow('ECONNREFUSED');
    expect(s.post).not.toHaveBeenCalled();
  });

  it('domyślnie: sama domena, dokładne pola i długi timeout (ACME trwa)', async () => {
    const s = stanowisko();
    await expect(s.svc.requestLetsEncryptCertificate('s1', 'u1', { domain: ' firma.pl ' })).resolves.toEqual({ ok: true });
    expect(s.post.mock.calls[0][0]).toBe('/CMD_API_SSL');
    expect(s.wyslane()).toEqual({
      action: 'save', type: 'create', request: 'letsencrypt', domain: 'firma.pl', name: 'firma.pl', submit: 'Save',
      background: 'auto', wildcard: 'no', keysize: 'secp384r1', encryption: 'sha256', le_select0: 'firma.pl', api: 'yes',
    });
    expect(s.post.mock.calls[0][2]).toMatchObject({ timeout: 180_000 });
  });

  it('includeWww dokłada www jako drugą nazwę', async () => {
    const s = stanowisko();
    await s.svc.requestLetsEncryptCertificate('s1', 'u1', { domain: 'firma.pl', includeWww: true });
    expect(s.wyslane()).toMatchObject({ name: 'firma.pl', wildcard: 'no', le_select0: 'firma.pl', le_select1: 'www.firma.pl' });
  });

  it('wildcard pokrywa apex + *.domena i ma pierwszeństwo przed www', async () => {
    const s = stanowisko();
    await s.svc.requestLetsEncryptCertificate('s1', 'u1', { domain: 'firma.pl', includeWww: true, wildcard: true });
    expect(s.wyslane()).toMatchObject({ name: 'firma.pl,*.firma.pl', wildcard: 'yes', le_select1: '*.firma.pl' });
  });

  it.each([
    ['tekst', 'error=1&text=ACME%3A%20DNS%20nie%20wskazuje%20na%20serwer'],
    ['JSON', { error: '1', text: 'ACME: DNS nie wskazuje na serwer' }],
  ])('błąd ACME w treści 200 (%s) → wyjątek, a nie { ok: true }', async (_n, body) => {
    const s = stanowisko({ post: { '/CMD_API_SSL': body } });
    await expect(s.svc.requestLetsEncryptCertificate('s1', 'u1', { domain: 'firma.pl' })).rejects.toThrow('DNS nie wskazuje');
  });

  it('błąd sieci przy zamówieniu → wyjątek', async () => {
    const s = stanowisko({ post: { '/CMD_API_SSL': new Error('timeout of 180000ms exceeded') } });
    await expect(s.svc.requestLetsEncryptCertificate('s1', 'u1', { domain: 'firma.pl' })).rejects.toThrow('timeout');
  });

  it('konto zawieszone (SEC-2) → 400, bez zamówienia', async () => {
    const s = stanowisko({ status: 'SUSPENDED' });
    await expect(s.svc.requestLetsEncryptCertificate('s1', 'u1', { domain: 'firma.pl' })).rejects.toThrow('zawieszone');
    expect(s.post).not.toHaveBeenCalled();
  });
});

describe('SSL — własny certyfikat (type=paste)', () => {
  it('PEM wieloliniowy dociera do DA bajt w bajt; pusty łańcuch CA nie jest wysyłany', async () => {
    const s = stanowisko();
    await s.svc.pasteCustomSslCertificate('s1', 'u1', { domain: 'firma.pl', certificate: `${PEM}\n`, privateKey: KLUCZ, caBundle: '  ' });
    expect(s.wyslane()).toEqual({ action: 'save', type: 'paste', domain: 'firma.pl', certificate: PEM, key: KLUCZ, submit: 'Save', api: 'yes' });
  });

  it('łańcuch CA → pole cacert', async () => {
    const s = stanowisko();
    await s.svc.pasteCustomSslCertificate('s1', 'u1', { domain: 'firma.pl', certificate: PEM, privateKey: KLUCZ, caBundle: PEM });
    expect(s.wyslane().cacert).toBe(PEM);
  });

  it('brak klucza → 400; domena spoza konta → 400; w obu razach bez DA', async () => {
    const s = stanowisko();
    await expect(s.svc.pasteCustomSslCertificate('s1', 'u1', { domain: 'firma.pl', certificate: PEM, privateKey: ' ' })).rejects.toThrow('wymagane');
    await expect(s.svc.pasteCustomSslCertificate('s1', 'u1', { domain: 'obca.pl', certificate: PEM, privateKey: KLUCZ })).rejects.toThrow('nie jest przypisana');
    expect(s.post).not.toHaveBeenCalled();
  });
});

describe('SSL — stan certyfikatów (odczyt X.509)', () => {
  afterEach(() => jest.useRealTimers());
  const zCertem = () =>
    stanowisko({ get: { '/CMD_API_SSL': new URLSearchParams({ key: KLUCZ, certificate: PEM }).toString() } });

  it.each([
    [30, 'VALID', 30],
    [5, 'EXPIRING', 5],
    [-1, 'EXPIRED', -1],
  ])('%i dni do końca ważności → %s', async (dni, status, daysLeft) => {
    jest.useFakeTimers({ now: KONIEC - dni * DZIEN });
    const s = zCertem();
    const { rows, fetchError } = await s.svc.listHostingSslCertificates('s1', 'u1');
    expect(fetchError).toBeNull();
    expect(rows).toEqual([{
      id: 'firma.pl', domain: 'firma.pl', issuer: "Let's Encrypt", status, expiresAt: new Date(KONIEC).toISOString(),
      isLetsEncrypt: true, daysLeft, coveredNames: ['firma.pl', '*.firma.pl'], isWildcard: true,
    }]);
    expect(s.get).toHaveBeenCalledWith('/CMD_API_SSL', expect.objectContaining({ params: { domain: 'firma.pl', action: 'view' } }));
  });

  it.each([
    ['error=1 w treści', 'error=1&text=No%20certificate'],
    ['sam klucz prywatny', new URLSearchParams({ key: KLUCZ }).toString()],
    ['błąd sieci', new Error('ECONNRESET')],
  ])('%s → NONE (nigdy VALID)', async (_n, odpowiedz) => {
    const s = stanowisko({ get: { '/CMD_API_SSL': odpowiedz } });
    const { rows } = await s.svc.listHostingSslCertificates('s1', 'u1');
    expect(rows).toEqual([expect.objectContaining({ domain: 'firma.pl', status: 'NONE', expiresAt: null, isLetsEncrypt: false })]);
  });

  it('nie da się pobrać listy domen → fetchError zamiast pustej „wszystko OK” listy', async () => {
    const s = stanowisko({ get: { '/CMD_API_SHOW_DOMAINS': new Error('401 Unauthorized') } });
    expect(await s.svc.listHostingSslCertificates('s1', 'u1')).toEqual({ rows: [], fetchError: '401 Unauthorized' });
  });
});

describe('SSL — SDK requestLetsEncrypt czyta treść odpowiedzi', () => {
  // Wcześniej SDK ignorował treść: 200 + error=1 kończyło się `ok: true`, a zaraz po
  // provisioningu best-effort LE nie widział, że certyfikatu nie ma.
  it('200 + error=1 → ok: false z komunikatem DA', async () => {
    const s = stanowisko({ post: { '/CMD_API_SSL': 'error=1&text=Rate%20limit%20exceeded' } });
    await expect(s.svc.requestLetsEncryptForSubscription('s1', 'u1')).resolves.toEqual({
      ok: false,
      domain: 'firma.pl',
      error: 'Rate limit exceeded',
    });
  });

  it('200 + error=0 → ok: true', async () => {
    const s = stanowisko();
    await expect(s.svc.requestLetsEncryptForSubscription('s1', 'u1')).resolves.toEqual({ ok: true, domain: 'firma.pl', error: null });
  });
});
