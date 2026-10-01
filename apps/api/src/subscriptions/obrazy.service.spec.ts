import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ObrazyService, wynikZLogu } from './obrazy.service.js';

/**
 * J-06 — skrypt węzła sprawdzony z jpegoptim i optipng (2026-09-25): 6 obrazów zoptymalizowanych jako
 * klient, dowiązanie do /etc/passwd pominięte, drugie uruchomienie nie bierze już przejrzanych plików,
 * nowy plik tak; katalog przez dowiązanie poza stronę → odmowa.
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
  return { svc: new ObrazyService(prisma as never, { record: vi.fn(async () => undefined) } as never, da as never), prisma };
}

describe('ObrazyService', () => {
  it('zadanie IMAGE_OPTIMIZE z katalogiem i metadanymi; zła ścieżka i drugie w toku odrzucone', async () => {
    const s = stanowisko();
    await s.svc.uruchom('s1', 'u1', { domain: 'A.pl', katalog: '/wp-content/uploads/', metadane: true });
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'IMAGE_OPTIMIZE',
        payload: { daUser: 'klient1', domain: 'a.pl', dir: 'wp-content/uploads', metadane: '1' },
      }),
    });
    await expect(s.svc.uruchom('s1', 'u1', { domain: 'a.pl', katalog: '../..', metadane: false })).rejects.toThrow(BadRequestException);
    await expect(stanowisko([], { id: 'x' }).svc.uruchom('s1', 'u1', { domain: 'a.pl', katalog: '', metadane: false })).rejects.toThrow(ConflictException);
  });

  it('wynik z ostatniego udanego zadania', async () => {
    expect(wynikZLogu('VERRIS_IMG=6 657755 628553 0\n')).toEqual({ plikow: 6, przed: 657755, po: 628553, zostalo: 0 });
    expect(wynikZLogu('VERRIS_IMG=x')).toBeNull();
    const d = new Date();
    const stan = await stanowisko([{ status: 'COMPLETED', payload: { dir: 'wp-content' }, outputLog: 'VERRIS_IMG=1 10 8 3\n', createdAt: d }]).svc.status('s1', 'u1', 'a.pl');
    expect(stan.ostatni).toMatchObject({ plikow: 1, przed: 10, po: 8, zostalo: 3, katalog: 'wp-content' });
  });

  it('skrypt węzła odrzuca złe dane', () => {
    const skrypt = join(import.meta.dirname, '../../../../ops/scripts/node-image-optimize.sh');
    const uruchom = (env: Record<string, string>) =>
      spawnSync('bash', [skrypt], { env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8' });
    expect(uruchom({ IO_DA_USER: "a'x", IO_DOMAIN: 'a.pl' }).stderr).toContain('nieprawidłowy login');
    expect(uruchom({ IO_DA_USER: 'klient1', IO_DOMAIN: 'a.pl', IO_DIR: '../etc' }).stderr).toContain('nieprawidłowy katalog');
    expect(uruchom({ IO_DA_USER: 'klient1', IO_DOMAIN: 'a.pl', IO_METADANE: '2' }).stderr).toContain('metadanych');
  });
  it('skrypt węzła pomija rdzeń WordPressa (wp-admin, wp-includes) — t1 01.10: verify-checksums', () => {
    const skrypt = readFileSync(join(import.meta.dirname, '../../../../ops/scripts/node-image-optimize.sh'), 'utf8');
    const find = /^\s*(find "\$IO_KATALOG" [^\n]*-printf "%T@ %s %p\\n")/m.exec(skrypt)![1];
    const dir = mkdtempSync(join(tmpdir(), 'io-'));
    const duzy = Buffer.alloc(5000, 1);
    for (const p of ['wp-admin/images', 'wp-includes/images', 'wp-content/uploads', 'blog/wp-admin']) mkdirSync(join(dir, p), { recursive: true });
    for (const p of ['wp-admin/images/a.png', 'wp-includes/images/b.png', 'wp-content/uploads/c.png', 'blog/wp-admin/d.jpg', 'e.jpg']) writeFileSync(join(dir, p), duzy);
    const r = spawnSync('bash', ['-c', `NOWSZE=(); ${find}`], { env: { PATH: process.env.PATH ?? '', IO_KATALOG: dir }, encoding: 'utf8' });
    const pliki = r.stdout.trim().split('\n').map((l) => l.split(' ').slice(2).join(' ').slice(dir.length + 1)).sort();
    expect(pliki).toEqual(['e.jpg', 'wp-content/uploads/c.png']);
  });
});
