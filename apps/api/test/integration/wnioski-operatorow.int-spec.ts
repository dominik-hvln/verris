import 'reflect-metadata';
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
import { UsersAdminService } from '../../src/users/users.admin.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { HostingDiagnosticsService } from '../../src/diagnostics/hosting-diagnostics.service.js';
import { StatusService } from '../../src/status/status.service.js';
import { StripeService } from '../../src/billing/stripe/stripe.service.js';
import { BillingService } from '../../src/billing/billing.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { AnulowanieService } from '../../src/billing/anulowanie.service.js';
import { NotificationsService } from '../../src/notifications/notifications.service.js';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter.js';
import { WnioskiAdminController } from '../../src/wnioski/wnioski.admin.controller.js';
import { WnioskiService } from '../../src/wnioski/wnioski.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * PB-48 — wnioski o operację na prawdziwym PostgreSQL, przez HTTP (JWT, strażnicy ról i uprawnień, ValidationPipe):
 * złożenie → akceptacja wykonuje operację RAZ przy dwóch równoległych akceptacjach; odrzucenie bez powodu 400;
 * własny wniosek 403; decydujący bez uprawnienia operacji 403; STAFF z uprawnieniem nie składa wniosku;
 * błąd wykonawcy → FAILED bez zmiany stanu; dziennik i powiadomienia.
 */
const SEKRET = 'test-sekret-wnioski';
const jwt = new JwtService({ secret: SEKRET });
/** Wpisy dziennika z bazy (prawdziwy AuditService — z dopiskiem wniosku z kontekstu żądania). */
type Wpis = { action: string; userId: string | null; actorUserId: string | null; details: Record<string, unknown> };
let dziennik: Wpis[] = [];
let startTestu = new Date();
async function wczytajDziennik() {
  dziennik = (await prisma().auditLog.findMany({ where: { createdAt: { gte: startTestu } }, orderBy: { createdAt: 'asc' } })) as unknown as Wpis[];
}

@Module({
  imports: [PassportModule],
  controllers: [WnioskiAdminController],
  providers: [
    JwtStrategy,
    WnioskiService,
    UsersAdminService,
    AnulowanieService,
    NotificationsService,
    { provide: PrismaService, useFactory: () => prisma() },
    { provide: JwtService, useValue: jwt },
    { provide: ConfigService, useValue: { get: () => SEKRET } },
    AuditService,
    { provide: MailerService, useValue: { send: async () => ({ delivered: true }) } },
    { provide: StatusService, useValue: {} },
    { provide: StripeService, useValue: {} },
    { provide: UsersService, useValue: {} },
    { provide: HostingDiagnosticsService, useValue: {} },
    {
      // Prawdziwe zasilenie portfela (księga + saldo w Postgresie); reszta zależności nieużywana przez adminCreditWallet.
      provide: BillingService,
      inject: [PrismaService, AuditService, MailerService, ConfigService],
      useFactory: (p: PrismaService, a: AuditService, m: MailerService, c: ConfigService) =>
        new BillingService(p, new WalletLedgerService(p), {} as never, a, c, {} as never, {} as never, m, {} as never, {} as never, {} as never),
    },
  ],
})
class Aplikacja {}

let app: INestApplication;
let url: string;

