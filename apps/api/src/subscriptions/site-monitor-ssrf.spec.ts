import type { Mock } from 'vitest';
import { probeUrl } from './site-monitor.service.js';
import { getBezpiecznie } from '../common/net/webhook-post.js';

vi.mock('../common/net/webhook-post.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getBezpiecznie: vi.fn(async () => 301),
}));
const get = getBezpiecznie as Mock;

/**
 * SEC-09 (druga warstwa) — monitor strony nie odpytuje adresów prywatnych,
 * nawet gdy domena klienta na nie wskazuje, i nie idzie za przekierowaniem.
 * Nazwy są dodatkowo sprawdzane w chwili połączenia (getBezpiecznie → bezpiecznyLookup,
 * test w common/net/webhook-post.spec.ts), więc DNS rebinding nie omija kontroli.
 */
describe('monitor strony a SSRF', () => {
  beforeEach(() => get.mockClear());

  it.each(['169.254.169.254', '127.0.0.1', '10.1.2.3', '172.19.0.3', '192.168.1.1'])(
    'adres %s: DOWN bez wysłania żądania',
    async (ip) => {
      const r = await probeUrl(`https://${ip}`);
      expect(r.up).toBe(false);
      expect(r.reason).toMatch(/prywatny/);
      expect(get).not.toHaveBeenCalled();
    },
  );

  it('adres publiczny: jedno żądanie przez strażnika połączenia; 3xx = UP (bez podążania)', async () => {
    const r = await probeUrl('https://1.1.1.1');
    expect(r).toMatchObject({ up: true, httpStatus: 301 });
    expect(get).toHaveBeenCalledTimes(1);
    get.mockResolvedValueOnce(503);
    expect(await probeUrl('https://1.1.1.1')).toMatchObject({ up: false, reason: 'HTTP 503' });
  });
});
