import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Global, Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy.js';
import { MailerService } from '../../src/mail/mailer.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter.js';
import { ZadaniaWTleModule } from '../../src/zadania-w-tle/zadania-w-tle.module.js';
import { ZadaniaWTleService } from '../../src/zadania-w-tle/zadania-w-tle.service.js';
import type { StanZadania } from '../../src/zadania-w-tle/zadania-w-tle.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * F2.8 (OJ-01) — rejestr zadań w tle na prawdziwym PostgreSQL: ostatni przebieg i ostatni błąd (zapytanie LATERAL),
 * alert o zaległym zadaniu najwyżej raz na dobę, retencja 30 dni, strażnicy HTTP (odczyt NODES_VIEW, ręczne — ADMIN).
 */
const SEKRET = 'test-sekret-zadania';
const jwt = new JwtService({ secret: SEKRET });
const MIGRACJA = resolve(import.meta.dirname, '../../../../libs/database/prisma/migrations/20261010200000_przebiegi_zadan_w_tle/migration.sql');
const maile: Array<{ to: string; subject: string }> = [];

@Global()
@Module({
  providers: [
    AuditService,
    { provide: PrismaService, useFactory: () => prisma() },
    { provide: JwtService, useValue: jwt },
    { provide: ConfigService, useValue: { get: (k: string) => (k === 'adminPanelUrl' ? 'https://admin.test' : SEKRET) } },
    { provide: MailerService, useValue: { send: async (m: { to: string; subject: string }) => (maile.push(m), { delivered: true }) } },
  ],
  exports: [AuditService, PrismaService, JwtService, ConfigService, MailerService],
})
class Zaleznosci {}

@Module({ imports: [Zaleznosci, PassportModule, ZadaniaWTleModule], providers: [JwtStrategy] })
class Aplikacja {}

let app: INestApplication;
let url: string;
const STRAZNIK = 'ZadaniaWTleService.sprawdzZalegle';
const RETENCJA = 'ZadaniaWTleService.retencja';