async function zadanie(metoda: 'GET' | 'POST', sciezka: string, kto: { id: string; role: string }, body?: unknown) {
  const r = await fetch(url + sciezka, {
    method: metoda,
    headers: {
      Authorization: `Bearer ${jwt.sign({ sub: kto.id, email: 'x', role: kto.role, purpose: 'access' }, { expiresIn: 60 })}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, unknown> & Record<string, unknown>[] };
}

const t = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
async function operator(uprawnienia: string[], rola: 'STAFF' | 'ADMIN' = 'STAFF') {
  const z = t();
  const r = await prisma().staffRole.create({ data: { name: `rola-${z}`, permissions: uprawnienia } });
  const u = await prisma().user.create({ data: { email: `op-${z}@test.verris.pl`, passwordHash: 'x', role: rola, firstName: 'Op', lastName: z } });
  await prisma().staffRoleAssignment.create({ data: { userId: u.id, roleId: r.id } });
  return { id: u.id, role: rola };
}
const klient = () => prisma().user.create({ data: { email: `k-${t()}@test.verris.pl`, passwordHash: 'x', role: 'USER' } });

describe('PB-48 — wnioski o operację (PostgreSQL)', () => {
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
  beforeEach(async () => {
    await wyczyscBaze();
    startTestu = new Date();
    dziennik = [];
  });

  it('złożenie → dwie równoległe akceptacje: portfel zasilony RAZ, druga dostaje 409; dziennik z oba nazwiskami', async () => {
    const l1 = await operator(['CUSTOMERS_VIEW']);
    const kier1 = await operator(['REQUESTS_APPROVE', 'BILLING_MANAGE']);
    const kier2 = await operator(['REQUESTS_APPROVE', 'BILLING_MANAGE']);
    const bezUprawnien = await operator(['REQUESTS_APPROVE', 'CUSTOMERS_INTERNAL_FLAG']);
    const k = await klient();

    const zl = await zadanie('POST', '/admin/wnioski', l1, {
      typ: 'WALLET_CREDIT',
      userId: k.id,
      payload: { amount: 25.5, description: 'Rekompensata za awarię' },
      uzasadnienie: 'Klient czekał 3 dni na przywrócenie poczty.',
    });
    expect(zl.status).toBe(201);
    expect(zl.body).toMatchObject({ status: 'PENDING', typ: 'WALLET_CREDIT', opis: 'Zasilenie portfela: 25,50 K — Rekompensata za awarię' });
    const id = zl.body.id as string;

    // Powiadomienia: obaj kierownicy z BILLING_MANAGE, nie wnioskujący i nie operator bez uprawnienia operacji.
    const powiadomieni = (await prisma().notification.findMany({ where: { link: '/wnioski' } })).map((n) => n.userId).sort();
    expect(powiadomieni).toEqual([kier1.id, kier2.id].sort());

    // Lista do decyzji — tylko typy, do których decydujący ma uprawnienie.
    expect((await zadanie('GET', '/admin/wnioski/do-decyzji', kier1)).body.map((w) => w.id)).toEqual([id]);
    expect((await zadanie('GET', '/admin/wnioski/do-decyzji', bezUprawnien)).body).toEqual([]);

    // Przeplot zależy tu od bazy (żądania mogą się zserializować); deterministyczny wariant wyścigu bez klucza
    // idempotencji jest w src/wnioski/wnioski.service.spec.ts.
    const [a, b] = await Promise.all([
      zadanie('POST', `/admin/wnioski/${id}/akceptuj`, kier1, {}),
      zadanie('POST', `/admin/wnioski/${id}/akceptuj`, kier2, {}),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const ok = a.status === 200 ? a : b;
    const akceptujacy = a.status === 200 ? kier1 : kier2;
    expect(ok.body).toMatchObject({ status: 'APPROVED', decydujacy: { id: akceptujacy.id } });

    const u = await prisma().user.findUniqueOrThrow({ where: { id: k.id } });
    expect(u.walletBalance.toFixed(2)).toBe('25.50');
    expect(await prisma().walletTransaction.count({ where: { userId: k.id } })).toBe(1);

    // Dziennik: wpis operacji jak przy bezpośrednim wykonaniu (actor = akceptujący) + wniosekId i wnioskujący.
    await wczytajDziennik();
    const operacja = dziennik.filter((d) => d.action === 'WALLET_ADMIN_CREDIT');
    expect(operacja).toHaveLength(1);
    expect(operacja[0]).toMatchObject({ actorUserId: akceptujacy.id, userId: k.id, details: { wniosekId: id, wnioskujacyUserId: l1.id } });
    expect(dziennik.filter((d) => d.action === 'OPERATOR_REQUEST_APPROVED')).toEqual([
      expect.objectContaining({ actorUserId: akceptujacy.id, details: expect.objectContaining({ wniosekId: id, wnioskujacyUserId: l1.id, typ: 'WALLET_CREDIT' }) }),
    ]);
    expect(dziennik.find((d) => d.action === 'OPERATOR_REQUEST_SUBMITTED')).toMatchObject({ actorUserId: l1.id, userId: k.id });
    // Wnioskujący dostaje wynik decyzji.
    expect(await prisma().notification.count({ where: { userId: l1.id, title: { startsWith: 'Wniosek zaakceptowany' } } })).toBe(1);
    // „Moje” wnioskującego pokazują wynik.
    expect((await zadanie('GET', '/admin/wnioski/moje', l1)).body[0]).toMatchObject({ id, status: 'APPROVED', wynik: { walletTxId: expect.any(String) } });
  });

  it('odrzucenie bez powodu → 400; z powodem → REJECTED, dziennik i powiadomienie; operacja nie wykonana', async () => {
    const l1 = await operator(['CUSTOMERS_VIEW']);
    const kier = await operator(['REQUESTS_APPROVE', 'CUSTOMERS_MANAGE', 'CUSTOMERS_INTERNAL_FLAG']);
    const k = await klient();
    const zl = await zadanie('POST', '/admin/wnioski', l1, { typ: 'CUSTOMER_INTERNAL_FLAG', userId: k.id, payload: { isInternal: true }, uzasadnienie: 'Konto testowe zespołu.' });
    const id = zl.body.id as string;

    expect((await zadanie('POST', `/admin/wnioski/${id}/odrzuc`, kier, {})).status).toBe(400);
    expect((await zadanie('POST', `/admin/wnioski/${id}/odrzuc`, kier, { powod: '  ' })).status).toBe(400);
    const r = await zadanie('POST', `/admin/wnioski/${id}/odrzuc`, kier, { powod: 'To konto klienta płacącego.' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'REJECTED', powodDecyzji: 'To konto klienta płacącego.' });
    expect((await prisma().user.findUniqueOrThrow({ where: { id: k.id } })).isInternal).toBe(false);
    await wczytajDziennik();
    expect(dziennik.find((d) => d.action === 'OPERATOR_REQUEST_REJECTED')).toMatchObject({ actorUserId: kier.id, details: { powod: 'To konto klienta płacącego.', wnioskujacyUserId: l1.id } });
    expect(await prisma().notification.count({ where: { userId: l1.id, title: { startsWith: 'Wniosek odrzucony' } } })).toBe(1);
    // Rozpatrzonego nie da się już zaakceptować.
    expect((await zadanie('POST', `/admin/wnioski/${id}/akceptuj`, kier, {})).status).toBe(409);
  });

  it('własny wniosek → 403; decydujący bez uprawnienia operacji → 403; STAFF z uprawnieniem i ADMIN nie składają wniosku', async () => {
    const l3 = await operator(['CUSTOMERS_VIEW', 'REQUESTS_APPROVE']);
    const kierBezFinansow = await operator(['REQUESTS_APPROVE', 'CUSTOMERS_INTERNAL_FLAG']);
    const ksiegowa = await operator(['CUSTOMERS_VIEW', 'BILLING_MANAGE']);
    const admin = await operator([], 'ADMIN');
    const k = await klient();

    const zl = await zadanie('POST', '/admin/wnioski', l3, { typ: 'WALLET_CREDIT', userId: k.id, payload: { amount: 10 }, uzasadnienie: 'Zwrot za domenę.' });
    expect(zl.status).toBe(201);
    const id = zl.body.id as string;
    expect((await zadanie('POST', `/admin/wnioski/${id}/akceptuj`, l3, {})).status).toBe(403);
    expect((await zadanie('POST', `/admin/wnioski/${id}/akceptuj`, kierBezFinansow, {})).status).toBe(403);
    expect((await zadanie('POST', `/admin/wnioski/${id}/odrzuc`, kierBezFinansow, { powod: 'nie' })).status).toBe(403);
    // Operator bez REQUESTS_APPROVE nie wchodzi na decyzje w ogóle (strażnik).
    expect((await zadanie('POST', `/admin/wnioski/${id}/akceptuj`, ksiegowa, {})).status).toBe(403);
    expect((await prisma().operatorRequest.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');

    const sam = await zadanie('POST', '/admin/wnioski', ksiegowa, { typ: 'WALLET_CREDIT', userId: k.id, payload: { amount: 10 }, uzasadnienie: 'Zwrot za domenę.' });
    expect(sam.status).toBe(400);
    expect(sam.body).toMatchObject({ code: 'WYKONAJ_BEZPOSREDNIO' });
    expect((await zadanie('POST', '/admin/wnioski', admin, { typ: 'WALLET_CREDIT', userId: k.id, payload: { amount: 10 }, uzasadnienie: 'Zwrot za domenę.' })).status).toBe(400);

    // Walidacja przy złożeniu: payload typu, uzasadnienie, istnienie klienta.
    expect((await zadanie('POST', '/admin/wnioski', l3, { typ: 'WALLET_CREDIT', userId: k.id, payload: { amount: -5 }, uzasadnienie: 'Zwrot za domenę.' })).status).toBe(400);
    expect((await zadanie('POST', '/admin/wnioski', l3, { typ: 'WALLET_CREDIT', userId: k.id, payload: { amount: 5 }, uzasadnienie: 'x' })).status).toBe(400);
    expect((await zadanie('POST', '/admin/wnioski', l3, { typ: 'WALLET_CREDIT', userId: '00000000-0000-0000-0000-000000000000', payload: { amount: 5 }, uzasadnienie: 'Zwrot za domenę.' })).status).toBe(404);
    expect((await zadanie('POST', '/admin/wnioski', l3, { typ: 'NIEZNANY', userId: k.id, payload: {}, uzasadnienie: 'Zwrot za domenę.' })).status).toBe(400);

    // ADMIN akceptuje każdy typ.
    expect((await zadanie('POST', `/admin/wnioski/${id}/akceptuj`, admin, {})).body).toMatchObject({ status: 'APPROVED' });
  });

  it('błąd wykonawcy → FAILED z komunikatem, stan bez zmian; anulowanie tylko przez wnioskującego i tylko PENDING', async () => {
    const l1 = await operator(['CUSTOMERS_VIEW']);
    const l1b = await operator(['CUSTOMERS_VIEW']);
    const kier = await operator(['REQUESTS_APPROVE', 'BILLING_MANAGE']);
    const k = await klient();
    const f = await prisma().invoice.create({ data: { userId: k.id, number: `VDR/T/${t()}`, amount: 45, status: 'OPEN', rodzajPrawny: 'DOKUMENT_ROZLICZENIOWY' } });

    const zl = await zadanie('POST', '/admin/wnioski', l1, { typ: 'INVOICE_VOID', userId: k.id, payload: { invoiceId: f.id, powod: 'Wystawiony na złe konto.' }, uzasadnienie: 'Pomyłka przy zakładaniu usługi.' });
    expect(zl.status).toBe(201);
    // W międzyczasie klient opłacił dokument — anulowanie już nie przejdzie.
    await prisma().invoice.update({ where: { id: f.id }, data: { status: 'PAID' } });
    const r = await zadanie('POST', `/admin/wnioski/${zl.body.id as string}/akceptuj`, kier, {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'FAILED', wynik: { blad: 'Anulować można tylko dokument nieopłacony. Opłacony zmienisz korektą.' } });
    expect((await prisma().invoice.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('PAID');
    await wczytajDziennik();
    expect(dziennik.find((d) => d.action === 'OPERATOR_REQUEST_FAILED')).toMatchObject({ actorUserId: kier.id, details: { wnioskujacyUserId: l1.id } });
    expect(await prisma().notification.count({ where: { userId: l1.id, title: { startsWith: 'Wniosek nie został wykonany' } } })).toBe(1);

    // Konto już ma flagę → akceptacja kończy się czytelnym „bez zmian”, nie błędem.
    const kierFlaga = await operator(['REQUESTS_APPROVE', 'CUSTOMERS_MANAGE', 'CUSTOMERS_INTERNAL_FLAG']);
    const zf = await zadanie('POST', '/admin/wnioski', l1, { typ: 'CUSTOMER_INTERNAL_FLAG', userId: k.id, payload: { isInternal: true }, uzasadnienie: 'Konto testowe zespołu.' });
    await prisma().user.update({ where: { id: k.id }, data: { isInternal: true } });
    const bz = await zadanie('POST', `/admin/wnioski/${zf.body.id as string}/akceptuj`, kierFlaga, {});
    expect(bz.body).toMatchObject({ status: 'APPROVED', wynik: { bezZmian: true, komunikat: expect.stringMatching(/Bez zmian/) } });

    // Anulowanie: cudzy → 403, własny PENDING → CANCELLED, ponownie → 409.
    const za = await zadanie('POST', '/admin/wnioski', l1, { typ: 'WALLET_CREDIT', userId: k.id, payload: { amount: 1 }, uzasadnienie: 'Drobny zwrot za SMS.' });
    const idA = za.body.id as string;
    expect((await zadanie('POST', `/admin/wnioski/${idA}/anuluj`, l1b)).status).toBe(403);
    expect((await zadanie('POST', `/admin/wnioski/${idA}/anuluj`, l1)).body).toMatchObject({ status: 'CANCELLED' });
    expect((await zadanie('POST', `/admin/wnioski/${idA}/anuluj`, l1)).status).toBe(409);
    expect((await zadanie('POST', `/admin/wnioski/${idA}/akceptuj`, kier, {})).status).toBe(409);
    await wczytajDziennik();
    expect(dziennik.filter((d) => d.action === 'OPERATOR_REQUEST_CANCELLED')).toHaveLength(1);

    // Historia dla decydującego — typy, do których ma uprawnienie.
    const h = await zadanie('GET', '/admin/wnioski/historia?status=FAILED', kier);
    expect(h.body.map((w) => w.typ)).toEqual(['INVOICE_VOID']);
  });

  it('konto wewnętrzne: wniosek wymaga tego samego kompletu co ścieżka bezpośrednia (CUSTOMERS_MANAGE + CUSTOMERS_INTERNAL_FLAG)', async () => {
    // Rola własna z samą flagą, bez CUSTOMERS_MANAGE: bezpośrednio nie może (strażnik PATCH), więc składa wniosek.
    const tylkoFlaga = await operator(['CUSTOMERS_VIEW', 'CUSTOMERS_INTERNAL_FLAG']);
    const akcBezManage = await operator(['REQUESTS_APPROVE', 'CUSTOMERS_INTERNAL_FLAG']);
    const akc = await operator(['REQUESTS_APPROVE', 'CUSTOMERS_MANAGE', 'CUSTOMERS_INTERNAL_FLAG']);
    const komplet = await operator(['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE', 'CUSTOMERS_INTERNAL_FLAG']);
    const k = await klient();

    const zl = await zadanie('POST', '/admin/wnioski', tylkoFlaga, { typ: 'CUSTOMER_INTERNAL_FLAG', userId: k.id, payload: { isInternal: true }, uzasadnienie: 'Konto testowe zespołu.' });
    expect(zl.status).toBe(201);
    const id = zl.body.id as string;
    // Akceptujący bez CUSTOMERS_MANAGE nie wykona przez wniosek tego, czego bezpośrednio nie może — i nie dostaje powiadomienia.
    expect((await zadanie('POST', `/admin/wnioski/${id}/akceptuj`, akcBezManage, {})).status).toBe(403);
    expect(await prisma().notification.count({ where: { userId: akcBezManage.id, link: '/wnioski' } })).toBe(0);
    expect(await prisma().notification.count({ where: { userId: akc.id, link: '/wnioski' } })).toBe(1);
    expect((await zadanie('POST', `/admin/wnioski/${id}/akceptuj`, akc, {})).body).toMatchObject({ status: 'APPROVED' });
    expect((await prisma().user.findUniqueOrThrow({ where: { id: k.id } })).isInternal).toBe(true);
    // Kto ma komplet, wykonuje bezpośrednio.
    const sam = await zadanie('POST', '/admin/wnioski', komplet, { typ: 'CUSTOMER_INTERNAL_FLAG', userId: k.id, payload: { isInternal: false }, uzasadnienie: 'Koniec testów.' });
    expect(sam.body).toMatchObject({ code: 'WYKONAJ_BEZPOSREDNIO' });
  });

  it('konto klienta (USER) nie wchodzi na wnioski', async () => {
    const k = await klient();
    expect((await zadanie('GET', '/admin/wnioski/moje', { id: k.id, role: 'USER' })).status).toBe(403);
    expect((await zadanie('POST', '/admin/wnioski', { id: k.id, role: 'USER' }, { typ: 'WALLET_CREDIT', userId: k.id, payload: { amount: 5 }, uzasadnienie: 'Proszę o środki.' })).status).toBe(403);
  });
});
