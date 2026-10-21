import { BadRequestException } from '@nestjs/common';
import { GitDeployService, MAKS_ZMIENNYCH, plikEnv, wynikWdrozenia } from './git-deploy.service.js';
import { zmienneWdrozeniaUsuniete } from '../servers/node-tasks.service.js';

/**
 * C-25/C-26 — skrypt węzła sprawdzony lokalnie: klucz ed25519 0600 jako klient, pull --ff-only z HEAD,
 * odmowa dla file://, gałęzi zaczynającej się od „-” i katalogu z „..”.
 */
function stanowisko(zadania: unknown[] = [], konfiguracja: Record<string, unknown> | null = null) {
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
    gitKonfiguracja: {
      findUnique: vi.fn(async () => konfiguracja as unknown),
      findMany: vi.fn(async () => (konfiguracja ? [konfiguracja] : []) as unknown[]),
      upsert: vi.fn(async () => undefined),
    },
    nodeTask: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => zadania),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  const da = { assertDomainOwnedBySubscription: vi.fn(async (_s: string, _u: string, d: string) => d) };
  const config = { get: vi.fn(() => 'https://api.verris.pl/') };
  // atrapa szyfrowania: odwracalna i widocznie różna od jawnego tekstu
  const crypto = { encrypt: vi.fn((t: string) => `enc:${Buffer.from(t).toString('base64')}`), decrypt: vi.fn((t: string) => Buffer.from(t.slice(4), 'base64').toString()) };
  const audit = { record: vi.fn(async () => undefined) };
  return { svc: new GitDeployService(prisma as never, audit as never, da as never, config as never, crypto as never), prisma, crypto, audit };
}

