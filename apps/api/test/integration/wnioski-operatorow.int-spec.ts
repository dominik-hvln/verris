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
import { UsersAdminController } from '../../src/users/users.admin.controller.js';
import { NotatkiKlientaService } from '../../src/users/notatki-klienta.service.js';
import { CustomerIamService } from '../../src/users/customer-iam.service.js';
import { WnioskiService } from '../../src/wnioski/wnioski.service.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { ZawieszenieOperatoraService } from '../../src/subscriptions/zawieszenie-operatora.service.js';
import { CyklZyciaUslugiService } from '../../src/subscriptions/cykl-zycia-uslugi.service.js';
import { AddonService } from '../../src/addons/addon.service.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service.js';
import { UslugiWezlaAdminController, UslugiWezlaService } from '../../src/servers/uslugi-wezla.admin.controller.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

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
  controllers: [WnioskiAdminController, UslugiWezlaAdminController, UsersAdminController],
  providers: [
    JwtStrategy,
    WnioskiService,
    // F3.4 — prawdziwe zlecenie restartu usługi węzła (zadanie NODE_SERVICES w Postgresie, dziennik).
    UslugiWezlaService,
    UsersAdminService,
    AnulowanieService,
    NotificationsService,
    // F3.5 — prawdziwa zmiana daty odnowienia (Postgres, dziennik); Stripe nieużywany przy usłudze z portfela.
    CyklZyciaUslugiService,
    {
      // F3.5 — prawdziwy sklep dodatków (rekord zakupu, księga); zgłoszenie dla zespołu podstawione.
      provide: AddonService,
      inject: [PrismaService, AuditService],
      useFactory: (p: PrismaService, a: AuditService) =>
        new AddonService(p, a, new WalletLedgerService(p), { create: async () => ({ id: `t-${Date.now()}` }) } as never),
    },
    { provide: PrismaService, useFactory: () => prisma() },
    { provide: JwtService, useValue: jwt },
    { provide: ConfigService, useValue: { get: () => SEKRET } },
    AuditService,
    { provide: MailerService, useValue: { send: async (m: { to: string; subject: string }) => (maile.push(m), { delivered: true }) } },
    { provide: StatusService, useValue: {} },
    { provide: StripeService, useValue: { isConfigured: () => false } },
    { provide: NotatkiKlientaService, useValue: {} },
    { provide: CustomerIamService, useValue: {} },
    { provide: UsersService, useValue: {} },
    { provide: HostingDiagnosticsService, useValue: {} },
    {
      // F2.3 — prawdziwe zawieszenie (stan w Postgresie, dziennik); węzeł (DirectAdmin) podstawiony.
      provide: ZawieszenieOperatoraService,
      inject: [PrismaService, AuditService, MailerService],
      useFactory: (p: PrismaService, a: AuditService, m: MailerService) => {
        const subs = new SubscriptionsService(
          p, a, new WalletLedgerService(p), null as never, null as never, null as never, null as never,
          m, { get: () => undefined } as never, null as never, null as never, null as never, null as never,
        );
        const naWezle = subs as unknown as Record<'suspendOnDa' | 'unsuspendOnDa', (s: string, u: string) => Promise<void>>;
        naWezle.suspendOnDa = async (_s, u) => {
          if (wezelPada) throw new Error('węzeł nie odpowiada');
          zawieszoneNaWezle.push(u);
        };
        naWezle.unsuspendOnDa = async (_s, u) => void zawieszoneNaWezle.push(`-${u}`);
        return new ZawieszenieOperatoraService(p, subs);
      },
    },
    {
      // F3.7 — prawdziwe scalanie zgłoszeń (wniosek TICKET_MERGE); maile i asystent podstawione. Przegląd F3.7: bez
      // tego dostawcy moduł testu nie startował (WnioskiService zależy od TicketsService) i cały plik padał.
      provide: TicketsService,
      inject: [PrismaService, AuditService, MailerService, ConfigService, NotificationsService],
      useFactory: (p: PrismaService, a: AuditService, m: MailerService, c: ConfigService, n: NotificationsService) =>
        new TicketsService(p, m, c, {} as never, a, n, new OpiekaZgloszenService(p, m, c, a, n, { supportSuggestion: async () => null } as never)),
    },
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
const maile: { to: string; subject: string }[] = [];
const zawieszoneNaWezle: string[] = [];
/** Przegląd F2.3 — węzeł odmawia zawieszenia. */
let wezelPada = false;
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
    zawieszoneNaWezle.length = 0;
    maile.length = 0;
    wezelPada = false;
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

  it('F3.4: NOC przy działającej usłudze wspólnej dostaje WYMAGA_WNIOSKU → wniosek bez klienta → L4 nie zdecyduje, ADMIN tak → zadanie restartu bez „tylko gdy stoi”', async () => {
    const noc = await operator(['NODES_VIEW', 'NODE_SERVICES']);
    const kier = await operator(['REQUESTS_APPROVE', 'NODE_SERVICES', 'NODES_MANAGE', 'BILLING_MANAGE']);
    const admin = await operator([], 'ADMIN');
    const wezel = await utworzWezel();

    const bezposrednio = await zadanie('POST', `/admin/servers/${wezel.id}/uslugi/restart-wspolnej`, noc, { usluga: 'exim', powod: 'kolejka stoi od godziny', potwierdzenie: wezel.name });
    expect(bezposrednio.status).toBe(403);
    expect(bezposrednio.body).toMatchObject({ code: 'WYMAGA_WNIOSKU', operacja: 'NODE_SERVICE_RESTART' });
    // Usługa pomocnicza nie idzie wnioskiem (DTO przyjmuje tylko usługi wspólne).
    expect((await zadanie('POST', '/admin/wnioski', noc, { typ: 'NODE_SERVICE_RESTART', payload: { serverId: wezel.id, usluga: 'fail2ban' }, uzasadnienie: 'fail2ban wisi' })).status).toBe(400);

    const zl = await zadanie('POST', '/admin/wnioski', noc, { typ: 'NODE_SERVICE_RESTART', payload: { serverId: wezel.id, usluga: 'exim' }, uzasadnienie: 'Kolejka poczty stoi od godziny.' });
    expect(zl.status).toBe(201);
    expect(zl.body).toMatchObject({ status: 'PENDING', klient: null, opis: `Restart: Poczta SMTP (Exim) na węźle ${wezel.id.slice(0, 8)} — przerwa dla wszystkich kont węzła` });
    const id = zl.body.id as string;
    // Powiadomienie tylko do administratora (żadna rola systemowa nie ma NODE_SERVICES_RESTART_SHARED).
    expect((await prisma().notification.findMany({ where: { link: '/wnioski' } })).map((n) => n.userId)).toEqual([admin.id]);
    expect((await zadanie('POST', `/admin/wnioski/${id}/akceptuj`, kier, {})).status).toBe(403);
    expect(await prisma().nodeTask.count({ where: { serverId: wezel.id } })).toBe(0);

    const ok = await zadanie('POST', `/admin/wnioski/${id}/akceptuj`, admin, {});
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'APPROVED', wynik: { komunikat: 'Zlecono restart: Poczta SMTP (Exim). Wynik na karcie węzła (Usługi i logi).' } });
    const zadania = await prisma().nodeTask.findMany({ where: { serverId: wezel.id } });
    expect(zadania.map((z) => [z.kind, z.payload, z.requestedById])).toEqual([['NODE_SERVICES', { mode: 'restart', name: 'exim' }, admin.id]]);
    await wczytajDziennik();
    expect(dziennik.find((d) => d.action === 'NODE_SERVICE_RESTART_QUEUED')).toMatchObject({
      actorUserId: admin.id,
      details: { serverId: wezel.id, usluga: 'exim', tylkoGdyStoi: false, powod: `Kolejka poczty stoi od godziny. (wniosek ${id.slice(0, 8)})`, wniosekId: id, wnioskujacyUserId: noc.id },
    });

    // NOC uruchamia sam usługę wspólną, która stoi — zadanie z „tylko gdy stoi” (skrypt odmówi, jeśli działa).
    expect((await zadanie('POST', `/admin/servers/${wezel.id}/uslugi/restart`, noc, { usluga: 'dovecot', powod: 'dovecot padł po aktualizacji' })).status).toBe(409);
    await prisma().nodeTask.updateMany({ where: { serverId: wezel.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
    expect((await zadanie('POST', `/admin/servers/${wezel.id}/uslugi/restart`, noc, { usluga: 'dovecot', powod: 'dovecot padł po aktualizacji' })).status).toBe(200);
    expect((await prisma().nodeTask.findFirstOrThrow({ where: { serverId: wezel.id, status: 'QUEUED' } })).payload).toEqual({ mode: 'restart', name: 'dovecot', onlyDown: '1' });
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

  it('F2.3 zawieszenie: L2 składa wniosek ze zgłoszeniem klienta, L4 akceptuje → usługa i konto zawieszone; klient widzi „obsługa Verris (zgłoszenie #…)”', async () => {
    const l1 = await operator(['CUSTOMERS_VIEW', 'TICKETS_MANAGE']);
    const l2 = await operator(['CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE']);
    const l4 = await operator(['REQUESTS_APPROVE', 'SUBSCRIPTIONS_SUSPEND']);
    const l3 = await operator(['SUBSCRIPTIONS_MANAGE', 'SUBSCRIPTIONS_SUSPEND']);
    const wezel = await utworzWezel();
    const plan = await utworzPlan({ productKind: 'HOSTING' });
    const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
    await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: 'ACTIVE' } });
    const zgl = await prisma().ticket.create({ data: { userId: k.user.id, subject: 'Phishing na stronie', message: 'Zgłoszenie' } });
    const inny = await klient();
    const obce = await prisma().ticket.create({ data: { userId: inny.id, subject: 'Inne', message: 'x' } });
    const wniosek = (kto: { id: string; role: string }, zgloszenie: string) =>
      zadanie('POST', '/admin/wnioski', kto, {
        typ: 'SUBSCRIPTION_SUSPEND',
        userId: k.user.id,
        subscriptionId: k.subscription.id,
        payload: { subscriptionId: k.subscription.id, reason: 'ABUSE', zgloszenie },
        uzasadnienie: 'Phishing potwierdzony, klient nie odpowiada.',
      });

    // L1 nie zleca zawieszenia; L3 wykonuje bezpośrednio; numer zgłoszenia innego klienta — 400.
    expect((await wniosek(l1, `#${zgl.id.slice(0, 8)}`)).status).toBe(403);
    expect((await wniosek(l3, `#${zgl.id.slice(0, 8)}`)).body).toMatchObject({ code: 'WYKONAJ_BEZPOSREDNIO' });
    expect((await wniosek(l2, `#${obce.id.slice(0, 8)}`)).status).toBe(400);

    const zl = await wniosek(l2, `#${zgl.id.slice(0, 8)}`);
    expect(zl.status).toBe(201);
    expect((await zadanie('POST', `/admin/wnioski/${zl.body.id as string}/akceptuj`, l4, {})).body).toMatchObject({
      status: 'APPROVED',
      wynik: { komunikat: 'Usługa zawieszona.' },
    });
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: k.subscription.id } })).status).toBe('SUSPENDED');
    expect((await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } })).status).toBe('SUSPENDED');
    expect(zawieszoneNaWezle).toEqual([k.account.daUsername]);

    await wczytajDziennik();
    const wpis = dziennik.find((d) => d.action === 'SUBSCRIPTION_SUSPENDED')!;
    expect(wpis).toMatchObject({ userId: k.user.id, actorUserId: l4.id });
    expect(wpis.details).toMatchObject({ reason: 'ABUSE', zgloszenieId: zgl.id, domain: k.account.domain, wniosekId: zl.body.id, wnioskujacyUserId: l2.id });

    // D3 — aktywność klienta: bez nazwiska i e-maila operatora, z numerem zgłoszenia.
    const aktywnosc = await new UsersService(prisma() as never, {} as never, {} as never, {} as never, {} as never, {} as never).listMyActivity(k.user.id);
    const e = aktywnosc.events.find((x) => x.action === 'SUBSCRIPTION_SUSPENDED')!;
    expect(e).toMatchObject({ actor: `obsługa Verris (zgłoszenie #${zgl.id.slice(0, 8)})`, context: k.account.domain });

    // Drugi wniosek o to samo — usługa już zawieszona.
    expect((await wniosek(l2, '')).status).toBe(400);
  });

  it('F3.5 data odnowienia: L2 składa wniosek, L3 bez BILLING_MANAGE nie akceptuje, L4 akceptuje → nowa data, bez obciążenia; klient widzi „obsługa Verris”', async () => {
    const l2 = await operator(['CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE']);
    const l3 = await operator(['REQUESTS_APPROVE', 'SUBSCRIPTIONS_MANAGE', 'SUBSCRIPTIONS_SUSPEND']);
    const l4 = await operator(['REQUESTS_APPROVE', 'SUBSCRIPTIONS_MANAGE', 'BILLING_MANAGE']);
    const plan = await utworzPlan();
    const k = await klient();
    const koniec = new Date(Date.now() + 10 * 86400000);
    const u = await prisma().subscription.create({
      data: { userId: k.id, planId: plan.id, status: 'ACTIVE', interval: 'MONTH', priceAmount: 45, paymentSource: 'WALLET', currentPeriodEnd: koniec },
    });
    const nowa = new Date(koniec.getTime() + 7 * 86400000).toISOString();
    const zl = await zadanie('POST', '/admin/wnioski', l2, {
      typ: 'SUBSCRIPTION_RENEWAL_DATE',
      userId: k.id,
      subscriptionId: u.id,
      payload: { subscriptionId: u.id, nowaData: nowa, przed: koniec.toISOString() },
      uzasadnienie: 'Rekompensata za awarię węzła 10.10.',
    });
    expect(zl.status).toBe(201);
    expect((await zadanie('POST', `/admin/wnioski/${zl.body.id as string}/akceptuj`, l3, {})).status).toBe(403);
    expect((await zadanie('POST', `/admin/wnioski/${zl.body.id as string}/akceptuj`, l4, {})).body).toMatchObject({ status: 'APPROVED' });
    const po = await prisma().subscription.findUniqueOrThrow({ where: { id: u.id } });
    expect(po.currentPeriodEnd?.toISOString()).toBe(nowa);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id } })).toBe(0);
    await wczytajDziennik();
    expect(dziennik.find((d) => d.action === 'SUBSCRIPTION_RENEWAL_DATE_CHANGED')).toMatchObject({
      userId: k.id,
      actorUserId: l4.id,
      details: expect.objectContaining({ dni: 7, wniosekId: zl.body.id, wnioskujacyUserId: l2.id }),
    });
    const aktywnosc = await new UsersService(prisma() as never, {} as never, {} as never, {} as never, {} as never, {} as never).listMyActivity(k.id);
    expect(aktywnosc.events.find((x) => x.action === 'SUBSCRIPTION_RENEWAL_DATE_CHANGED')).toMatchObject({ actor: 'obsługa Verris' });
  });

  it('audyt Fali 3 — uzasadnienie 5–9 znaków: wniosek o datę odnowienia przechodzi przy złożeniu i przy akceptacji (powód z numerem wniosku)', async () => {
    const l2 = await operator(['CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE']);
    const l4 = await operator(['REQUESTS_APPROVE', 'SUBSCRIPTIONS_MANAGE', 'BILLING_MANAGE']);
    const plan = await utworzPlan();
    const k = await klient();
    const koniec = new Date(Date.now() + 10 * 86400000);
    const u = await prisma().subscription.create({
      data: { userId: k.id, planId: plan.id, status: 'ACTIVE', interval: 'MONTH', priceAmount: 45, paymentSource: 'WALLET', currentPeriodEnd: koniec },
    });
    const nowa = new Date(koniec.getTime() + 7 * 86400000).toISOString();
    const zl = await zadanie('POST', '/admin/wnioski', l2, {
      typ: 'SUBSCRIPTION_RENEWAL_DATE',
      userId: k.id,
      subscriptionId: u.id,
      payload: { subscriptionId: u.id, nowaData: nowa, przed: koniec.toISOString() },
      uzasadnienie: 'gratis',
    });
    expect(zl.status).toBe(201);
    expect((await zadanie('POST', `/admin/wnioski/${zl.body.id as string}/akceptuj`, l4, {})).body).toMatchObject({ status: 'APPROVED' });
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: u.id } })).currentPeriodEnd?.toISOString()).toBe(nowa);
    await wczytajDziennik();
    expect(dziennik.find((d) => d.action === 'OPERATOR_ACCOUNT_CHANGED')).toMatchObject({
      details: expect.objectContaining({ powod: `gratis (wniosek ${(zl.body.id as string).slice(0, 8)})` }),
    });
  });

  it('audyt Fali 3 — dodatek z portfela: usługa zakończona między złożeniem a akceptacją → FAILED, bez obciążenia', async () => {
    const l2 = await operator(['CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE']);
    const l4 = await operator(['REQUESTS_APPROVE', 'SUBSCRIPTIONS_MANAGE', 'BILLING_MANAGE']);
    const plan = await utworzPlan();
    const k = await klient();
    await prisma().user.update({ where: { id: k.id }, data: { walletBalance: 100 } });
    const zgl = await prisma().ticket.create({ data: { userId: k.id, subject: 'IP', message: 'x' } });
    const u = await prisma().subscription.create({ data: { userId: k.id, planId: plan.id, status: 'ACTIVE', interval: 'MONTH', priceAmount: 45 } });
    const zl = await zadanie('POST', '/admin/wnioski', l2, {
      typ: 'ADDON_ADD',
      userId: k.id,
      subscriptionId: u.id,
      payload: { subscriptionId: u.id, slug: 'dedicated_ip', platnosc: 'PORTFEL', zgloszenie: zgl.id },
      uzasadnienie: 'Klient zamówił IP w zgłoszeniu.',
    });
    expect(zl.status).toBe(201);
    await prisma().subscription.update({ where: { id: u.id }, data: { status: 'CANCELED', canceledAt: new Date() } });
    expect((await zadanie('POST', `/admin/wnioski/${zl.body.id as string}/akceptuj`, l4, {})).body).toMatchObject({ status: 'FAILED' });
    expect(Number((await prisma().user.findUniqueOrThrow({ where: { id: k.id } })).walletBalance)).toBe(100);
    expect(await prisma().purchasedAddon.count({ where: { userId: k.id } })).toBe(0);
  });

  it('audyt Fali 3 — data odnowienia: okres zmienił się po złożeniu (odnowienie) → akceptacja FAILED, opłacony okres nie skrócony; wniosek bez „przed” — 400', async () => {
    const l2 = await operator(['CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE']);
    const l4 = await operator(['REQUESTS_APPROVE', 'SUBSCRIPTIONS_MANAGE', 'BILLING_MANAGE']);
    const plan = await utworzPlan();
    const k = await klient();
    const zgl = await prisma().ticket.create({ data: { userId: k.id, subject: 'Awaria', message: 'x' } });
    const koniec = new Date(Date.now() + 3 * 86400000);
    const u = await prisma().subscription.create({
      data: { userId: k.id, planId: plan.id, status: 'ACTIVE', interval: 'MONTH', priceAmount: 45, paymentSource: 'WALLET', currentPeriodEnd: koniec },
    });
    const nowa = new Date(koniec.getTime() + 7 * 86400000).toISOString();
    const tresc = (payload: Record<string, unknown>) => ({ typ: 'SUBSCRIPTION_RENEWAL_DATE', userId: k.id, subscriptionId: u.id, payload, uzasadnienie: 'Rekompensata za awarię węzła 10.10.' });
    expect((await zadanie('POST', '/admin/wnioski', l2, tresc({ subscriptionId: u.id, nowaData: nowa, zgloszenie: zgl.id }))).status).toBe(400);
    // Nieaktualna data na karcie — odmowa już przy złożeniu.
    expect((await zadanie('POST', '/admin/wnioski', l2, tresc({ subscriptionId: u.id, nowaData: nowa, przed: new Date(koniec.getTime() - 86400000).toISOString(), zgloszenie: zgl.id }))).status).toBe(409);
    const zl = await zadanie('POST', '/admin/wnioski', l2, tresc({ subscriptionId: u.id, nowaData: nowa, przed: koniec.toISOString(), zgloszenie: zgl.id }));
    expect(zl.status).toBe(201);
    // Odnowienie w międzyczasie: okres przesunięty o miesiąc.
    const odnowiony = new Date(koniec.getTime() + 30 * 86400000);
    await prisma().subscription.update({ where: { id: u.id }, data: { currentPeriodStart: koniec, currentPeriodEnd: odnowiony } });
    expect((await zadanie('POST', `/admin/wnioski/${zl.body.id as string}/akceptuj`, l4, {})).body).toMatchObject({ status: 'FAILED' });
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: u.id } })).currentPeriodEnd?.toISOString()).toBe(odnowiony.toISOString());
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: u.id, type: 'RENEWAL_DATE_CHANGED' } })).toBe(0);
  });

  it('F3.5 dodatek gratis: L2 składa wniosek, L4 akceptuje → dodatek 0 zł bez obciążenia portfela, raz', async () => {
    const l2 = await operator(['CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE']);
    const l4 = await operator(['REQUESTS_APPROVE', 'SUBSCRIPTIONS_MANAGE', 'BILLING_MANAGE']);
    const plan = await utworzPlan();
    const k = await klient();
    const u = await prisma().subscription.create({ data: { userId: k.id, planId: plan.id, status: 'ACTIVE', interval: 'MONTH', priceAmount: 45 } });
    const zl = await zadanie('POST', '/admin/wnioski', l2, {
      typ: 'ADDON_ADD',
      userId: k.id,
      subscriptionId: u.id,
      payload: { subscriptionId: u.id, slug: 'priority_support_30d', platnosc: 'GRATIS' },
      uzasadnienie: 'Rekompensata za awarię węzła 10.10.',
    });
    expect(zl.status).toBe(201);
    expect((await zadanie('POST', `/admin/wnioski/${zl.body.id as string}/akceptuj`, l4, {})).body).toMatchObject({ status: 'APPROVED' });
    expect((await prisma().purchasedAddon.findMany({ where: { userId: k.id } })).map((z) => [z.slug, Number(z.amount), z.status])).toEqual([['priority_support_30d', 0, 'APPLIED']]);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id } })).toBe(0);
    expect((await prisma().user.findUniqueOrThrow({ where: { id: k.id } })).prioritySupport).toBe(true);
    // Z portfela klienta bez jego zgłoszenia — wniosek odrzucony już przy złożeniu.
    const bez = await zadanie('POST', '/admin/wnioski', l2, {
      typ: 'ADDON_ADD',
      userId: k.id,
      payload: { subscriptionId: u.id, slug: 'dedicated_ip', platnosc: 'PORTFEL' },
      uzasadnienie: 'Klient prosił telefonicznie.',
    });
    expect(bez.status).toBe(400);
  });

  it('przegląd F2.3: węzeł odmawia zawieszenia → wniosek FAILED, usługa i konto dalej aktywne (nie „zawieszona” przy działającej stronie)', async () => {
    const l2 = await operator(['CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE']);
    const l4 = await operator(['REQUESTS_APPROVE', 'SUBSCRIPTIONS_SUSPEND']);
    const wezel = await utworzWezel();
    const plan = await utworzPlan({ productKind: 'HOSTING' });
    const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
    await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: 'ACTIVE' } });
    const zl = await zadanie('POST', '/admin/wnioski', l2, {
      typ: 'SUBSCRIPTION_SUSPEND',
      userId: k.user.id,
      payload: { subscriptionId: k.subscription.id, reason: 'ABUSE' },
      uzasadnienie: 'Phishing potwierdzony, klient nie odpowiada.',
    });
    expect(zl.status).toBe(201);
    wezelPada = true;
    const akc = await zadanie('POST', `/admin/wnioski/${zl.body.id as string}/akceptuj`, l4, {});
    expect(akc.body).toMatchObject({ status: 'FAILED' });
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: k.subscription.id } })).status).toBe('ACTIVE');
    expect((await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } })).status).not.toBe('SUSPENDED');
  });

  it('przegląd F2.3: usługa zawieszona za brak płatności — decydujący bez BILLING_MANAGE nie odwiesza (FAILED), z BILLING_MANAGE tak', async () => {
    const l2 = await operator(['CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE']);
    const l3kier = await operator(['REQUESTS_APPROVE', 'SUBSCRIPTIONS_SUSPEND']);
    const l4 = await operator(['REQUESTS_APPROVE', 'SUBSCRIPTIONS_SUSPEND', 'BILLING_MANAGE']);
    const wezel = await utworzWezel();
    const plan = await utworzPlan({ productKind: 'HOSTING' });
    const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
    await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: 'SUSPENDED' } });
    await prisma().subscriptionEvent.create({ data: { subscriptionId: k.subscription.id, type: 'SUSPENDED', details: { reason: 'GRACE_EXPIRED' } } });
    const wniosek = () =>
      zadanie('POST', '/admin/wnioski', l2, {
        typ: 'SUBSCRIPTION_UNSUSPEND',
        userId: k.user.id,
        payload: { subscriptionId: k.subscription.id },
        uzasadnienie: 'Klient obiecał zapłacić jutro.',
      });
    const pierwszy = await wniosek();
    expect(pierwszy.status).toBe(201);
    expect((await zadanie('POST', `/admin/wnioski/${pierwszy.body.id as string}/akceptuj`, l3kier, {})).body).toMatchObject({ status: 'FAILED' });
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: k.subscription.id } })).status).toBe('SUSPENDED');

    const drugi = await wniosek();
    expect(drugi.status).toBe(201);
    expect((await zadanie('POST', `/admin/wnioski/${drugi.body.id as string}/akceptuj`, l4, {})).body).toMatchObject({ status: 'APPROVED' });
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: k.subscription.id } })).status).toBe('ACTIVE');
  });

  it('audyt Fal 2: L3 zmienia e-mail klienta → alert na stary adres i wylogowanie; reset hasła przez L3 w 24 h tylko wnioskiem (akceptuje L4), ADMIN bezpośrednio', async () => {
    const l3 = await operator(['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE']);
    const l4 = await operator(['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE', 'REQUESTS_APPROVE']);
    const admin = await operator([], 'ADMIN');
    const k = await klient();
    const nowy = `przejety-${t()}@test.verris.pl`;

    const zm = await zadanie('POST', `/admin/users/${k.id}/email`, l3, { newEmail: nowy, reason: 'Zgłoszenie #77 — klient zmienił skrzynkę.' });
    expect(zm.status).toBe(200);
    const po = await prisma().user.findUniqueOrThrow({ where: { id: k.id } });
    expect(po.email).toBe(nowy);
    expect(po.tokenVersion).toBe(k.tokenVersion + 1);
    await new Promise((r) => setImmediate(r));
    expect(maile.map((m) => [m.to, m.subject])).toEqual([[k.email, '[Verris] Zmieniono adres e-mail konta']]);

    // Ten sam L3 nie wyśle linku do ustawienia hasła na nowy adres.
    const reset = await zadanie('POST', `/admin/users/${k.id}/reset-password`, l3, { reason: 'Klient nie pamięta hasła.' });
    expect(reset.status).toBe(403);
    expect(reset.body).toMatchObject({ code: 'WYMAGA_WNIOSKU', operacja: 'CUSTOMER_PASSWORD_RESET' });
    expect(await prisma().userAuthToken.count({ where: { userId: k.id, purpose: 'PASSWORD_RESET' } })).toBe(0);

    // Nadmiarowe parametry — dalej 400.
    expect((await zadanie('POST', '/admin/wnioski', l3, { typ: 'CUSTOMER_PASSWORD_RESET', userId: k.id, payload: { haslo: 'x' }, uzasadnienie: 'Klient nie pamięta hasła.' })).status).toBe(400);
    // Wniosek (mimo uprawnienia), własnego nie zaakceptuje, akceptuje L4.
    const w = await zadanie('POST', '/admin/wnioski', l3, { typ: 'CUSTOMER_PASSWORD_RESET', userId: k.id, payload: {}, uzasadnienie: 'Klient nie pamięta hasła po zmianie skrzynki.' });
    expect(w.body).toMatchObject({ status: 'PENDING' });
    expect((await zadanie('POST', `/admin/wnioski/${w.body.id as string}/akceptuj`, l3, {})).status).toBe(403);
    expect((await zadanie('POST', `/admin/wnioski/${w.body.id as string}/akceptuj`, l4, {})).body).toMatchObject({ status: 'APPROVED' });
    expect(await prisma().userAuthToken.count({ where: { userId: k.id, purpose: 'PASSWORD_RESET', usedAt: null } })).toBe(1);

    // ADMIN — bezpośrednio.
    expect((await zadanie('POST', `/admin/users/${k.id}/reset-password`, admin, { reason: 'Klient potwierdził tożsamość.' })).status).toBe(200);

    // Klient bez zmiany e-maila: L3 resetuje bezpośrednio, wniosek nie jest potrzebny.
    const inny = await klient();
    expect((await zadanie('POST', `/admin/users/${inny.id}/reset-password`, l3, { reason: 'Klient nie pamięta hasła.' })).status).toBe(200);
    expect(
      (await zadanie('POST', '/admin/wnioski', l3, { typ: 'CUSTOMER_PASSWORD_RESET', userId: inny.id, payload: {}, uzasadnienie: 'Klient nie pamięta hasła.' })).body,
    ).toMatchObject({ code: 'WYKONAJ_BEZPOSREDNIO' });
  });

  it('przegląd poprawek: po zmianie e-maila przez obsługę formularz „Nie pamiętam hasła” nie wysyła linku, a reset z wniosku nie zatwierdza ten, kto zmienił adres', async () => {
    const l3 = await operator(['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE']);
    const l4 = await operator(['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE', 'REQUESTS_APPROVE']);
    const k = await klient();
    const nowy = `przejety-${t()}@test.verris.pl`;
    expect((await zadanie('POST', `/admin/users/${k.id}/email`, l4, { newEmail: nowy, reason: 'Zgłoszenie #78 — nowa skrzynka.' })).status).toBe(200);
    maile.length = 0;

    // Formularz publiczny na nowy adres — bez linku (tylko informacja), bez tokenu.
    const n = {} as never;
    const auth = new AuthService(
      prisma() as never, n, n, n, n, n, n, n,
      { send: async (m: { to: string; subject: string }) => (maile.push(m), { delivered: true }) } as never,
      { get: () => undefined } as never, n, n, n,
    );
    await expect(auth.requestPasswordReset({ email: nowy } as never)).resolves.toEqual({ ok: true });
    await new Promise((r) => setImmediate(r));
    expect(await prisma().userAuthToken.count({ where: { userId: k.id, purpose: 'PASSWORD_RESET' } })).toBe(0);
    expect(maile.map((m) => m.to)).toEqual([nowy]);

    // L3 składa wniosek, a akceptuje go L4, który sam zmienił adres — odmowa, bez linku.
    const w = await zadanie('POST', '/admin/wnioski', l3, { typ: 'CUSTOMER_PASSWORD_RESET', userId: k.id, payload: {}, uzasadnienie: 'Klient nie pamięta hasła po zmianie skrzynki.' });
    expect(w.body).toMatchObject({ status: 'PENDING' });
    const a = await zadanie('POST', `/admin/wnioski/${w.body.id as string}/akceptuj`, l4, {});
    expect(a.body).toMatchObject({ status: 'FAILED' });
    expect(JSON.stringify(a.body)).toContain('zatwierdza inna osoba');
    expect(await prisma().userAuthToken.count({ where: { userId: k.id, purpose: 'PASSWORD_RESET' } })).toBe(0);

    // Klient bez zmiany e-maila — formularz działa jak dotąd.
    const inny = await klient();
    await auth.requestPasswordReset({ email: inny.email } as never);
    expect(await prisma().userAuthToken.count({ where: { userId: inny.id, purpose: 'PASSWORD_RESET', usedAt: null } })).toBe(1);
  });

  it('konto klienta (USER) nie wchodzi na wnioski', async () => {
    const k = await klient();
    expect((await zadanie('GET', '/admin/wnioski/moje', { id: k.id, role: 'USER' })).status).toBe(403);
    expect((await zadanie('POST', '/admin/wnioski', { id: k.id, role: 'USER' }, { typ: 'WALLET_CREDIT', userId: k.id, payload: { amount: 5 }, uzasadnienie: 'Proszę o środki.' })).status).toBe(403);
  });

  it('F3.7 — scalenie zgłoszeń przez wniosek: L1 składa, kierownik z TICKETS_MERGE akceptuje, wątek przechodzi raz; bez TICKETS_MERGE 403', async () => {
    const l1 = await operator(['TICKETS_VIEW', 'TICKETS_MANAGE']);
    const l3 = await operator(['TICKETS_VIEW', 'TICKETS_MANAGE', 'TICKETS_MERGE']);
    const kier = await operator(['REQUESTS_APPROVE', 'TICKETS_MANAGE', 'TICKETS_MERGE']);
    const kierBez = await operator(['REQUESTS_APPROVE', 'TICKETS_MANAGE']);
    const k = await klient();
    const a = await prisma().ticket.create({ data: { userId: k.id, subject: 'A', message: 'Poczta nie działa' } });
    await prisma().ticketReply.create({ data: { ticketId: a.id, authorId: l1.id, isStaff: true, internal: true, message: 'NOTATKA-WEWN' } });
    const b = await prisma().ticket.create({ data: { userId: k.id, subject: 'B', message: 'Drugi raz to samo' } });

    // Bezpośrednio: L1 → 403 z kodem wniosku; L3 z TICKETS_MERGE nie składa wniosku (wykonuje sam).
    const wn = { typ: 'TICKET_MERGE', userId: k.id, payload: { zrodloId: a.id, celId: b.id }, uzasadnienie: 'Ta sama sprawa z maila i z panelu.' };
    expect((await zadanie('POST', '/admin/wnioski', l3, wn)).body).toMatchObject({ code: 'WYKONAJ_BEZPOSREDNIO' });
    const zl = await zadanie('POST', '/admin/wnioski', l1, wn);
    expect(zl.status).toBe(201);
    const id = zl.body.id as string;
    expect((await zadanie('POST', `/admin/wnioski/${id}/akceptuj`, kierBez, {})).status).toBe(403);
    expect((await zadanie('POST', `/admin/wnioski/${id}/akceptuj`, l1, {})).status).toBe(403);
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: a.id } })).scalonoDoId).toBeNull();

    const ok = await zadanie('POST', `/admin/wnioski/${id}/akceptuj`, kier, {});
    expect(ok.body).toMatchObject({ status: 'APPROVED' });
    expect(await prisma().ticket.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ scalonoDoId: b.id, status: 'CLOSED' });
    const notatka = await prisma().ticketReply.findFirstOrThrow({ where: { message: 'NOTATKA-WEWN' } });
    expect(notatka).toMatchObject({ ticketId: b.id, internal: true });
    await wczytajDziennik();
    expect(dziennik.filter((d) => d.action === 'TICKET_MERGED')).toEqual([
      expect.objectContaining({ actorUserId: kier.id, userId: k.id, details: expect.objectContaining({ zrodlo: a.id, cel: b.id, wniosekId: id }) }),
    ]);
    // Ponowny wniosek na scalone → 400 przy złożeniu.
    expect((await zadanie('POST', '/admin/wnioski', l1, wn)).status).toBe(400);
  });
});
