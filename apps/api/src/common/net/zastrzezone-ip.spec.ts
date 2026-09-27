import { isPrivateOrReservedIp } from './webhook-post.js';
import { isPrivateIp } from '../../subscriptions/migration-net.util.js';

/** SSRF — adresy, do których serwer nie łączy się w imieniu klienta (przegląd 28.09). */
describe('isPrivateOrReservedIp', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '198.18.0.1', '192.0.2.10', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'febf::1', 'fd00::5', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::1', '2001:0:4136:e378::1',
    '2001:db8::1', 'nie-adres', '',
  ])('%s → zastrzeżony', (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(true);
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '140.82.121.33', '::ffff:8.8.8.8', '2a01:4f9:c014:da28::1', '2606:4700::1111', '2001:4860:4860::8888'])(
    '%s → publiczny',
    (ip) => {
      expect(isPrivateOrReservedIp(ip)).toBe(false);
      expect(isPrivateIp(ip)).toBe(false);
    },
  );
});

describe('sondy TLS na domeny klientów idą przez bezpiecznyLookup', () => {
  it.each([
    'domains/domains.service.ts',
    'diagnostics/hosting-diagnostics.service.ts',
    'subscriptions/site-monitor.service.ts',
    'subscriptions/service-health.service.ts',
  ])('%s', async (plik) => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const kod = readFileSync(join(import.meta.dirname, '..', '..', plik), 'utf8');
    const wywolania = kod.split('tls.connect(').slice(1).map((r) => r.slice(0, 300));
    expect(wywolania.length).toBeGreaterThan(0);
    for (const w of wywolania) expect(w).toMatch(/lookup: bezpiecznyLookup/);
  });
});
