import type { Mock } from 'vitest';
import { lookup } from 'node:dns';
import { bezpiecznyLookup, getBezpiecznie, isPrivateOrReservedIp, lookupUslugiKlienta, opcjeDlaPortu, postWebhookBezpiecznie } from './webhook-post.js';
import { ustawZrodloAdresowWezlow } from './adresy-verris.js';

vi.mock('node:dns', () => ({ lookup: vi.fn() }));
const dnsLookup = lookup as unknown as Mock;
const odpowiedz = (adresy: { address: string; family: number }[]) =>
  dnsLookup.mockImplementationOnce((_h: string, _o: unknown, cb: (e: null, a: unknown) => void) => cb(null, adresy));

/** DNS rebinding: adres sprawdzany w chwili połączenia, nie tylko przed wysyłką. */
describe('bezpiecznyLookup', () => {
  it('adres publiczny → przechodzi (tryb pojedynczy i all)', async () => {
    const cb = vi.fn();
    odpowiedz([{ address: '93.184.216.34', family: 4 }]);
    bezpiecznyLookup('hook.example.com', {}, cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledWith(null, '93.184.216.34', 4));
    odpowiedz([{ address: '93.184.216.34', family: 4 }]);
    bezpiecznyLookup('hook.example.com', { all: true }, cb);
    await vi.waitFor(() => expect(cb).toHaveBeenLastCalledWith(null, [{ address: '93.184.216.34', family: 4 }]));
  });

  it.each([['127.0.0.1'], ['10.0.0.5'], ['169.254.169.254'], ['::1'], ['::ffff:192.168.1.1']])('%s → błąd EPRIVATE, bez połączenia', async (ip) => {
    const cb = vi.fn();
    odpowiedz([{ address: '93.184.216.34', family: 4 }, { address: ip, family: ip.includes(':') ? 6 : 4 }]);
    bezpiecznyLookup('rebind.example.com', {}, cb);
    await vi.waitFor(() => expect(cb.mock.calls[0][0]).toMatchObject({ code: 'EPRIVATE' }));
  });

  it('klasyfikacja adresów i tylko https', async () => {
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('172.20.0.1')).toBe(true);
    await expect(postWebhookBezpiecznie('http://hook.example.com/x', {}, '{}')).rejects.toThrow('HTTPS');
  });
});

/**
 * D12 (10.10) — w chwili połączenia także adresy control-plane i węzłów. Wcześniej lookup sprawdzał tylko
 * zakresy prywatne: domena klienta po sprawdzeniu (resolvePublicHost) przełączona na publiczny adres
 * control-plane albo węzła prowadziła połączenie z zaufanego adresu, z pominięciem zapory.
 */