async function zadanie(metoda: 'GET' | 'POST', sciezka: string, kto: { id: string; role: string }) {
  const r = await fetch(url + sciezka, {
    method: metoda,
    headers: { Authorization: `Bearer ${jwt.sign({ sub: kto.id, email: 'x', role: kto.role, purpose: 'access' }, { expiresIn: 60 })}` },
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as unknown };
}
const t = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
async function operator(uprawnienia: string[]) {
  const z = t();
  const r = await prisma().staffRole.create({ data: { name: `rola-${z}`, permissions: uprawnienia } });
  const u = await prisma().user.create({ data: { email: `op-${z}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
  await prisma().staffRoleAssignment.create({ data: { userId: u.id, roleId: r.id } });
  return { id: u.id, role: 'STAFF' };
}
const admin = async () => {
  const u = await prisma().user.create({ data: { email: `adm-${t()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN', firstName: 'Ala' } });
  return { id: u.id, role: 'ADMIN' };
};
const przebieg = (job: string, start: string, ok: boolean, error: string | null = null) =>
  prisma().scheduledJobRun.create({ data: { job, startedAt: new Date(start), finishedAt: new Date(Date.parse(start) + 1500), durationMs: 1500, ok, error } });

describe('F2.8 — zadania w tle (PostgreSQL)', () => {
  beforeAll(async () => {
    // Migracja jest idempotentna (IF NOT EXISTS) — nakładamy ją, gdyby baza testowa była sprzed F2.8.
    await prisma().$executeRawUnsafe(readFileSync(MIGRACJA, 'utf-8'));
    app = await NestFactory.create(Aplikacja, { logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await rozlacz();
  });
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().scheduledJobRun.deleteMany({});
    await prisma().auditLog.deleteMany({ where: { action: { startsWith: 'ZADANIE_W_TLE_' } } });
    maile.length = 0;
  });

  it('widok: ostatni przebieg i ostatni błąd osobno; ręczne tylko dla ADMIN-a; STAFF bez NODES_VIEW — 403', async () => {
    await przebieg(RETENCJA, '2026-10-08T03:50:00Z', false, 'deadlock detected');
    await przebieg(RETENCJA, '2026-10-09T03:50:00Z', true);
    await przebieg(RETENCJA, '2026-10-10T03:50:00Z', true);
    const a = await admin();
    const noc = await operator(['NODES_VIEW']);
    const bez = await operator(['CUSTOMERS_VIEW']);

    const r = await zadanie('GET', '/admin/zadania-w-tle', a);
    expect(r.status).toBe(200);
    const lista = r.body as StanZadania[];
    const ret = lista.find((z) => z.klucz === RETENCJA)!;
    expect(ret.ostatni).toMatchObject({ start: '2026-10-10T03:50:00.000Z', ok: true, czasMs: 1500, reczne: false });
    expect(ret.ostatniBlad).toEqual({ start: '2026-10-08T03:50:00.000Z', blad: 'deadlock detected' });
    expect(ret).toMatchObject({ nazwa: 'zadania-w-tle:retencja', harmonogram: '50 3 * * *', mozeUruchomic: false });
    expect(ret.nastepny).not.toBeNull();
    expect(lista.find((z) => z.klucz === STRAZNIK)).toMatchObject({ ostatni: null, mozeUruchomic: true });

    const n = await zadanie('GET', '/admin/zadania-w-tle', noc);
    expect(n.status).toBe(200);
    expect((n.body as StanZadania[]).every((z) => !z.mozeUruchomic)).toBe(true);
    expect((await zadanie('GET', '/admin/zadania-w-tle', bez)).status).toBe(403);
  });

  it('ręczne uruchomienie: STAFF — 403, zadanie spoza białej listy — 403, z listy — 202 i przebieg z manualBy', async () => {
    const a = await admin();
    const noc = await operator(['NODES_VIEW', 'NODES_MANAGE']);
    expect((await zadanie('POST', `/admin/zadania-w-tle/${STRAZNIK}/uruchom`, noc)).status).toBe(403);
    expect((await zadanie('POST', `/admin/zadania-w-tle/${RETENCJA}/uruchom`, a)).status).toBe(403);
    const ok = await zadanie('POST', `/admin/zadania-w-tle/${STRAZNIK}/uruchom`, a);
    expect(ok.status).toBe(202);
    await vi.waitFor(async () => expect(await prisma().scheduledJobRun.count({ where: { job: STRAZNIK, manualBy: a.id, ok: true } })).toBe(1));
    expect(await prisma().auditLog.count({ where: { action: 'ZADANIE_W_TLE_RECZNE', actorUserId: a.id } })).toBe(1);
  });

  it('alert: zadanie, które nie biegło od dwóch terminów — mail do administratorów, drugi raz dopiero po dobie', async () => {
    await admin();
    const s = app.get(ZadaniaWTleService);
    // Za 23 h: strażnik (co 5 min) bez przebiegu od startu procesu jest zaległy; cooldown liczy się od prawdziwej
    // daty wpisu w dzienniku, więc „teraz” nie może odejść od zegara o dobę.
    const teraz = new Date(Date.now() + 23 * 3600 * 1000);
    // Retencja biegła „przed chwilą” — nie jest zaległa.
    await przebieg(RETENCJA, new Date(teraz.getTime() - 60_000).toISOString(), true);

    const pierwszy = await s.sprawdzZalegle(teraz);
    expect(pierwszy).toContain(STRAZNIK);
    expect(pierwszy).not.toContain(RETENCJA);
    expect(maile).toHaveLength(1);
    expect(maile[0]!.subject).toContain('Zadania w tle nie biegną');
    expect(await prisma().auditLog.count({ where: { action: 'ZADANIE_W_TLE_ZALEGLE' } })).toBe(pierwszy.length);

    // Ten sam stan 10 minut później — bez nowego alertu (cooldown z dziennika).
    expect(await s.sprawdzZalegle(new Date(teraz.getTime() + 10 * 60_000))).toEqual([]);
    expect(maile).toHaveLength(1);
  });

  it('retencja: kasuje przebiegi starsze niż 30 dni, młodsze zostają', async () => {
    const teraz = new Date('2026-10-10T04:00:00Z');
    await przebieg('X.stary', '2026-09-09T03:00:00Z', true);
    await przebieg('X.mlody', '2026-09-11T03:00:00Z', true);
    expect(await app.get(ZadaniaWTleService).retencja(teraz)).toBe(1);
    expect((await prisma().scheduledJobRun.findMany({ where: { job: { startsWith: 'X.' } } })).map((r) => r.job)).toEqual(['X.mlody']);
  });
});
