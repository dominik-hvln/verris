import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy.js';
import { MailerService } from '../../src/mail/mailer.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { UsersAdminController } from '../../src/users/users.admin.controller.js';
import { UsersAdminService } from '../../src/users/users.admin.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { HostingDiagnosticsService } from '../../src/diagnostics/hosting-diagnostics.service.js';
import { StatusService } from '../../src/status/status.service.js';
import { StripeService } from '../../src/billing/stripe/stripe.service.js';
import { StaffRolesService, wgrajRoleSystemowe } from '../../src/staff-roles/staff-roles.service.js';
import { ROLE_SYSTEMOWE } from '../../src/staff-roles/role-systemowe.js';
import { dostepOperatora } from '../../src/staff-roles/uprawnienia-operatora.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * PB-47 — role operatorów na prawdziwym PostgreSQL:
 *  - migracja przenosi staffRoleId do tabeli przypisań (idempotentnie),
 *  - wgranie ról systemowych 2× nie tworzy duplikatów i nie nadpisuje roli własnej o tej samej nazwie,
 *  - suma uprawnień z kilku ról (strażnik + serwis), ustawienie listy ról,
 *  - blokada zmiany „konta wewnętrznego” przez HTTP: STAFF bez uprawnienia 403, z — 200, ADMIN — 200.
 */
const SEKRET = 'test-sekret-role-operatora';
const jwt = new JwtService({ secret: SEKRET });
const MIGRACJA = resolve(import.meta.dirname, '../../../../libs/database/prisma/migrations/20261008150000_role_operatora_wiele/migration.sql');

/** Dzieli plik migracji na polecenia (średniki wewnątrz bloków $$ … $$ nie kończą polecenia). */
function polecenia(sql: string): string[] {
  const out: string[] = [];
  let biezace = '';
  let wDolarach = false;
  for (const linia of sql.split('\n')) {
    if (linia.trim().startsWith('--') && !wDolarach) continue;
    biezace += linia + '\n';
    if ((linia.match(/\$\$/g) ?? []).length % 2 === 1) wDolarach = !wDolarach;
    if (!wDolarach && linia.trimEnd().endsWith(';')) {
      out.push(biezace.trim());
      biezace = '';
    }
  }
  if (biezace.trim()) out.push(biezace.trim());
  return out;
}
async function nalozMigracje() {
  for (const p of polecenia(readFileSync(MIGRACJA, 'utf-8'))) await prisma().$executeRawUnsafe(p);
}

@Module({
  imports: [PassportModule],
  controllers: [UsersAdminController],
  providers: [
    JwtStrategy,
    UsersAdminService,
    { provide: PrismaService, useFactory: () => prisma() },
    { provide: JwtService, useValue: jwt },
    { provide: ConfigService, useValue: { get: () => SEKRET } },
    { provide: AuditService, useValue: { record: async () => undefined } },
    { provide: MailerService, useValue: { send: async () => ({ delivered: true }) } },
    { provide: StatusService, useValue: {} },
    { provide: StripeService, useValue: {} },
    { provide: UsersService, useValue: {} },
    { provide: HostingDiagnosticsService, useValue: {} },
  ],
})
class Aplikacja {}

let app: INestApplication;
let url: string;

async function patch(sciezka: string, sub: string, rola: string, body: unknown) {
  const r = await fetch(url + sciezka, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${jwt.sign({ sub, email: 'x', role: rola, purpose: 'access' }, { expiresIn: 60 })}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, unknown> | null };
}

