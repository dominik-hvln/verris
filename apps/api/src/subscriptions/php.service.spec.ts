import { BadRequestException, ConflictException } from '@nestjs/common';
import { PhpService } from './php.service.js';

/** P-6 / B-04 — zmiana wersji i rozszerzeń PHP zadaniem PHP_APPLY (CloudLinux selectorctl). */
function stanowisko(o: { phpVersion?: string | null; wToku?: unknown } = {}) {
  const account = { id: 'a1', userId: 'u1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1', domain: 'a.pl', phpVersion: o.phpVersion === undefined ? '8.3' : o.phpVersion };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    account: { findUnique: vi.fn(async () => account), update: vi.fn(async () => account) },
    nodeTask: {
      findFirst: vi.fn(async () => o.wToku ?? null),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const settings = { getAvailablePhpVersions: vi.fn(async () => ['8.2', '8.3']) };
  return { svc: new PhpService(prisma as never, audit as never, settings as never), prisma, audit };
}
const payload = (s: ReturnType<typeof stanowisko>) =>
  (s.prisma.nodeTask.create.mock.calls[0] as unknown as [{ data: { payload: Record<string, unknown> } }])[0].data.payload;

describe('PhpService — rozszerzenia (B-04)', () => {
  it('zleca PHP_APPLY z listami dla bieżącej wersji konta i wpisem w dzienniku', async () => {
    const s = stanowisko();
    await s.svc.setExtensionsForSubscription('s1', 'u1', { enable: ['Intl', 'intl', 'imagick'], disable: ['xsl'] });
    expect(payload(s)).toEqual({ daUser: 'klient1', domain: 'a.pl', version: '8.3', extEnable: 'intl,imagick', extDisable: 'xsl' });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PHP_EXTENSIONS_CHANGE_QUEUED' }));
  });

  it.each([
    [{}],
    [{ enable: ['intl;rm -rf'] }],
    [{ enable: ['intl'], disable: ['intl'] }],
    [{ enable: Array.from({ length: 31 }, (_, i) => `e${i}`) }],
  ])('odrzuca %j bez zadania', async (wej) => {
    const s = stanowisko();
    await expect(s.svc.setExtensionsForSubscription('s1', 'u1', wej)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.prisma.nodeTask.create).not.toHaveBeenCalled();
  });

  it('bez wersji na koncie bierze wersję z odczytu selektora, ale tylko z listy dostępnych', async () => {
    const s = stanowisko({ phpVersion: null });
    await s.svc.setExtensionsForSubscription('s1', 'u1', { enable: ['intl'], version: '8.2' });
    expect(payload(s).version).toBe('8.2');
    await expect(stanowisko({ phpVersion: null }).svc.setExtensionsForSubscription('s1', 'u1', { enable: ['intl'], version: '5.6' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(stanowisko({ phpVersion: null }).svc.setExtensionsForSubscription('s1', 'u1', { enable: ['intl'] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('zmiana w toku → 409; zmiana samej wersji nie dokłada list rozszerzeń', async () => {
    await expect(stanowisko({ wToku: { id: 'x' } }).svc.setExtensionsForSubscription('s1', 'u1', { enable: ['intl'] })).rejects.toBeInstanceOf(ConflictException);
    const s = stanowisko();
    await s.svc.setVersionForSubscription('s1', 'u1', '8.2');
    expect(payload(s)).toEqual({ daUser: 'klient1', domain: 'a.pl', version: '8.2' });
  });
});
