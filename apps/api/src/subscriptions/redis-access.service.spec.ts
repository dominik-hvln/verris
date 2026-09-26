import { ConflictException } from '@nestjs/common';
import { RedisAccessService, gniazdoZLogu } from './redis-access.service.js';

/**
 * D-15/J-03 — skrypt węzła sprawdzony lokalnie: gniazdo 0700 tylko dla konta (inny użytkownik →
 * Permission denied), konfiguracja roota, CONFIG wyłączone (klient nie podniesie limitu), bez portu TCP.
 */
function stanowisko(opts: { zadania?: unknown[]; wToku?: boolean } = {}) {
  const account = { id: 'a1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    nodeTask: {
      findFirst: vi.fn(async () => (opts.wToku ? { id: 'x' } : null)),
      findMany: vi.fn(async () => opts.zadania ?? []),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  return { svc: new RedisAccessService(prisma as never, { record: vi.fn(async () => undefined) } as never), prisma };
}

describe('RedisAccessService', () => {
  it('włączenie: zadanie REDIS_ACCESS z limitem pamięci; drugie w toku → 409', async () => {
    const s = stanowisko();
    await s.svc.przelacz('s1', 'u1', true);
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'REDIS_ACCESS', payload: { mode: 'enable', daUser: 'klient1', memoryMb: '64' } }),
    });
    await expect(stanowisko({ wToku: true }).svc.przelacz('s1', 'u1', false)).rejects.toThrow(ConflictException);
  });

  it('stan z ostatniej udanej zmiany; gniazdo tylko w katalogu konta', async () => {
    const d = new Date();
    const s = stanowisko({
      zadania: [{ status: 'COMPLETED', payload: { mode: 'enable' }, outputLog: 'VERRIS_REDIS_SOCKET=/home/klient1/.verris-redis/redis.sock\n', createdAt: d }],
    });
    expect(await s.svc.status('s1', 'u1')).toMatchObject({ wlaczony: true, gniazdo: '/home/klient1/.verris-redis/redis.sock' });
    expect(gniazdoZLogu('VERRIS_REDIS_SOCKET=/tmp/x.sock')).toBeNull();
  });

  it('D-16 Memcached tym samym torem: własny rodzaj zadania i gniazdo w ~/.verris-memcached', async () => {
    const s = stanowisko();
    await s.svc.przelacz('s1', 'u1', true, 'memcached');
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'MEMCACHED_ACCESS' }) });
    expect(gniazdoZLogu('VERRIS_MEMCACHED_SOCKET=/home/klient1/.verris-memcached/memcached.sock', 'memcached')).toBe('/home/klient1/.verris-memcached/memcached.sock');
    expect(gniazdoZLogu('VERRIS_REDIS_SOCKET=/home/klient1/.verris-redis/redis.sock', 'memcached')).toBeNull();
  });
});
