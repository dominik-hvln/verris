import { spawnSync } from 'child_process';
import { join } from 'path';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PgsqlService, bazyZLogu } from './pgsql.service.js';
import { bezSekretow } from '../servers/node-tasks.service.js';

/**
 * D-14 — skrypt węzła sprawdzony na prawdziwym PostgreSQL 16 (2026-09-25): rola na bazę, brak CONNECT do
 * cudzej bazy i do `postgres`, brak CREATE DATABASE, złe hasło odrzucone, zrzut zapisany jako właściciel
 * konta (symlink ~/.verris-pgsql → /etc nic nie zapisał), hook DA usuwa bazy i role tylko tego loginu.
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
  const audit = { record: vi.fn(async () => undefined) };
  return { svc: new PgsqlService(prisma as never, audit as never), prisma, audit };
}

const lista = (...bazy: string[]) => [
  { status: 'COMPLETED', outputLog: bazy.map((b) => `VERRIS_PGSQL_DB=${b} 7520783`).join('\n') + '\n[pgsql] Gotowe.\n', createdAt: new Date() },
];

describe('PgsqlService', () => {
  it('nowa baza: zadanie PGSQL z hasłem, nazwa <login>_<sufiks>, hasło w odpowiedzi', async () => {
    const s = stanowisko({ zadania: lista() });
    const w = await s.svc.utworz('s1', 'u1', 'sklep');
    expect(w.nowa).toMatchObject({ nazwa: 'klient1_sklep', uzytkownik: 'klient1_sklep', host: '127.0.0.1', port: 5432 });
    expect(w.nowa.haslo).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'PGSQL',
        payload: { mode: 'create', daUser: 'klient1', db: 'sklep', max: '5', pass: w.nowa.haslo },
      }),
    });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_PGSQL_CREATE_QUEUED' }));
  });

  it('odmowy: zła nazwa, duplikat, limit, usuwanie nieistniejącej, zmiana w toku', async () => {
    await expect(stanowisko().svc.utworz('s1', 'u1', "x';drop")).rejects.toThrow(BadRequestException);
    await expect(stanowisko({ zadania: lista('klient1_sklep') }).svc.utworz('s1', 'u1', 'sklep')).rejects.toThrow(ConflictException);
    const piec = lista('klient1_a', 'klient1_b', 'klient1_c', 'klient1_d', 'klient1_e');
    await expect(stanowisko({ zadania: piec }).svc.utworz('s1', 'u1', 'f')).rejects.toThrow(/Limit/);
    await expect(stanowisko({ zadania: lista() }).svc.usun('s1', 'u1', 'sklep')).rejects.toThrow(NotFoundException);
    await expect(stanowisko({ zadania: lista(), wToku: true }).svc.odswiez('s1', 'u1')).rejects.toThrow(ConflictException);
  });

  it('lista z ostatniego udanego zadania; cudze i zniekształcone wiersze odrzucone', async () => {
    expect(bazyZLogu('VERRIS_PGSQL_DB=klient1_sklep 100\nVERRIS_PGSQL_DB=../etc 5\nVERRIS_PGSQL_DB=Zly_x 1\n')).toEqual([
      { nazwa: 'klient1_sklep', rozmiar: 100 },
    ]);
    const stan = await stanowisko({ zadania: lista('klient1_sklep') }).svc.status('s1', 'u1');
    expect(stan).toMatchObject({ bazy: [{ nazwa: 'klient1_sklep', rozmiar: 7520783 }], limit: 5, blad: null });
  });

  it('hasła nie zostają w payloadzie zadania ani w panelu administratora', () => {
    expect(bezSekretow({ mode: 'create', db: 'sklep', pass: 'tajne', dbPass: 'x', adminPass: 'y', keysB64: 'k' })).toEqual({
      mode: 'create', db: 'sklep', pass: '••••••', dbPass: '••••••', adminPass: '••••••', keysB64: 'k',
    });
    expect(bezSekretow(null)).toBeNull();
  });

  it('skrypt węzła odrzuca złe dane, zanim dotknie bazy', () => {
    const skrypt = join(import.meta.dirname, '../../../../ops/scripts/node-pgsql.sh');
    const uruchom = (env: Record<string, string>) =>
      spawnSync('bash', [skrypt], { env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8' });
    expect(uruchom({ PG_MODE: 'drop', PG_DA_USER: 'klient1' }).stderr).toContain('nieznany tryb');
    expect(uruchom({ PG_MODE: 'list', PG_DA_USER: "a'; drop" }).stderr).toContain('nieprawidłowy login');
    expect(uruchom({ PG_MODE: 'list', PG_DA_USER: 'klient1', PG_MAX: 'x' }).stderr).toContain('limit');
  });
});
