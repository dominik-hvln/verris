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
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { AddonService } from '../../src/addons/addon.service.js';
import { ZleceniaDodatkowAdminController } from '../../src/addons/dodatki-operatora.admin.controller.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service.js';
import { wgrajRoleSystemowe } from '../../src/staff-roles/staff-roles.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * M-33 — zlecenia dodatków (dedykowane IP) zamykane przez zespół, przez prawdziwy HTTP (JWT, strażniki, role systemowe
 * w bazie) na Postgresie: „Zrealizowano” (DONE + notatka + odpowiedź w zgłoszeniu), „Odmowa ze zwrotem” (REFUNDED +
 * zwrot na portfel DOKŁADNIE raz), wyścig realizacja kontra odmowa, uprawnienia (403), zlecenie nie w kolejce (409).
 * Prawdziwe: zakup z portfela, księga, zgłoszenie i odpowiedź obsługi, dziennik. Atrapa: poczta.
 */
const SEKRET = 'test-sekret-zlecenia-dodatkow';
const jwt = new JwtService({ secret: SEKRET });
const maile: Array<{ to?: string; subject?: string }> = [];

function tickets(p: PrismaService) {
  const audit = new AuditService(p);
  const mailer = { send: async (m: (typeof maile)[number]) => void maile.push(m) };
  const config = { get: () => undefined };
  const notifications = { create: async () => undefined };
  const opieka = new OpiekaZgloszenService(p, mailer as never, config as never, audit, notifications as never, { supportSuggestion: async () => null } as never);
  return new TicketsService(p, mailer as never, config as never, {} as never, audit, notifications as never, opieka);
}
const sklep = (wallet?: WalletLedgerService) => {
  const p = prisma() as never;
  return new AddonService(p, new AuditService(p), wallet ?? new WalletLedgerService(p), tickets(p));
};

