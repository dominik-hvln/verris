import { afterEach, describe, expect, it } from 'vitest';
import { resolvePublicHost, ustawZrodloAdresowWezlow } from './migration-net.util.js';

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

/**
 * 09.10 — adresy węzłów z bazy (Server.ipAddress / ipv6Address) są zakazane dla hosta źródła
 * migracji niezależnie od VERRIS_CONTROL_PLANE_IPS: zapora węzła wpuszcza control-plane na :2222,
 * SSH i MariaDB, więc „stary hosting” wskazujący na węzeł otwierałby klientowi te porty.
 */
describe('resolvePublicHost — adresy węzłów z bazy', () => {
  const env = { cp: process.env.VERRIS_CONTROL_PLANE_IPS, node: process.env.NODE_ENV };
  afterEach(() => {
    ustawZrodloAdresowWezlow(null);
    if (env.cp === undefined) delete process.env.VERRIS_CONTROL_PLANE_IPS;
    else process.env.VERRIS_CONTROL_PLANE_IPS = env.cp;
    process.env.NODE_ENV = env.node;
  });

  it.each(['8.8.4.4', '::ffff:8.8.4.4', '2001:4860:4860::8844', '2001:4860:4860:0:0:0:0:8844'])(
    'odrzuca %s (adres węzła), także bez VERRIS_CONTROL_PLANE_IPS',
    async (ip) => {
      delete process.env.VERRIS_CONTROL_PLANE_IPS;
      ustawZrodloAdresowWezlow(async () => ['8.8.4.4', '2001:4860:4860::8844', null, ' ']);
      await expect(resolvePublicHost(ip)).rejects.toThrow('serwer Verris');
    },
  );

  it('inny publiczny adres przechodzi; lista czytana przy każdym sprawdzeniu (nowy węzeł bez restartu)', async () => {
    let wezly = ['8.8.4.4'];
    ustawZrodloAdresowWezlow(async () => wezly);
    await expect(resolvePublicHost('1.1.1.1')).resolves.toBe('1.1.1.1');
    wezly = ['8.8.4.4', '1.1.1.1'];
    await expect(resolvePublicHost('1.1.1.1')).rejects.toThrow('serwer Verris');
  });

  it("sonda strony klienta (wezly: 'dozwolone') łączy się z węzłem — strona hostowana u nas", async () => {
    ustawZrodloAdresowWezlow(async () => ['8.8.4.4']);
    await expect(resolvePublicHost('8.8.4.4', { wezly: 'dozwolone' })).resolves.toBe('8.8.4.4');
    await expect(resolvePublicHost('127.0.0.1', { wezly: 'dozwolone' })).rejects.toThrow('prywatną');
  });

  it('produkcja bez źródła adresów węzłów — odmowa (fail-closed), dev/test — pusta lista', async () => {
    process.env.NODE_ENV = 'production';
    await expect(resolvePublicHost('8.8.8.8')).rejects.toThrow('spróbuj ponownie');
    process.env.NODE_ENV = 'test';
    await expect(resolvePublicHost('8.8.8.8')).resolves.toBe('8.8.8.8');
  });
});
