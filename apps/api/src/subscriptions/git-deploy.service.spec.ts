import { BadRequestException } from '@nestjs/common';
import { GitDeployService } from './git-deploy.service';

/**
 * C-25/C-26 — skrypt węzła sprawdzony lokalnie: klucz ed25519 0600 jako klient, pull --ff-only z HEAD,
 * odmowa dla file://, gałęzi zaczynającej się od „-” i katalogu z „..”.
 */
function stanowisko(zadania: unknown[] = []) {
  const account = { id: 'a1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: jest.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    nodeTask: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => zadania),
      create: jest.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  const da = { assertDomainOwnedBySubscription: jest.fn(async (_s: string, _u: string, d: string) => d) };
  return { svc: new GitDeployService(prisma as never, { record: jest.fn(async () => undefined) } as never, da as never), prisma };
}

describe('GitDeployService', () => {
  it('klonowanie: adres i gałąź do zadania; odmowy dla file://, opcji jako gałęzi i ścieżki z ..', async () => {
    const s = stanowisko();
    await s.svc.zlec('s1', 'u1', 'clone', { domain: 'a.pl', url: 'git@github.com:firma/strona.git', branch: 'main', dir: 'app' });
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'GIT_DEPLOY', payload: { mode: 'clone', daUser: 'klient1', domain: 'a.pl', dir: 'app', url: 'git@github.com:firma/strona.git', branch: 'main' } }),
    });
    await expect(s.svc.zlec('s1', 'u1', 'clone', { domain: 'a.pl', url: 'file:///etc' })).rejects.toThrow(BadRequestException);
    await expect(s.svc.zlec('s1', 'u1', 'clone', { domain: 'a.pl', url: 'https://github.com/a/b', branch: '--upload-pack=x' })).rejects.toThrow(BadRequestException);
    await expect(s.svc.zlec('s1', 'u1', 'pull', { domain: 'a.pl', dir: '../..' })).rejects.toThrow(BadRequestException);
  });

  it('stan: klucz z ostatniego zadania key, operacje tej domeny z HEAD i kopią', async () => {
    const d = new Date();
    const s = stanowisko([
      { id: 'p', status: 'COMPLETED', payload: { mode: 'clone', domain: 'a.pl', dir: '', url: 'https://g/x' }, outputLog: 'VERRIS_GIT_KOPIA=domains/a.pl/public_html.verris-przed-git-20260924-200000\nVERRIS_GIT_HEAD=2c52f83 trzeci\n', createdAt: d },
      { id: 'k', status: 'COMPLETED', payload: { mode: 'key', domain: 'a.pl' }, outputLog: 'VERRIS_GIT_KLUCZ=ssh-ed25519 AAAAC3Nz verris-deploy@a.pl\n', createdAt: d },
    ]);
    const r = await s.svc.status('s1', 'u1', 'a.pl');
    expect(r.klucz).toBe('ssh-ed25519 AAAAC3Nz verris-deploy@a.pl');
    expect(r.operacje[0]).toMatchObject({ tryb: 'clone', head: '2c52f83 trzeci', kopia: 'domains/a.pl/public_html.verris-przed-git-20260924-200000' });
  });
});