@Module({
  imports: [PassportModule],
  controllers: [ZleceniaDodatkowAdminController],
  providers: [
    JwtStrategy,
    { provide: PrismaService, useFactory: () => prisma() },
    { provide: ConfigService, useValue: { get: () => SEKRET } },
    { provide: AddonService, useFactory: () => sklep() },
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

let n = 0;
async function klientZeZleceniem(saldo = 100) {
  n += 1;
  const u = await prisma().user.create({ data: { email: `zlecenie-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo } });
  const r = await sklep().purchase(u.id, 'dedicated_ip', undefined, `zakup-${n}`);
  const zakup = await prisma().purchasedAddon.findUniqueOrThrow({ where: { id: r.id } });
  expect(zakup).toMatchObject({ status: 'QUEUED', ticketId: expect.any(String) });
  return { u, zakup, ticketId: zakup.ticketId! };
}
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const zwroty = (userId: string) => prisma().walletTransaction.findMany({ where: { userId, type: 'REFUND' } });
const odpowiedziZespolu = (ticketId: string) => prisma().ticketReply.findMany({ where: { ticketId, isStaff: true, internal: false, automatic: null }, orderBy: { createdAt: 'asc' } });
const POWOD = 'Pula adresów IP w tej lokalizacji jest wyczerpana.';

describe('M-33 — zlecenia dodatków zamykane przez zespół', () => {
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
    maile.length = 0;
  });

  it('„Zrealizowano” (L2): DONE z notatką, odpowiedź w zgłoszeniu, wpisy w dzienniku; saldo bez zmian; drugi raz — 409', async () => {
    const { u, zakup, ticketId } = await klientZeZleceniem();
    expect(await saldo(u.id)).toBe(75);
    const l2 = await operatorZRola('L2 Specjalista techniczny');

    const lista = await zadanie('GET', `/admin/dodatki/zgloszenie/${ticketId}`, l2.id, 'STAFF');
    expect(lista.status).toBe(200);
    expect(lista.body).toEqual([expect.objectContaining({ id: zakup.id, name: 'Dedykowane IP', status: 'QUEUED', amount: '25' })]);

    const r = await zadanie('POST', `/admin/dodatki/${zakup.id}/zrealizowano`, l2.id, 'STAFF', { notatka: 'Przydzielono IP 203.0.113.10.' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'DONE', zwrot: null, wZgloszeniu: true });

    const po = await prisma().purchasedAddon.findUniqueOrThrow({ where: { id: zakup.id } });
    expect(po).toMatchObject({ status: 'DONE', resolvedNote: 'Przydzielono IP 203.0.113.10.', resolvedById: l2.id });
    expect(po.resolvedAt).toBeInstanceOf(Date);
    expect(await saldo(u.id)).toBe(75);
    expect(await zwroty(u.id)).toEqual([]);

    const odp = await odpowiedziZespolu(ticketId);
    expect(odp).toHaveLength(1);
    expect(odp[0].message).toContain('Zrealizowaliśmy dodatek „Dedykowane IP”');
    expect(odp[0].message).toContain('Przydzielono IP 203.0.113.10.');
    expect(odp[0].authorId).toBe(l2.id);
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: ticketId } })).status).toBe('WAITING_CUSTOMER');

    const wpisy = await prisma().auditLog.findMany({ where: { userId: u.id, action: { in: ['ADDON_FULFILLED', 'OPERATOR_ACCOUNT_CHANGED'] } } });
    expect(wpisy.map((w) => w.action).sort()).toEqual(['ADDON_FULFILLED', 'OPERATOR_ACCOUNT_CHANGED']);
    expect(wpisy.find((w) => w.action === 'OPERATOR_ACCOUNT_CHANGED')!.details).toMatchObject({ akcja: 'dodatek-zrealizowany', zakupId: zakup.id, notatka: 'Przydzielono IP 203.0.113.10.' });

    // Klient: Dodatki → Historia dodatków.
    const historia = (await sklep().overview(u.id)).purchased;
    expect(historia).toEqual([expect.objectContaining({ id: zakup.id, status: 'DONE', notatka: 'Przydzielono IP 203.0.113.10.' })]);

    const drugi = await zadanie('POST', `/admin/dodatki/${zakup.id}/zrealizowano`, l2.id, 'STAFF', {});
    expect(drugi.status).toBe(409);
    expect(drugi.body).toMatchObject({ message: expect.stringContaining('jest zrealizowany') });
    expect(await odpowiedziZespolu(ticketId)).toHaveLength(1);
  });

  it('„Odmowa ze zwrotem” (L4): REFUNDED z powodem, saldo +25 zł DOKŁADNIE raz przy dwóch równoległych i jednym późniejszym wywołaniu', async () => {
    const { u, zakup, ticketId } = await klientZeZleceniem();
    const l4 = await operatorZRola('L4 Kierownik zmiany');

    const [a, b] = await Promise.all([
      zadanie('POST', `/admin/dodatki/${zakup.id}/odmowa`, l4.id, 'STAFF', { powod: POWOD }),
      zadanie('POST', `/admin/dodatki/${zakup.id}/odmowa`, l4.id, 'STAFF', { powod: POWOD }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const ok = a.status === 200 ? a : b;
    expect(ok.body).toMatchObject({ status: 'REFUNDED', zwrot: '25', wZgloszeniu: true });
    expect((await zadanie('POST', `/admin/dodatki/${zakup.id}/odmowa`, l4.id, 'STAFF', { powod: POWOD })).status).toBe(409);

    expect(await saldo(u.id)).toBe(100);
    const z = await zwroty(u.id);
    expect(z).toHaveLength(1);
    expect(Number(z[0].amount)).toBe(25);
    expect(z[0].idempotencyKey).toBe(`addon:v1:${u.id}:zakup-${n}:${zakup.id}:zwrot`);
    expect(await prisma().purchasedAddon.findUniqueOrThrow({ where: { id: zakup.id } })).toMatchObject({ status: 'REFUNDED', resolvedNote: POWOD, resolvedById: l4.id });

    const odp = await odpowiedziZespolu(ticketId);
    expect(odp).toHaveLength(1);
    expect(odp[0].message).toContain(`Powód: ${POWOD}`);
    expect(odp[0].message).toContain('Zwróciliśmy 25,00 zł na Twój portfel');

    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { userId: u.id, action: 'OPERATOR_ACCOUNT_CHANGED' } });
    expect(wpis.details).toMatchObject({ akcja: 'dodatek-odmowa-zwrot', powod: POWOD, kwota: '25', zgloszenieId: ticketId });
    expect(await prisma().auditLog.count({ where: { userId: u.id, action: 'ADDON_REFUNDED' } })).toBe(1);
    expect((await sklep().overview(u.id)).purchased).toEqual([expect.objectContaining({ status: 'REFUNDED', notatka: POWOD })]);
  });

  it('wyścig „Zrealizowano” kontra „Odmowa” (ADMIN, dwa okna): przechodzi jedno, drugie 409; saldo zgodne ze stanem', async () => {
    const admin = await prisma().user.create({ data: { email: 'admin-m33@test.verris.pl', passwordHash: 'x', role: 'ADMIN' } });
    for (let i = 0; i < 4; i += 1) {
      const { u, zakup, ticketId } = await klientZeZleceniem();
      const [r, o] = await Promise.all([
        zadanie('POST', `/admin/dodatki/${zakup.id}/zrealizowano`, admin.id, 'ADMIN', { notatka: 'Przydzielono IP 203.0.113.11.' }),
        zadanie('POST', `/admin/dodatki/${zakup.id}/odmowa`, admin.id, 'ADMIN', { powod: POWOD }),
      ]);
      expect([r.status, o.status].sort()).toEqual([200, 409]);
      const stan = (await prisma().purchasedAddon.findUniqueOrThrow({ where: { id: zakup.id } })).status;
      expect(stan).toBe(r.status === 200 ? 'DONE' : 'REFUNDED');
      expect(await saldo(u.id)).toBe(stan === 'REFUNDED' ? 100 : 75);
      expect(await zwroty(u.id)).toHaveLength(stan === 'REFUNDED' ? 1 : 0);
      expect(await odpowiedziZespolu(ticketId)).toHaveLength(1);
    }
  });

  it('brak uprawnień — 403 bez skutków: L1 nie realizuje, L2/L3/NOC nie zwracają; STAFF nie zamyka zlecenia konta zespołu', async () => {
    const { u, zakup, ticketId } = await klientZeZleceniem();
    const l1 = await operatorZRola('L1 Konsultant');
    const l3 = await operatorZRola('L3 Starszy specjalista');
    const noc = await operatorZRola('Inżynier infrastruktury (NOC/DevOps)');
    expect((await zadanie('POST', `/admin/dodatki/${zakup.id}/zrealizowano`, l1.id, 'STAFF', {})).status).toBe(403);
    for (const op of [l3, noc]) expect((await zadanie('POST', `/admin/dodatki/${zakup.id}/odmowa`, op.id, 'STAFF', { powod: POWOD })).status).toBe(403);
    expect((await zadanie('POST', `/admin/dodatki/${zakup.id}/zrealizowano`, u.id, 'USER', {})).status).toBe(403);
    expect((await prisma().purchasedAddon.findUniqueOrThrow({ where: { id: zakup.id } })).status).toBe('QUEUED');
    expect(await saldo(u.id)).toBe(75);
    expect(await odpowiedziZespolu(ticketId)).toEqual([]);

    // Zlecenie konta zespołu: STAFF z uprawnieniami — 403 (reguła jak przy dodaniu), ADMIN — może.
    const zespol = await klientZeZleceniem();
    await prisma().user.update({ where: { id: zespol.u.id }, data: { role: 'STAFF' } });
    const l4 = await operatorZRola('L4 Kierownik zmiany');
    const odmowa = await zadanie('POST', `/admin/dodatki/${zespol.zakup.id}/odmowa`, l4.id, 'STAFF', { powod: POWOD });
    expect(odmowa.status).toBe(403);
    expect(odmowa.body).toMatchObject({ message: expect.stringContaining('konta zespołu') });
    expect((await zadanie('GET', `/admin/dodatki/zgloszenie/${zespol.ticketId}`, l4.id, 'STAFF')).body).toEqual([]);
    expect(await saldo(zespol.u.id)).toBe(75);
    const admin = await prisma().user.create({ data: { email: 'admin-m33b@test.verris.pl', passwordHash: 'x', role: 'ADMIN' } });
    expect((await zadanie('POST', `/admin/dodatki/${zespol.zakup.id}/odmowa`, admin.id, 'ADMIN', { powod: POWOD })).status).toBe(200);
    expect(await saldo(zespol.u.id)).toBe(100);
  });

  it('zlecenie nie w kolejce — 409 bez zwrotu; odmowa bez powodu — 400', async () => {
    const l4 = await operatorZRola('L4 Kierownik zmiany');
    // Dodatek natychmiastowy (APPLIED) nie jest zleceniem dla zespołu.
    const u = await prisma().user.create({ data: { email: `prio-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 100 } });
    const prio = await sklep().purchase(u.id, 'priority_support_30d', undefined, 'prio-1');
    for (const [sciezka, cialo] of [['zrealizowano', {}], ['odmowa', { powod: POWOD }]] as const) {
      const r = await zadanie('POST', `/admin/dodatki/${prio.id}/${sciezka}`, l4.id, 'STAFF', cialo);
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ message: expect.stringContaining('aktywny') });
    }
    expect(await saldo(u.id)).toBe(51);

    // Zrealizowane nie da się potem „zwrócić” tym przyciskiem (to już korekta salda, z dowodem).
    const { u: k, zakup } = await klientZeZleceniem();
    expect((await zadanie('POST', `/admin/dodatki/${zakup.id}/zrealizowano`, l4.id, 'STAFF', {})).status).toBe(200);
    expect((await zadanie('POST', `/admin/dodatki/${zakup.id}/odmowa`, l4.id, 'STAFF', { powod: POWOD })).status).toBe(409);
    expect(await saldo(k.id)).toBe(75);
    expect(await zwroty(k.id)).toEqual([]);

    const drugi = await klientZeZleceniem();
    expect((await zadanie('POST', `/admin/dodatki/${drugi.zakup.id}/odmowa`, l4.id, 'STAFF', { powod: 'za mało' })).status).toBe(400);
    expect((await zadanie('POST', `/admin/dodatki/${drugi.zakup.id}/odmowa`, l4.id, 'STAFF', {})).status).toBe(400);
    expect((await prisma().purchasedAddon.findUniqueOrThrow({ where: { id: drugi.zakup.id } })).status).toBe('QUEUED');
    expect((await zadanie('POST', '/admin/dodatki/00000000-0000-4000-8000-000000000000/zrealizowano', l4.id, 'STAFF', {})).status).toBe(404);
  });

  it('zwrot w księdze nie wszedł — zlecenie wraca do kolejki; ponowienie zwraca raz', async () => {
    const { u, zakup } = await klientZeZleceniem();
    const p = prisma() as never;
    const prawdziwa = new WalletLedgerService(p);
    let pada = true;
    const wallet = Object.assign(Object.create(prawdziwa) as WalletLedgerService, {
      credit: async (x: Parameters<WalletLedgerService['credit']>[0]) => {
        if (pada) throw new Error('księga niedostępna');
        return prawdziwa.credit(x);
      },
    });
    const op = { userId: (await operatorZRola('L4 Kierownik zmiany')).id, role: 'STAFF' };
    await expect(sklep(wallet).zamknijZlecenie({ zakupId: zakup.id, wynik: 'ODMOWA', operator: op, tekst: POWOD })).rejects.toThrow('niedostępna');
    expect(await prisma().purchasedAddon.findUniqueOrThrow({ where: { id: zakup.id } })).toMatchObject({ status: 'QUEUED', resolvedNote: null, resolvedAt: null });
    expect(await saldo(u.id)).toBe(75);

    pada = false;
    await sklep(wallet).zamknijZlecenie({ zakupId: zakup.id, wynik: 'ODMOWA', operator: op, tekst: POWOD });
    expect(await saldo(u.id)).toBe(100);
    expect(await zwroty(u.id)).toHaveLength(1);
  });
});