describe('bezpiecznyLookup — adresy serwerów Verris (DNS rebinding)', () => {
  const env = process.env.VERRIS_CONTROL_PLANE_IPS;
  afterEach(() => {
    ustawZrodloAdresowWezlow(null);
    if (env === undefined) delete process.env.VERRIS_CONTROL_PLANE_IPS;
    else process.env.VERRIS_CONTROL_PLANE_IPS = env;
  });
  const wynik = (fn: typeof bezpiecznyLookup, adres: string) =>
    new Promise<unknown[]>((resolve) => {
      odpowiedz([{ address: adres, family: adres.includes(':') ? 6 : 4 }]);
      fn('rebind.example.com', {}, (...a) => resolve(a));
    });

  it.each(['8.8.4.4', '::ffff:8.8.4.4', '2001:4860:4860::8844'])('adres control-plane %s → EVERRIS (także dla sond usług klienta)', async (ip) => {
    process.env.VERRIS_CONTROL_PLANE_IPS = '8.8.4.4,2001:4860:4860::/64';
    expect((await wynik(bezpiecznyLookup, ip))[0]).toMatchObject({ code: 'EVERRIS' });
    expect((await wynik(lookupUslugiKlienta, ip))[0]).toMatchObject({ code: 'EVERRIS' });
  });

  it('adres węzła z bazy → EVERRIS domyślnie; sonda usługi klienta (strona na naszym węźle) przechodzi', async () => {
    delete process.env.VERRIS_CONTROL_PLANE_IPS;
    ustawZrodloAdresowWezlow(async () => ['9.9.9.9']);
    expect((await wynik(bezpiecznyLookup, '9.9.9.9'))[0]).toMatchObject({ code: 'EVERRIS' });
    expect(await wynik(lookupUslugiKlienta, '9.9.9.9')).toEqual([null, '9.9.9.9', 4]);
    expect(await wynik(bezpiecznyLookup, '1.1.1.1')).toEqual([null, '1.1.1.1', 4]);
  });

  it('nieprawidłowe VERRIS_CONTROL_PLANE_IPS → błąd, nie przepuszczenie', async () => {
    process.env.VERRIS_CONTROL_PLANE_IPS = 'to-nie-ip';
    expect((await wynik(bezpiecznyLookup, '1.1.1.1'))[0]).toBeInstanceOf(Error);
  });

  it('webhook na port inny niż WWW pod adresem węzła → odmowa przed połączeniem; :443 dozwolony', async () => {
    ustawZrodloAdresowWezlow(async () => ['9.9.9.9']);
    odpowiedz([{ address: '9.9.9.9', family: 4 }]);
    await expect(postWebhookBezpiecznie('https://hook.example.com:2222/x', {}, '{}')).rejects.toMatchObject({ code: 'EVERRIS' });
    expect(opcjeDlaPortu(new URL('https://hook.example.com/x'))).toEqual({ wezly: 'dozwolone' });
    expect(opcjeDlaPortu(new URL('https://hook.example.com:443/x'))).toEqual({ wezly: 'dozwolone' });
    expect(opcjeDlaPortu(new URL('http://strona.example.com/'))).toEqual({ wezly: 'dozwolone' });
    expect(opcjeDlaPortu(new URL('https://hook.example.com:2222/x'))).toEqual({ wezly: 'zakazane' });
  });

  /**
   * Przegląd D12: Node nie woła `lookup`, gdy host w URL jest adresem IP — adres control-plane albo węzła
   * wpisany wprost omijał strażnika (assertPublicWebhookUrl sprawdza tylko zakresy prywatne).
   * Krótki timeout: na starym kodzie żądanie idzie w sieć i kończy się innym błędem niż EVERRIS.
   */
  it.each([
    ['webhook na adres control-plane', () => postWebhookBezpiecznie('https://8.8.4.4:8443/x', {}, '{}', 300)],
    ['webhook na adres control-plane :443', () => postWebhookBezpiecznie('https://8.8.4.4/x', {}, '{}', 300)],
    ['webhook na adres IPv6 control-plane', () => postWebhookBezpiecznie('https://[2001:4860:4860::8844]/x', {}, '{}', 300)],
    ['webhook na adres węzła :2222', () => postWebhookBezpiecznie('https://9.9.9.9:2222/x', {}, '{}', 300)],
    ['GET na adres control-plane', () => getBezpiecznie('http://8.8.4.4/', {}, 300)],
  ])('%s wpisany wprost (bez DNS) → EVERRIS przed połączeniem', async (_opis, wywolaj) => {
    process.env.VERRIS_CONTROL_PLANE_IPS = '8.8.4.4,2001:4860:4860::/64';
    ustawZrodloAdresowWezlow(async () => ['9.9.9.9']);
    dnsLookup.mockClear();
    await expect(wywolaj()).rejects.toMatchObject({ code: 'EVERRIS' });
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it('adres prywatny wpisany wprost → EPRIVATE przed połączeniem', async () => {
    await expect(getBezpiecznie('http://169.254.169.254/latest/meta-data/', {}, 300)).rejects.toMatchObject({ code: 'EPRIVATE' });
  });
});
