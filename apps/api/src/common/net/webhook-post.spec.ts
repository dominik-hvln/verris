import type { Mock } from 'vitest';
import { lookup } from 'node:dns';
import { bezpiecznyLookup, isPrivateOrReservedIp, postWebhookBezpiecznie } from './webhook-post.js';

vi.mock('node:dns', () => ({ lookup: vi.fn() }));
const dnsLookup = lookup as unknown as Mock;
const odpowiedz = (adresy: { address: string; family: number }[]) =>
  dnsLookup.mockImplementationOnce((_h: string, _o: unknown, cb: (e: null, a: unknown) => void) => cb(null, adresy));

/** DNS rebinding: adres sprawdzany w chwili połączenia, nie tylko przed wysyłką. */
describe('bezpiecznyLookup', () => {
  it('adres publiczny → przechodzi (tryb pojedynczy i all)', () => {
    const cb = vi.fn();
    odpowiedz([{ address: '203.0.113.7', family: 4 }]);
    bezpiecznyLookup('hook.example.com', {}, cb);
    expect(cb).toHaveBeenCalledWith(null, '203.0.113.7', 4);
    odpowiedz([{ address: '203.0.113.7', family: 4 }]);
    bezpiecznyLookup('hook.example.com', { all: true }, cb);
    expect(cb).toHaveBeenLastCalledWith(null, [{ address: '203.0.113.7', family: 4 }]);
  });

  it.each([['127.0.0.1'], ['10.0.0.5'], ['169.254.169.254'], ['::1'], ['::ffff:192.168.1.1']])('%s → błąd EPRIVATE, bez połączenia', (ip) => {
    const cb = vi.fn();
    odpowiedz([{ address: '203.0.113.7', family: 4 }, { address: ip, family: ip.includes(':') ? 6 : 4 }]);
    bezpiecznyLookup('rebind.example.com', {}, cb);
    expect(cb.mock.calls[0][0]).toMatchObject({ code: 'EPRIVATE' });
  });

  it('klasyfikacja adresów i tylko https', async () => {
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('172.20.0.1')).toBe(true);
    await expect(postWebhookBezpiecznie('http://hook.example.com/x', {}, '{}')).rejects.toThrow('HTTPS');
  });
});
