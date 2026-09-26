import { BadRequestException } from '@nestjs/common';
import { GitDeployService } from './git-deploy.service.js';

/**
 * C-25/C-26 — skrypt węzła sprawdzony lokalnie: klucz ed25519 0600 jako klient, pull --ff-only z HEAD,
 * odmowa dla file://, gałęzi zaczynającej się od „-” i katalogu z „..”.
 */
function stanowisko(zadania: unknown[] = []) {
  const account = { id: 'a1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    gitWebhook: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => undefined),
      deleteMany: vi.fn(async () => undefined),
      findUnique: vi.fn(async () => null as unknown),
      update: vi.fn(async () => undefined),
    },
    nodeTask: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => zadania),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  const da = { assertDomainOwnedBySubscription: vi.fn(async (_s: string, _u: string, d: string) => d) };
  const config = { get: vi.fn(() => 'https://api.verris.pl/') };
  return { svc: new GitDeployService(prisma as never, { record: vi.fn(async () => undefined) } as never, da as never, config as never), prisma };
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

describe('GitDeployService — webhook (C-27)', () => {
  it('adres z tokenem pokazany raz, w bazie tylko skrót; wywołanie kolejkuje pull bez osoby zlecającej', async () => {
    const s = stanowisko();
    const r = await s.svc.utworzWebhook('s1', 'u1', { domain: 'a.pl', dir: 'app' });
    const token = r.url.split('/hooks/git/')[1];
    expect(r.url.startsWith('https://api.verris.pl/hooks/git/')).toBe(true);
    const zapis = (s.prisma.gitWebhook.upsert.mock.calls[0] as unknown as [{ create: { tokenHash: string; dir: string } }])[0].create;
    expect(zapis.tokenHash).not.toContain(token);
    expect(zapis.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(zapis.dir).toBe('app');

    s.prisma.gitWebhook.findUnique.mockResolvedValueOnce({ id: 'w1', accountId: 'a1', domain: 'a.pl', dir: 'app', account: { status: 'ACTIVE', serverId: 'n1', daUsername: 'klient1' } });
    expect(await s.svc.wyzwolWebhook(token)).toBe(true);
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ requestedById: null, payload: expect.objectContaining({ mode: 'pull', domain: 'a.pl', dir: 'app', webhook: true }) }),
    });
  });

  it('nieznany albo zniekształcony token → false (404), bez zadania', async () => {
    const s = stanowisko();
    expect(await s.svc.wyzwolWebhook('x')).toBe(false);
    expect(await s.svc.wyzwolWebhook('a'.repeat(32))).toBe(false);
    expect(s.prisma.nodeTask.create).not.toHaveBeenCalled();
  });
});
