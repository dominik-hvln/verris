import { AdresyWezlowRejestr } from '../../src/subscriptions/adresy-wezlow.rejestr.js';
import { resolvePublicHost } from '../../src/subscriptions/migration-net.util.js';
import { prisma, rozlacz, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * 09.10 — host „starego hostingu” w migratorze nie może wskazywać na nasz węzeł (Server.ipAddress,
 * Server.ipv6Address), niezależnie od VERRIS_CONTROL_PLANE_IPS. Rejestr czyta bazę przy każdym
 * sprawdzeniu, więc węzeł dodany po starcie API jest chroniony od razu.
 */
describe('SSRF migratora — adresy węzłów z bazy', () => {
  const rejestr = new AdresyWezlowRejestr(prisma() as never);
  beforeEach(async () => {
    await wyczyscBaze();
    rejestr.onModuleInit();
  });
  afterEach(() => rejestr.onModuleDestroy());
  afterAll(rozlacz);

  it('odrzuca IPv4 i IPv6 węzła (także węzła dodanego po starcie), przepuszcza inne publiczne', async () => {
    await expect(resolvePublicHost('8.8.4.4')).resolves.toBe('8.8.4.4');
    await utworzWezel({ ipAddress: '8.8.4.4', ipv6Address: '2001:4860:4860::8844', status: 'DEPROVISIONING' });
    await expect(resolvePublicHost('8.8.4.4')).rejects.toThrow('serwer Verris');
    await expect(resolvePublicHost('2001:4860:4860:0:0:0:0:8844')).rejects.toThrow('serwer Verris');
    await expect(resolvePublicHost('8.8.8.8')).resolves.toBe('8.8.8.8');
    await expect(resolvePublicHost('8.8.4.4', { wezly: 'dozwolone' })).resolves.toBe('8.8.4.4');
  });
});