describe('GitDeployService', () => {
  it('klonowanie: adres i gałąź do zadania; odmowy dla file://, opcji jako gałęzi i ścieżki z ..', async () => {
    const s = stanowisko();
    await s.svc.zlec('s1', 'u1', 'clone', { domain: 'a.pl', url: 'git@github.com:firma/strona.git', branch: 'main', dir: 'app' });
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'GIT_DEPLOY', payload: { mode: 'clone', daUser: 'klient1', domain: 'a.pl', dir: 'app', url: 'git@github.com:firma/strona.git', branch: 'main', build: '' } }),
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

describe('GitDeployService — budowanie i zmienne środowiskowe (21.10)', () => {
  const zaszyfrowane = (z: Record<string, string>) => `enc:${Buffer.from(JSON.stringify(z)).toString('base64')}`;

  it('zapis: budowanie i zmienne zaszyfrowane; do dziennika i do panelu tylko nazwy, nigdy wartości', async () => {
    const s = stanowisko([], { dir: 'app', budowanie: '', zmienneEnc: zaszyfrowane({ STARY: 'x', DB_PASS: 'stare' }), updatedAt: new Date() });
    await s.svc.ustawKonfiguracje('s1', 'u1', { domain: 'a.pl', dir: 'app', budowanie: 'npm-build', zmienne: { ustaw: { DB_PASS: 'tajne-haslo' }, usun: ['STARY'] } });
    const zapis = (s.prisma.gitKonfiguracja.upsert.mock.calls[0] as unknown as [{ update: { budowanie: string; zmienneEnc: string } }])[0].update;
    expect(zapis.budowanie).toBe('npm-build');
    expect(zapis.zmienneEnc).not.toContain('tajne-haslo');
    expect(JSON.parse(s.crypto.decrypt(zapis.zmienneEnc))).toEqual({ DB_PASS: 'tajne-haslo' });
    const dziennik = JSON.stringify(s.audit.record.mock.calls);
    expect(dziennik).toContain('DB_PASS');
    expect(dziennik).not.toContain('tajne-haslo');
    const stan = await s.svc.status('s1', 'u1', 'a.pl');
    expect(stan.konfiguracje[0]).toMatchObject({ katalog: 'app', zmienne: ['DB_PASS', 'STARY'] });
    expect(JSON.stringify(stan)).not.toMatch(/stare|tajne/);
  });

  it('odmowy: zła nazwa, nowa linia w wartości, za długa wartość, za dużo zmiennych, nieznany sposób budowania', async () => {
    const s = stanowisko();
    const zle = [
      { budowanie: '', zmienne: { ustaw: { 'api-key': '1' } } },
      { budowanie: '', zmienne: { ustaw: { API_KEY: 'a\nB=2' } } },
      { budowanie: '', zmienne: { ustaw: { API_KEY: 'x'.repeat(4097) } } },
      { budowanie: '', zmienne: { ustaw: Object.fromEntries(Array.from({ length: MAKS_ZMIENNYCH + 1 }, (_, i) => [`Z${i}`, '1'])) } },
      { budowanie: 'rm -rf' },
    ];
    for (const z of zle) await expect(s.svc.ustawKonfiguracje('s1', 'u1', { domain: 'a.pl', ...z })).rejects.toThrow(BadRequestException);
    expect(s.prisma.gitKonfiguracja.upsert).not.toHaveBeenCalled();
  });

  it('clone, pull i webhook niosą sposób budowania i .env (base64); zadanie key — nic', async () => {
    const konf = { dir: '', budowanie: 'composer', zmienneEnc: zaszyfrowane({ APP_KEY: 'base64:abc=', NAZWA: 'Moja firma' }), updatedAt: new Date() };
    const s = stanowisko([], konf);
    await s.svc.zlec('s1', 'u1', 'pull', { domain: 'a.pl' });
    const payload = (s.prisma.nodeTask.create.mock.calls.at(-1) as unknown as [{ data: { payload: { build: string; envSecret: string } } }])[0].data.payload;
    expect(payload).toMatchObject({ build: 'composer', envMode: 'panel' });
    expect(Buffer.from(payload.envSecret, 'base64').toString()).toBe("APP_KEY='base64:abc='\nNAZWA='Moja firma'");
    await s.svc.zlec('s1', 'u1', 'key', { domain: 'a.pl' });
    expect((s.prisma.nodeTask.create.mock.calls.at(-1) as unknown as [{ data: { payload: Record<string, unknown> } }])[0].data.payload).not.toHaveProperty('build');

    s.prisma.gitWebhook.findUnique.mockResolvedValueOnce({ id: 'h', accountId: 'a1', domain: 'a.pl', dir: '', account: { status: 'ACTIVE', serverId: 'n1', daUsername: 'klient1' } });
    await s.svc.wyzwolWebhook('A'.repeat(32));
    const zWebhooka = (s.prisma.nodeTask.create.mock.calls.at(-1) as unknown as [{ data: { payload: Record<string, unknown> } }])[0].data.payload;
    expect(zWebhooka).toMatchObject({ webhook: true, build: 'composer' });
    expect(typeof zWebhooka.envSecret).toBe('string');
  });

  it('.env: wartości proste wprost, ze spacją w apostrofach, z apostrofem w cudzysłowie', () => {
    expect(plikEnv({ B: 'https://a.pl/x', A: 'ma spację $HOME', C: "it's \"ok\" \\" })).toBe(
      "A='ma spację $HOME'\nB=https://a.pl/x\nC=\"it's \\\"ok\\\" \\\\\"",
    );
  });

  it('wynik z logu: ok/błąd/czas; zlecone budowanie na starym skrypcie → wyraźny błąd zamiast „udało się”', () => {
    expect(wynikWdrozenia('COMPLETED' as never, 'npm-build', 'VERRIS_GIT_ENV=3\nVERRIS_GIT_BUILD_S=41\nVERRIS_GIT_BUILD=ok\n')).toEqual({ budowanie: 'ok', zmienne: 3, uwaga: null });
    expect(wynikWdrozenia('FAILED' as never, 'npm-build', 'VERRIS_GIT_ENV=brak\nVERRIS_GIT_BUILD=blad\n')).toMatchObject({ budowanie: 'blad', zmienne: null });
    expect(wynikWdrozenia('COMPLETED' as never, '', 'VERRIS_GIT_HEAD=abc x\n')).toMatchObject({ budowanie: 'brak', uwaga: null });
    const stary = wynikWdrozenia('COMPLETED' as never, 'composer', 'VERRIS_GIT_HEAD=abc x\n');
    expect(stary.budowanie).toBe('blad');
    expect(stary.uwaga).toMatch(/nie obsługuje jeszcze budowania/);
  });

  it('po porażce zadania znika tylko envSecret — reszta payloadu zostaje do „Ponów”', () => {
    expect(zmienneWdrozeniaUsuniete({ mode: 'pull', envSecret: 'QT0x', build: 'npm-ci' })).toEqual({ payload: { mode: 'pull', build: 'npm-ci' } });
    expect(zmienneWdrozeniaUsuniete({ dbPass: 'x' })).toEqual({});
    expect(zmienneWdrozeniaUsuniete(null)).toEqual({});
  });
});
