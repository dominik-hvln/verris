import { afterEach, describe, expect, it } from 'vitest';
import { resolvePublicHost } from './migration-net.util.js';

/**
 * Z-09 (08.10): API (discovery, test dostępów migracji, sondy stron) łączy się z hostem klienta
 * Z CONTROL-PLANE'U. Jego własny publiczny adres to połączenie lokalne, z pominięciem zapory —
 * tak samo zakazane jak 127.0.0.1. Adresy control-plane: VERRIS_CONTROL_PLANE_IPS (adresy i sieci).
 */
describe('resolvePublicHost — adresy control-plane', () => {
  const poprzednie = process.env.VERRIS_CONTROL_PLANE_IPS;
  afterEach(() => {
    if (poprzednie === undefined) delete process.env.VERRIS_CONTROL_PLANE_IPS;
    else process.env.VERRIS_CONTROL_PLANE_IPS = poprzednie;
  });

  it.each(['8.8.4.4', '::ffff:8.8.4.4', '2001:4860:4860::8844', '2001:4860:4860:0:0:0:0:1'])('odrzuca %s z listy control-plane', async (ip) => {
    process.env.VERRIS_CONTROL_PLANE_IPS = '8.8.4.4,2001:4860:4860::/64';
    await expect(resolvePublicHost(ip)).rejects.toThrow('serwer Verris');
  });

  it('inny publiczny adres przechodzi', async () => {
    process.env.VERRIS_CONTROL_PLANE_IPS = '8.8.4.4,2001:4860:4860::/64';
    await expect(resolvePublicHost('8.8.8.8')).resolves.toBe('8.8.8.8');
  });

  it('bez listy control-plane działa jak dotąd', async () => {
    delete process.env.VERRIS_CONTROL_PLANE_IPS;
    await expect(resolvePublicHost('8.8.4.4')).resolves.toBe('8.8.4.4');
  });
});