const znacznik = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const rola = (name: string, permissions: string[]) => prisma().staffRole.create({ data: { name, permissions } });
const operator = (t: string, staffRoleId?: string) =>
  prisma().user.create({ data: { email: `op-${t}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', staffRoleId: staffRoleId ?? null } });

describe('PB-47 — role operatorów (PostgreSQL)', () => {
  beforeAll(async () => {
    app = await NestFactory.create(Aplikacja, { logger: false });
    await app.listen(0);
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await rozlacz();
  });
  beforeEach(async () => {
    await wyczyscBaze();
  });

  it('migracja: dotychczasowe staffRoleId → przypisania; drugi przebieg bez duplikatów', async () => {
    const t = znacznik();
    const r = await rola(`stara-${t}`, ['TICKETS_VIEW']);
    const op1 = await operator(`a-${t}`, r.id);
    const op2 = await operator(`b-${t}`);
    await prisma().staffRoleAssignment.deleteMany({ where: { userId: { in: [op1.id, op2.id] } } });

    await nalozMigracje();
    await nalozMigracje();

    const przypisania = await prisma().staffRoleAssignment.findMany({ where: { userId: { in: [op1.id, op2.id] } } });
    expect(przypisania.map((p) => [p.userId, p.roleId])).toEqual([[op1.id, r.id]]);
    // Stare działy z 20260630130000_staff_roles przestają być systemowe (zostają jako własne).
    const stare = await prisma().staffRole.findMany({ where: { name: { in: ['Wsparcie L1', 'Księgowość'] } } });
    for (const s of stare) expect(s.isSystem).toBe(false);
  });

  it('wgranie ról systemowych 2× — bez duplikatów, z aktualnymi uprawnieniami; rola własna o tej nazwie nietknięta', async () => {
    await prisma().staffRole.deleteMany({ where: { name: 'Marketing' } });
    const wlasna = await prisma().staffRole.create({ data: { name: 'Marketing', permissions: ['PROMO_MANAGE'], isSystem: false } });
    // Rola systemowa „zepsuta” ręcznie w bazie — wgranie przywraca definicję z kodu.
    await wgrajRoleSystemowe(prisma());
    await prisma().staffRole.update({ where: { name: 'L1 Konsultant' }, data: { permissions: ['NODES_MANAGE'] } });

    expect(await wgrajRoleSystemowe(prisma())).toEqual(['Marketing']);
    const systemowe = await prisma().staffRole.findMany({ where: { isSystem: true } });
    expect(systemowe.map((r) => r.name).sort()).toEqual(ROLE_SYSTEMOWE.map((r) => r.name).filter((n) => n !== 'Marketing').sort());
    expect(systemowe.find((r) => r.name === 'L1 Konsultant')!.permissions).toEqual([...ROLE_SYSTEMOWE[0].permissions]);
    expect((await prisma().staffRole.findUniqueOrThrow({ where: { id: wlasna.id } })).isSystem).toBe(false);

    // Po usunięciu roli własnej wgranie zakłada systemową „Marketing”.
    await prisma().staffRole.delete({ where: { id: wlasna.id } });
    expect(await wgrajRoleSystemowe(prisma())).toEqual([]);
    expect(await prisma().staffRole.count({ where: { isSystem: true } })).toBe(ROLE_SYSTEMOWE.length);
  });

  it('suma uprawnień: staffRoleId + przypisania; ustawienie listy ról zastępuje poprzednią', async () => {
    const t = znacznik();
    const a = await rola(`a-${t}`, ['CUSTOMERS_VIEW']);
    const b = await rola(`b-${t}`, ['BILLING_MANAGE']);
    const c = await rola(`c-${t}`, ['NODES_VIEW']);
    const op = await operator(t, a.id);
    await prisma().staffRoleAssignment.create({ data: { userId: op.id, roleId: b.id } });
    expect((await dostepOperatora(prisma(), op.id)).uprawnienia.sort()).toEqual(['BILLING_MANAGE', 'CUSTOMERS_VIEW']);

    const zapisy: unknown[] = [];
    const svc = new StaffRolesService(prisma() as never, { record: async (x: unknown) => void zapisy.push(x) } as never, {} as never, { get: () => undefined } as never);
    await svc.setOperatorRoles(op.id, [c.id, b.id], { userId: 'adm', role: 'ADMIN' });
    const d = await dostepOperatora(prisma(), op.id);
    expect(d.uprawnienia.sort()).toEqual(['BILLING_MANAGE', 'NODES_VIEW']);
    expect((await prisma().user.findUniqueOrThrow({ where: { id: op.id } })).staffRoleId).toBe(c.id);
    expect(zapisy[0]).toMatchObject({
      action: 'STAFF_ROLE_ASSIGNED',
      userId: op.id,
      actorUserId: 'adm',
      details: { przed: [{ id: a.id }, { id: b.id }], po: [{ id: c.id }, { id: b.id }] },
    });
    const lista = await svc.listOperators();
    expect(lista.find((o) => o.id === op.id)!.roleIds.sort()).toEqual([b.id, c.id].sort());
    expect(lista.find((o) => o.id === op.id)!.canAccessGrafana).toBe(false);
    // Rola z członkami (przez przypisanie) nie daje się usunąć.
    await expect(svc.deleteRole(b.id, { userId: 'adm', role: 'ADMIN' })).rejects.toThrow(/odepnij/);
  });

  it('dwie równoczesne zmiany ról tego samego operatora idą po kolei — wynik to lista z późniejszej, nie suma', async () => {
    const t = znacznik();
    const x = await rola(`x-${t}`, ['TICKETS_VIEW']);
    const a = await rola(`a-${t}`, ['CUSTOMERS_VIEW']);
    const b = await rola(`b-${t}`, ['BILLING_VIEW']);
    const op = await operator(t, x.id);
    await prisma().staffRoleAssignment.create({ data: { userId: op.id, roleId: x.id } });
    const svc = new StaffRolesService(prisma() as never, { record: async () => undefined } as never, {} as never, { get: () => undefined } as never);

    // Pierwsza zmiana (lista [A]) trzyma blokadę wiersza operatora i jest w połowie zapisu, gdy rusza druga ([B]).
    let druga: Promise<unknown> | undefined;
    await prisma().$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${op.id} FOR UPDATE`;
        await tx.staffRoleAssignment.deleteMany({ where: { userId: op.id } });
        await tx.staffRoleAssignment.createMany({ data: [{ userId: op.id, roleId: a.id }] });
        await tx.user.update({ where: { id: op.id }, data: { staffRoleId: a.id } });
        druga = svc.setOperatorRoles(op.id, [b.id], { userId: 'adm', role: 'ADMIN' });
        await new Promise((r) => setTimeout(r, 400));
      },
      { timeout: 15_000 },
    );
    await druga;

    const po = await prisma().staffRoleAssignment.findMany({ where: { userId: op.id } });
    expect(po.map((p) => p.roleId)).toEqual([b.id]);
    expect((await dostepOperatora(prisma(), op.id)).uprawnienia).toEqual(['BILLING_VIEW']);
  });

  it('konto wewnętrzne: STAFF bez uprawnienia 403 (WYMAGA_WNIOSKU), z uprawnieniem z drugiej roli 200, ADMIN 200', async () => {
    const t = znacznik();
    const bok = await rola(`bok-${t}`, ['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE']);
    const flaga = await rola(`flaga-${t}`, ['CUSTOMERS_INTERNAL_FLAG']);
    const bez = await operator(`bez-${t}`, bok.id);
    const z = await operator(`z-${t}`, bok.id);
    await prisma().staffRoleAssignment.create({ data: { userId: z.id, roleId: flaga.id } });
    const admin = await prisma().user.create({ data: { email: `adm-${t}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    const klient = await prisma().user.create({ data: { email: `kl-${t}@test.verris.pl`, passwordHash: 'x' } });
    const sciezka = `/admin/users/${klient.id}/operational`;
    const wewnetrzne = async () => (await prisma().user.findUniqueOrThrow({ where: { id: klient.id } })).isInternal;

    const odmowa = await patch(sciezka, bez.id, 'STAFF', { isInternal: true });
    expect(odmowa.status).toBe(403);
    expect(odmowa.body).toMatchObject({ code: 'WYMAGA_WNIOSKU', operacja: 'CUSTOMER_INTERNAL_FLAG' });
    expect(await wewnetrzne()).toBe(false);
    // Pozostałe pola operacyjne i niezmieniona flaga — bez zmian w uprawnieniach.
    expect((await patch(sciezka, bez.id, 'STAFF', { isInternal: false, adminInternalNote: 'notatka' })).status).toBe(200);

    expect((await patch(sciezka, z.id, 'STAFF', { isInternal: true })).status).toBe(200);
    expect(await wewnetrzne()).toBe(true);
    expect((await patch(sciezka, admin.id, 'ADMIN', { isInternal: false })).status).toBe(200);
    expect(await wewnetrzne()).toBe(false);
  });
});
