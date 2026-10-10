import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Module, ValidationPipe } from '@nestjs/common';
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
import { NotatkiKlientaService } from '../../src/users/notatki-klienta.service.js';
import { CustomerIamService } from '../../src/users/customer-iam.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { HostingDiagnosticsService } from '../../src/diagnostics/hosting-diagnostics.service.js';
import { StatusService } from '../../src/status/status.service.js';
import { StripeService } from '../../src/billing/stripe/stripe.service.js';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * F2.4 — notatki wewnętrzne o kliencie na prawdziwym PostgreSQL: migracja przenosi starą notatkę jako pierwszą,
 * wiele notatek z autorem i przypięciem przez HTTP (strażnicy ról i uprawnień), stara karta dopisuje do listy.
 */
const SEKRET = 'test-sekret-notatki';
const jwt = new JwtService({ secret: SEKRET });
const MIGRACJA = resolve(import.meta.dirname, '../../../../libs/database/prisma/migrations/20261010150000_notatki_klienta/migration.sql');

@Module({
  imports: [PassportModule],
  controllers: [UsersAdminController],
  providers: [
    JwtStrategy,
    UsersAdminService,
    NotatkiKlientaService,
    CustomerIamService,
    AuditService,
    { provide: PrismaService, useFactory: () => prisma() },
    { provide: JwtService, useValue: jwt },
    { provide: ConfigService, useValue: { get: () => SEKRET } },
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

async function zadanie(metoda: 'GET' | 'POST' | 'PATCH', sciezka: string, kto: { id: string; role: string }, body?: unknown) {
  const r = await fetch(url + sciezka, {
    method: metoda,
    headers: {
      Authorization: `Bearer ${jwt.sign({ sub: kto.id, email: 'x', role: kto.role, purpose: 'access' }, { expiresIn: 60 })}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, unknown> };
}

const t = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
async function operator(uprawnienia: string[], imie = 'Op') {
  const z = t();
  const r = await prisma().staffRole.create({ data: { name: `rola-${z}`, permissions: uprawnienia } });
  const u = await prisma().user.create({ data: { email: `op-${z}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', firstName: imie, lastName: 'Nowak' } });
  await prisma().staffRoleAssignment.create({ data: { userId: u.id, roleId: r.id } });
  return { id: u.id, role: 'STAFF' };
}
const klient = (dane: Record<string, unknown> = {}) => prisma().user.create({ data: { email: `k-${t()}@test.verris.pl`, passwordHash: 'x', ...dane } });
type Notatka = { id: string; tresc: string; przypieta: boolean; autor: { nazwa: string } | null };

describe('F2.4 — notatki klienta (PostgreSQL)', () => {
  beforeAll(async () => {
    app = await NestFactory.create(Aplikacja, { logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await rozlacz();
  });
  beforeEach(wyczyscBaze);

  it('migracja: stara notatka → pierwsza, przypięta, bez autora; puste i zanonimizowane pominięte; drugi przebieg bez duplikatu', async () => {
    const z = await klient({ adminInternalNote: 'VIP — dzwonić przed zmianami' });
    const pusta = await klient({ adminInternalNote: '   ' });
    const anon = await klient({ adminInternalNote: 'stara', anonymizedAt: new Date() });
    await prisma().customerNote.deleteMany({});
    const sql = readFileSync(MIGRACJA, 'utf-8');
    const insert = sql.slice(sql.indexOf('INSERT INTO "CustomerNote"'));
    await prisma().$executeRawUnsafe(insert);
    await prisma().$executeRawUnsafe(insert);
    const n = await prisma().customerNote.findMany({ where: { userId: { in: [z.id, pusta.id, anon.id] } } });
    expect(n.map((x) => [x.userId, x.body, x.pinned, x.authorId])).toEqual([[z.id, 'VIP — dzwonić przed zmianami', true, null]]);
  });

  it('HTTP: konsultant dopisuje i przypina, audytor tylko czyta; przypięte pierwsze; autor z imienia; dziennik bez treści', async () => {
    const l1 = await operator(['CUSTOMERS_VIEW', 'TICKETS_VIEW', 'TICKETS_MANAGE'], 'Anna');
    const audytor = await operator(['CUSTOMERS_VIEW', 'TICKETS_VIEW']);
    const k = await klient();
    const a = await zadanie('POST', `/admin/users/${k.id}/notes`, l1, { tresc: 'Klient prosi o kontakt mailowy.' });
    expect(a.status).toBe(201);
    const b = await zadanie('POST', `/admin/users/${k.id}/notes`, l1, { tresc: 'Druga: zaległość wyjaśniona.' });
    expect((await zadanie('POST', `/admin/users/${k.id}/notes`, audytor, { tresc: 'nie wolno' })).status).toBe(403);
    expect((await zadanie('POST', `/admin/users/${k.id}/notes`, l1, { tresc: '   ' })).status).toBe(400);
    expect((await zadanie('PATCH', `/admin/users/${k.id}/notes/${a.body.id as string}`, l1, { przypieta: true })).status).toBe(200);

    const lista = await zadanie('GET', `/admin/users/${k.id}/notes`, audytor);
    expect(lista.status).toBe(200);
    const notatki = lista.body.notatki as Notatka[];
    expect(notatki.map((n) => [n.id, n.przypieta])).toEqual([[a.body.id, true], [b.body.id, false]]);
    expect(notatki[0]!.autor!.nazwa).toBe('Anna Nowak');

    const wpisy = await prisma().auditLog.findMany({ where: { userId: k.id, action: { startsWith: 'ADMIN_CUSTOMER_NOTE_' } } });
    expect(wpisy.map((w) => w.action).sort()).toEqual(['ADMIN_CUSTOMER_NOTE_ADDED', 'ADMIN_CUSTOMER_NOTE_ADDED', 'ADMIN_CUSTOMER_NOTE_PINNED']);
    expect(JSON.stringify(wpisy)).not.toContain('kontakt mailowy');
  });

  it('notatka cudzego klienta → 404; konto pracownika → 403', async () => {
    const l1 = await operator(['CUSTOMERS_VIEW', 'TICKETS_MANAGE']);
    const [k1, k2] = [await klient(), await klient()];
    const n = await zadanie('POST', `/admin/users/${k1.id}/notes`, l1, { tresc: 'x' });
    expect((await zadanie('PATCH', `/admin/users/${k2.id}/notes/${n.body.id as string}`, l1, { przypieta: true })).status).toBe(404);
    const pracownik = await operator(['CUSTOMERS_VIEW']);
    expect((await zadanie('POST', `/admin/users/${pracownik.id}/notes`, l1, { tresc: 'x' })).status).toBe(403);
  });

  it('stara karta (PATCH operational) dopisuje zmienioną notatkę do listy; ta sama treść — bez duplikatu', async () => {
    const l3 = await operator(['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE']);
    const k = await klient({ adminInternalNote: 'stara' });
    expect((await zadanie('PATCH', `/admin/users/${k.id}/operational`, l3, { adminInternalNote: 'nowa treść' })).status).toBe(200);
    expect((await zadanie('PATCH', `/admin/users/${k.id}/operational`, l3, { adminInternalNote: 'nowa treść' })).status).toBe(200);
    const n = await prisma().customerNote.findMany({ where: { userId: k.id } });
    expect(n.map((x) => [x.body, x.authorId])).toEqual([['nowa treść', l3.id]]);
  });

  it('zespół klienta (odczyt): subkonta, członkostwa i ważne zaproszenia bez tokenu; zakres jako nazwy usług; wpis w dzienniku', async () => {
    const l1 = await operator(['CUSTOMERS_VIEW', 'TICKETS_MANAGE']);
    const k = await klient();
    const plan = await utworzPlan({ name: 'Hosting' });
    const usluga = await prisma().subscription.create({ data: { userId: k.id, planId: plan.id, interval: 'MONTH', priceAmount: 45 } });
    await prisma().user.create({
      data: { email: `sub-${t()}@test.verris.pl`, passwordHash: 'tajne-haslo', customerOwnerId: k.id, firstName: 'Ola', customerPermissions: ['SERVICES_READ'], subaccountServiceIds: [usluga.id], subaccountLabel: 'Księgowa' },
    });
    const agencja = await klient({ firstName: 'Agencja' });
    await prisma().customerMembership.create({ data: { ownerUserId: k.id, memberUserId: agencja.id, permissions: ['SERVICES_MANAGE', 'DNS_MANAGE'] } });
    await prisma().customerSubaccountInvite.create({ data: { ownerUserId: k.id, email: 'nowy@firma.pl', tokenHash: `hash-${t()}`, permissions: ['TICKETS_READ'], expiresAt: new Date(Date.now() + 864e5) } });
    await prisma().customerSubaccountInvite.create({ data: { ownerUserId: k.id, email: 'stare@firma.pl', tokenHash: `hash-${t()}`, permissions: [], expiresAt: new Date(Date.now() - 864e5) } });

    const r = await zadanie('GET', `/admin/users/${k.id}/zespol`, l1);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      jestSubkontem: false,
      subkonta: [{ nazwa: 'Ola', etykieta: 'Księgowa', uprawnienia: ['SERVICES_READ'], uslugi: ['Hosting'], wylaczone: false }],
      czlonkostwa: [{ email: agencja.email, nazwa: 'Agencja', uprawnienia: ['SERVICES_MANAGE', 'DNS_MANAGE'], uslugi: null }],
      zaproszenia: [{ email: 'nowy@firma.pl', uprawnienia: ['TICKETS_READ'] }],
    });
    expect(JSON.stringify(r.body)).not.toMatch(/hash-|tajne-haslo|passwordHash|tokenHash/);
    const wpis = await prisma().auditLog.findFirst({ where: { userId: k.id, action: 'OPERATOR_CUSTOMER_CARD_VIEWED' } });
    expect(wpis?.details).toEqual({ sekcja: 'zespol' });
    // Bez CUSTOMERS_VIEW — 403; konto pracownika — 403.
    expect((await zadanie('GET', `/admin/users/${k.id}/zespol`, await operator(['TICKETS_MANAGE']))).status).toBe(403);
    expect((await zadanie('GET', `/admin/users/${l1.id}/zespol`, await operator(['CUSTOMERS_VIEW']))).status).toBe(403);
  });
});
