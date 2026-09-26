import { ConflictException } from '@nestjs/common';
import { PhpInfoService, konfiguracjaZLogu } from './php-info.service.js';

/**
 * B-06 — skrypt węzła sprawdzony lokalnie (serwer PHP): plik o losowej nazwie w katalogu strony,
 * odczyt przez 127.0.0.1 z nagłówkiem Host, plik znika także przy błędzie.
 */
function stanowisko(zadania: unknown[] = [], wToku: unknown = null) {
  const account = { id: 'a1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    nodeTask: {
      findFirst: vi.fn(async () => wToku),
      findMany: vi.fn(async () => zadania),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  const da = { assertDomainOwnedBySubscription: vi.fn(async (_s: string, _u: string, d: string) => d.toLowerCase()) };
  return { svc: new PhpInfoService(prisma as never, da as never), prisma };
}

describe('PhpInfoService', () => {
  it('zleca odczyt dla domeny konta; drugi w toku → 409', async () => {
    const s = stanowisko();
    await s.svc.sprawdz('s1', 'u1', 'A.pl');
    const d = (s.prisma.nodeTask.create.mock.calls[0] as unknown as [{ data: { kind: string; payload: unknown } }])[0].data;
    expect(d.kind).toBe('PHP_INFO');
    expect(d.payload).toEqual({ daUser: 'klient1', domain: 'a.pl' });
    await expect(stanowisko([], { id: 'x' }).svc.sprawdz('s1', 'u1', 'a.pl')).rejects.toThrow(ConflictException);
  });

  it('konfiguracja z ostatniego udanego odczytu; śmieci w logu → null', async () => {
    const b = Buffer.from(JSON.stringify({ wersja: '8.3.12', sapi: 'litespeed', ini: { memory_limit: '256M', x: 5 }, rozszerzenia: ['curl', 7, 'intl'] })).toString('base64');
    const s = stanowisko([{ status: 'COMPLETED', outputLog: `VERRIS_PHPINFO=${b}\n`, createdAt: new Date(), completedAt: new Date() }]);
    const r = await s.svc.status('s1', 'u1', 'a.pl');
    expect(r.konfiguracja).toEqual({ wersja: '8.3.12', sapi: 'litespeed', ini: { memory_limit: '256M', x: null }, rozszerzenia: ['curl', 'intl'], selektor: null });
    expect(konfiguracjaZLogu('VERRIS_PHPINFO=e30=')).toBeNull();
  });

  it('B-04: rozszerzenia selektora CloudLinux z odczytu; śmieciowe wpisy odrzucone', () => {
    const b = Buffer.from(
      JSON.stringify({
        wersja: '8.3.12',
        selektor: { wersja: '8.3', rozszerzenia: [{ nazwa: 'intl', stan: 'on' }, { nazwa: 'Core', stan: 'wbudowane' }, { nazwa: 'x', stan: '?' }, 5] },
      }),
    ).toString('base64');
    expect(konfiguracjaZLogu(`VERRIS_PHPINFO=${b}`)?.selektor).toEqual({
      wersja: '8.3',
      rozszerzenia: [{ nazwa: 'intl', stan: 'on' }, { nazwa: 'Core', stan: 'wbudowane' }],
    });
  });
});
