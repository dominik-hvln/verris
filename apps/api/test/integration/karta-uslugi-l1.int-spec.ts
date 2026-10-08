import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { SubscriptionsAdminController } from '../../src/subscriptions/subscriptions.admin.controller.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { MigrationOrchestratorService } from '../../src/subscriptions/migration-orchestrator.service.js';
import { PlanChangeService } from '../../src/subscriptions/plan-change.service.js';
import { HostingRestoreService } from '../../src/subscriptions/hosting-restore.service.js';
import { DiagnosticsService } from '../../src/subscriptions/diagnostics.service.js';
import { DirectAdminService } from '../../src/servers/directadmin.service.js';
import { OdtworzenieNaWezleService } from '../../src/subscriptions/odtworzenie-na-wezle.service.js';
import { RetencjaKontService } from '../../src/subscriptions/retencja-kont.service.js';
import { wgrajRoleSystemowe } from '../../src/staff-roles/staff-roles.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * L1-KARTA (decyzja 08.10) — karta usługi w panelu obsługi przez prawdziwy HTTP (passport, JWT, strażniki,
 * role systemowe wgrane do bazy): L1 Konsultant otwiera kartę w podglądzie, nie zmienia planu i nie odtwarza;
 * NOC (SUBSCRIPTIONS_MANAGE bez CUSTOMERS_VIEW) nadal ma kartę. Usługi zależne od węzła zastąpione atrapami.
 */
const SEKRET = 'test-sekret-karta-uslugi-l1';
const jwt = new JwtService({ secret: SEKRET });

const wywolania: string[] = [];
const atrapa = (nazwa: string, wynik: unknown) => async () => {
  wywolania.push(nazwa);
  return wynik;
};

@Module({
  imports: [PassportModule],
  controllers: [SubscriptionsAdminController],
  providers: [
    JwtStrategy,
    { provide: PrismaService, useFactory: () => prisma() },
    { provide: ConfigService, useValue: { get: () => SEKRET } },
    { provide: AuditService, useFactory: (p: PrismaService) => new AuditService(p), inject: [PrismaService] },
    { provide: SubscriptionsService, useValue: {} },
    { provide: MigrationOrchestratorService, useValue: { listMigrationTimelineForAdmin: atrapa('migracje', []) } },
    { provide: PlanChangeService, useValue: { listEligiblePlansForAdmin: atrapa('plany', []) } },
    {
      provide: HostingRestoreService,
      useValue: { latestForSubscription: atrapa('stan-odtwarzania', { id: null }), enqueue: atrapa('odtworzenie', { id: 'j1' }) },
    },
    { provide: DiagnosticsService, useValue: { forSubscription: atrapa('diagnostyka', { overall: 'ok', findings: [] }) } },
    { provide: DirectAdminService, useValue: { listHostingBackups: atrapa('kopie', { rows: [], fetchError: null }) } },
    { provide: OdtworzenieNaWezleService, useValue: {} },
    { provide: RetencjaKontService, useValue: {} },
  ],
})
class Aplikacja {}

let app: INestApplication;
let url: string;

async function zadanie(metoda: 'GET' | 'POST', sciezka: string, sub: string, rola: string, body?: unknown) {
  const r = await fetch(url + sciezka, {
    method: metoda,
    headers: { Authorization: `Bearer ${jwt.sign({ sub, email: 'x', role: rola, purpose: 'access' }, { expiresIn: 60 })}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, unknown> | null };
}

async function operatorZRola(nazwaRoli: string) {
  const rola = await prisma().staffRole.findUniqueOrThrow({ where: { name: nazwaRoli } });
  const op = await prisma().user.create({
    data: { email: `op-${Math.random().toString(36).slice(2, 9)}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', staffRoleId: rola.id },
  });
  await prisma().staffRoleAssignment.create({ data: { userId: op.id, roleId: rola.id } });
  return op;
}

describe('L1-KARTA — karta usługi przez HTTP dla ról systemowych', () => {
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
    await wgrajRoleSystemowe(prisma());
    wywolania.length = 0;
  });

  it('L1 Konsultant: karta, zasoby, historia migracji i diagnostyka — 200; plany, odtworzenie i kopie z węzła — 403', async () => {
    const k = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan()).id });
    const l1 = await operatorZRola('L1 Konsultant');
    const s = `/admin/subscriptions/${k.subscription.id}`;

    const karta = await zadanie('GET', s, l1.id, 'STAFF');
    expect(karta.status).toBe(200);
    expect(karta.body).toMatchObject({ id: k.subscription.id, user: { id: k.user.id }, account: { domain: k.account.domain } });
    expect((await zadanie('GET', `${s}/usage`, l1.id, 'STAFF')).status).toBe(200);
    expect((await zadanie('GET', `${s}/migrations`, l1.id, 'STAFF')).status).toBe(200);
    expect((await zadanie('GET', `${s}/hosting-restore/status`, l1.id, 'STAFF')).status).toBe(200);
    expect((await zadanie('GET', `${s}/diagnostics`, l1.id, 'STAFF')).status).toBe(200);

    expect((await zadanie('GET', `${s}/plan/eligible-plans`, l1.id, 'STAFF')).status).toBe(403);
    expect((await zadanie('GET', `${s}/hosting-backups`, l1.id, 'STAFF')).status).toBe(403);
    expect(
      (await zadanie('POST', `${s}/hosting-restore`, l1.id, 'STAFF', { backupId: 'b1', reason: 'Zgłoszenie #1 — prośba klienta o kopię' })).status,
    ).toBe(403);
    expect(wywolania).not.toContain('plany');
    expect(wywolania).not.toContain('kopie');
    expect(wywolania).not.toContain('odtworzenie');

    // Diagnostyka odpytuje węzeł — w dzienniku: operator = aktor, klient = właściciel usługi.
    const wpisy = await prisma().auditLog.findMany({ where: { action: 'OPERATOR_ACCOUNT_VIEWED', userId: k.user.id } });
    expect(wpisy).toHaveLength(1);
    expect(wpisy[0]).toMatchObject({ actorUserId: l1.id, details: { subscriptionId: k.subscription.id, sekcja: 'diagnostyka' } });
  });

  it('NOC (bez podglądu klientów) nadal otwiera kartę i widzi plany oraz kopie', async () => {
    const k = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan()).id });
    const noc = await operatorZRola('Inżynier infrastruktury (NOC/DevOps)');
    const s = `/admin/subscriptions/${k.subscription.id}`;
    expect((await zadanie('GET', s, noc.id, 'STAFF')).status).toBe(200);
    expect((await zadanie('GET', `${s}/usage`, noc.id, 'STAFF')).status).toBe(200);
    expect((await zadanie('GET', `${s}/plan/eligible-plans`, noc.id, 'STAFF')).status).toBe(200);
    expect((await zadanie('GET', `${s}/hosting-backups`, noc.id, 'STAFF')).status).toBe(200);
  });

  it('klient (USER) nie otwiera karty', async () => {
    const k = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan()).id });
    expect((await zadanie('GET', `/admin/subscriptions/${k.subscription.id}`, k.user.id, 'USER')).status).toBe(403);
  });
});
