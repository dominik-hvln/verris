import { MigrationStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { CryptoService } from '../../src/common/crypto/crypto.service.js';
import { MigrationOrchestratorService } from '../../src/subscriptions/migration-orchestrator.service.js';
import { MigracjaZaKlientaService, ZGODA_WAZNOSC_DNI, hashTokenuZgody } from '../../src/subscriptions/migracja-za-klienta.service.js';
import { MigracjaZgodaController } from '../../src/subscriptions/migracja-zgoda.controller.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

// Z-09 — hosty źródła rozwiązywane w DNS; w teście atrapa („publiczny”), reszta jak na produkcji.
vi.mock('../../src/subscriptions/migration-net.util.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolvePublicHost: vi.fn(async () => '203.0.113.10'),
}));

/**
 * PB-45 — obsługa przygotowuje migrację za klienta, a ta rusza dopiero po jego „Zgadzam się”.
 * Prawdziwy Postgres: warunkowe przejście DRAFT → QUEUED, unikalny skrót tokenu, wygaśnięcie i skasowanie
 * danych źródła. Na zewnątrz (atrapy): DirectAdmin, test logowania IMAP, poczta.
 */
const HASLO_FTP = 'TajneHasloFtp-123';

function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const crypto = new CryptoService({ get: () => 'klucz-testowy-pb45' } as never);
  const notifications = { create: vi.fn(async () => undefined) };
  const directAdmin = {
    assertDomainOwnedBySubscription: vi.fn(async (_s: string, _u: string, d: string) => d),
    skrzynkiNaDomenie: vi.fn(async () => []),
    createHostingEmailAccount: vi.fn(async () => ({ ok: true })),
  };
  const preflight = {
    sprawdzSkrzynke: vi.fn(async () => ({ kind: 'imap', target: 'imap://x', status: 'ok', message: 'ok', latencyMs: 1 })),
    preflightBundle: vi.fn(),
  };
  const maile: Array<{ to: string; subject: string; html: string; text: string }> = [];
  const mailer = {
    send: vi.fn(async (m: { to: string; subject: string; html: string; text: string }) => {
      maile.push(m);
      return { delivered: true };
    }),
  };
  const orkiestrator = new MigrationOrchestratorService(p, crypto, audit, notifications as never, directAdmin as never, preflight as never, null as never);
  const zaKlienta = new MigracjaZaKlientaService(p, orkiestrator, audit, mailer as never, notifications as never, preflight as never);
  return { orkiestrator, zaKlienta, maile, mailer, preflight, notifications, directAdmin };
}

async function przygotuj() {
  const wezel = await utworzWezel();
  const plan = await utworzPlan({ productKind: 'HOSTING' });
  const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
  const operator = await prisma().user.create({ data: { email: `op-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
  return { k, operator, serverId: wezel.id };
}

const zlecenie = () => ({
  targetDomain: 'sklep.example.pl',
  ftp: { host: 'ftp.stary-hosting.pl', port: 21, username: 'sklep', password: HASLO_FTP, protocol: 'ftp' as const },
  mysql: [{ host: 'mysql.stary-hosting.pl', port: 3306, database: 'sklep_db' }],
});

/** Skrzynka do przeniesienia z „załóż brakujące” — przyjęcie zgody zakłada ją na węźle (atrapa DA). */
const zleceniePoczty = () => ({
  targetDomain: 'sklep.example.pl',
  imap: [{ host: 'imap.stary-hosting.pl', email: 'biuro@sklep.example.pl', password: 'HasloSkrzynki-1' }],
  utworzBrakujaceSkrzynki: true,
});

/** Token z linku w mailu (dokładnie to, co dostaje klient). */
function tokenZMaila(maile: Array<{ html: string; text: string }>): string {
  const m = /token=([A-Za-z0-9_-]+)/.exec(maile.at(-1)!.text + maile.at(-1)!.html);
  if (!m) throw new Error('brak tokenu w mailu');
  return m[1]!;
}

describe('PB-45 — migracja za klienta startuje dopiero po jego zgodzie', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('obsługa zakłada → DRAFT bez kroków, worker nic nie dostaje; token w bazie tylko jako skrót; dziennik z operatorem i powodem', async () => {
    const { k, operator, serverId } = await przygotuj();
    const { orkiestrator, zaKlienta, maile } = uslugi();

    const wynik = await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #1234 — przeniesienie sklepu', zlecenie: { ...zlecenie(), consentAccepted: true } });

    expect(wynik.mailWyslany).toBe(true);
    expect(wynik.migracja.status).toBe(MigrationStatus.DRAFT);
    expect(wynik.migracja.consentExpiresAt).toBe(wynik.wygasa);
    const req = await prisma().migrationRequest.findUniqueOrThrow({ where: { id: wynik.migracja.id }, include: { workerJobs: true } });
    expect(req.status).toBe(MigrationStatus.DRAFT);
    expect(req.workerJobs).toHaveLength(0);
    expect(req.userId).toBe(k.user.id);
    expect(req.sourceBundleEnc).not.toContain(HASLO_FTP);
    const token = tokenZMaila(maile);
    expect(maile[0]!.to).toBe(k.user.email);
    expect(req.consentTokenHash).toBe(hashTokenuZgody(token));
    expect(req.consentTokenHash).not.toBe(token);
    expect(req.consentExpiresAt!.getTime() - req.createdAt.getTime()).toBeGreaterThan((ZGODA_WAZNOSC_DNI - 1) * 86_400_000);

    // Worker węzła nie dostaje żadnego kroku, a obsługa nie „wznowi” jej z pominięciem zgody.
    expect(await orkiestrator.leaseFileWorkerJobForNode(serverId)).toBeNull();
    await expect(
      orkiestrator.setStatusForStaff({ migrationRequestId: req.id, actorUserId: operator.id, status: MigrationStatus.RUNNING }),
    ).rejects.toThrow(/czeka na zgodę klienta/);
    await expect(
      orkiestrator.setStatusForStaff({ migrationRequestId: req.id, actorUserId: operator.id, status: MigrationStatus.QUEUED }),
    ).rejects.toThrow(/czeka na zgodę klienta/);

    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'MIGRATION_CONSENT_REQUESTED', userId: k.user.id } });
    expect(wpis.actorUserId).toBe(operator.id);
    expect(wpis.userId).toBe(k.user.id);
    expect(JSON.stringify(wpis.details)).toContain('Zgłoszenie #1234');
    expect(JSON.stringify(wpis.details)).not.toContain(HASLO_FTP);
  });

  it('nagłówek formularza obsługi: usługa, klient i domena konta; nieznana usługa → 404', async () => {
    const { k } = await przygotuj();
    const { zaKlienta } = uslugi();
    const u = await zaKlienta.uslugaDoFormularza(k.subscription.id);
    expect(u).toEqual({
      id: k.subscription.id,
      user: { email: k.user.email, firstName: k.user.firstName, lastName: k.user.lastName },
      account: { domain: k.account.domain },
    });
    await expect(zaKlienta.uslugaDoFormularza('00000000-0000-4000-8000-000000000000')).rejects.toThrow(/Nie znaleziono usługi/);
  });

  it('szczegóły dla klienta: co i skąd, bez haseł', async () => {
    const { k, operator } = await przygotuj();
    const { zaKlienta, maile } = uslugi();
    const { migracja } = await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #1', zlecenie: zlecenie() });

    const s = await zaKlienta.szczegoly({ subscriptionId: k.subscription.id, userId: k.user.id, migrationId: migracja.id, token: tokenZMaila(maile) });
    expect(s.stan).toBe('oczekuje');
    expect(s.zrodlo?.ftp?.host).toBe('ftp.stary-hosting.pl');
    expect(s.zrodlo?.mysql[0]?.database).toBe('sklep_db');
    expect(JSON.stringify(s)).not.toContain(HASLO_FTP);
    expect(JSON.stringify(s)).not.toMatch(/password/i);
  });

  it('zgoda → QUEUED z krokami workera, IP i czas zgody zapisane; ponowne użycie tokenu odrzucone', async () => {
    const { k, operator } = await przygotuj();
    const { zaKlienta, maile, notifications } = uslugi();
    const { migracja } = await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #2', zlecenie: zlecenie() });
    const token = tokenZMaila(maile);

    const wynik = await zaKlienta.przyjmij({ subscriptionId: k.subscription.id, userId: k.user.id, actorUserId: k.user.id, migrationId: migracja.id, token, ip: '198.51.100.7' });
    expect(wynik.id).toBe(migracja.id);
    expect(wynik.status).toBe(MigrationStatus.QUEUED);

    const req = await prisma().migrationRequest.findUniqueOrThrow({ where: { id: migracja.id }, include: { workerJobs: true } });
    expect(req.status).toBe(MigrationStatus.QUEUED);
    expect(req.consentIp).toBe('198.51.100.7');
    expect(req.consentDecidedAt).not.toBeNull();
    expect(req.workerJobs.map((j) => j.kind).sort()).toEqual(['FILES_SFTP_RSYNC', 'HTTP_POST_CHECK', 'MYSQL_IMPORT', 'WP_FIXUP']);
    // Jedno zlecenie — przejście tego samego wiersza, nie drugie.
    expect(await prisma().migrationRequest.count({ where: { subscriptionId: k.subscription.id } })).toBe(1);

    const kolejka = await prisma().auditLog.findFirstOrThrow({ where: { action: 'MIGRATION_BUNDLE_QUEUED', userId: k.user.id } });
    expect(kolejka.actorUserId).toBe(k.user.id);
    expect(kolejka.details).toMatchObject({ consent: { accepted: true, ip: '198.51.100.7', via: 'operator_request', requestedBy: operator.id } });
    expect(await prisma().auditLog.count({ where: { action: 'MIGRATION_CONSENT_ACCEPTED', userId: k.user.id } })).toBe(1);
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: operator.id }));

    await expect(
      zaKlienta.przyjmij({ subscriptionId: k.subscription.id, userId: k.user.id, actorUserId: k.user.id, migrationId: migracja.id, token, ip: null }),
    ).rejects.toThrow(/już rozpatrzona/);
    await expect(
      zaKlienta.odrzuc({ subscriptionId: k.subscription.id, userId: k.user.id, actorUserId: k.user.id, migrationId: migracja.id, token, ip: null }),
    ).rejects.toThrow(/już rozpatrzona/);
    expect(await prisma().migrationWorkerJob.count({ where: { migrationRequestId: migracja.id } })).toBe(4);
  });

  it('cudzy token i cudza prośba → 404, nic nie rusza', async () => {
    const { k, operator } = await przygotuj();
    const inny = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan({ productKind: 'HOSTING' })).id });
    const { zaKlienta, maile } = uslugi();
    const a = await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie A', zlecenie: zlecenie() });
    const tokenA = tokenZMaila(maile);
    const b = await zaKlienta.utworz({ subscriptionId: inny.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie B', zlecenie: zlecenie() });
    const tokenB = tokenZMaila(maile);

    // Token prośby B przy prośbie A (właściciel A zalogowany) — nie pasuje.
    await expect(
      zaKlienta.przyjmij({ subscriptionId: k.subscription.id, userId: k.user.id, actorUserId: k.user.id, migrationId: a.migracja.id, token: tokenB, ip: null }),
    ).rejects.toThrow(/Nie znaleziono prośby/);
    // Klient B z tokenem A — prośba nie jego.
    await expect(
      zaKlienta.przyjmij({ subscriptionId: k.subscription.id, userId: inny.user.id, actorUserId: inny.user.id, migrationId: a.migracja.id, token: tokenA, ip: null }),
    ).rejects.toThrow(/Nie znaleziono prośby/);
    await expect(
      zaKlienta.szczegoly({ subscriptionId: inny.subscription.id, userId: inny.user.id, migrationId: a.migracja.id }),
    ).rejects.toThrow(/Nie znaleziono prośby/);
    // Zwykłe zlecenie z kreatora klienta nie jest „prośbą o zgodę”.
    const zKreatora = await prisma().migrationRequest.create({
      data: { subscriptionId: k.subscription.id, userId: k.user.id, sourceBundleEnc: 'x', status: MigrationStatus.CANCELED },
    });
    await expect(
      zaKlienta.przyjmij({ subscriptionId: k.subscription.id, userId: k.user.id, actorUserId: k.user.id, migrationId: zKreatora.id, ip: null }),
    ).rejects.toThrow(/Nie znaleziono prośby/);
    expect((await prisma().migrationRequest.findUniqueOrThrow({ where: { id: a.migracja.id } })).status).toBe(MigrationStatus.DRAFT);
    expect((await prisma().migrationRequest.findUniqueOrThrow({ where: { id: b.migracja.id } })).status).toBe(MigrationStatus.DRAFT);
  });

  it('odrzucenie → anulowana, dane źródła skasowane od razu; potem zgoda niemożliwa', async () => {
    const { k, operator } = await przygotuj();
    const { zaKlienta, maile } = uslugi();
    const { migracja } = await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #3', zlecenie: zlecenie() });
    const token = tokenZMaila(maile);

    const s = await zaKlienta.odrzuc({ subscriptionId: k.subscription.id, userId: k.user.id, actorUserId: k.user.id, migrationId: migracja.id, token, ip: '198.51.100.8' });
    expect(s.stan).toBe('odrzucona');
    expect(s.zrodlo).toBeNull();
    const req = await prisma().migrationRequest.findUniqueOrThrow({ where: { id: migracja.id }, include: { workerJobs: true } });
    expect(req.status).toBe(MigrationStatus.CANCELED);
    expect(req.sourceBundleEnc).toBe('');
    expect(req.secretsPurgedAt).not.toBeNull();
    expect(req.workerJobs).toHaveLength(0);
    expect(await prisma().auditLog.count({ where: { action: 'MIGRATION_CONSENT_REJECTED', userId: k.user.id } })).toBe(1);

    await expect(
      zaKlienta.przyjmij({ subscriptionId: k.subscription.id, userId: k.user.id, actorUserId: k.user.id, migrationId: migracja.id, token, ip: null }),
    ).rejects.toThrow(/już rozpatrzona/);
  });

  it('wygaśnięcie: po terminie zgoda odrzucona, cron anuluje i kasuje dane źródła; świeże prośby zostają', async () => {
    const { k, operator } = await przygotuj();
    const inny = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan({ productKind: 'HOSTING' })).id });
    const { zaKlienta, maile } = uslugi();
    const { migracja } = await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #4', zlecenie: zlecenie() });
    const token = tokenZMaila(maile);
    const swieza = await zaKlienta.utworz({ subscriptionId: inny.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #5', zlecenie: zlecenie() });
    await prisma().migrationRequest.update({ where: { id: migracja.id }, data: { consentExpiresAt: new Date(Date.now() - 60_000) } });

    await expect(
      zaKlienta.przyjmij({ subscriptionId: k.subscription.id, userId: k.user.id, actorUserId: k.user.id, migrationId: migracja.id, token, ip: null }),
    ).rejects.toThrow(/wygasł/);
    expect(await prisma().migrationWorkerJob.count({ where: { migrationRequestId: migracja.id } })).toBe(0);

    expect(await zaKlienta.wygasPrzeterminowane()).toEqual({ wygasle: 1 });
    const req = await prisma().migrationRequest.findUniqueOrThrow({ where: { id: migracja.id } });
    expect(req.status).toBe(MigrationStatus.CANCELED);
    expect(req.currentStep).toBe('consent-expired');
    expect(req.sourceBundleEnc).toBe('');
    expect(req.secretsPurgedAt).not.toBeNull();
    expect(await prisma().auditLog.count({ where: { action: 'MIGRATION_CONSENT_EXPIRED', userId: k.user.id } })).toBe(1);
    expect((await prisma().migrationRequest.findUniqueOrThrow({ where: { id: swieza.migracja.id } })).status).toBe(MigrationStatus.DRAFT);
    // Idempotentne — drugi przebieg nic nie robi.
    expect(await zaKlienta.wygasPrzeterminowane()).toEqual({ wygasle: 0 });
    expect((await zaKlienta.szczegoly({ subscriptionId: k.subscription.id, userId: k.user.id, migrationId: migracja.id })).stan).toBe('wygasla');
  });

  it('te same walidacje co kreator: limit aktywnych migracji przy zakładaniu i ponownie przy zgodzie; druga prośba dla usługi odrzucona', async () => {
    const { k, operator } = await przygotuj();
    const { zaKlienta, maile } = uslugi();
    await expect(
      zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #8', zlecenie: { ...zlecenie(), ftp: undefined, mysql: [] } }),
    ).rejects.toThrow(/co najmniej jedno źródło/);
    const { migracja } = await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #6', zlecenie: zlecenie() });
    const token = tokenZMaila(maile);
    await expect(
      zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #7', zlecenie: zlecenie() }),
    ).rejects.toThrow(/czeka już migracja na zgodę/);

    // W międzyczasie klient sam uruchomił migrację — zgoda na drugą nie przejdzie, prośba zostaje nietknięta.
    await prisma().migrationRequest.create({
      data: { subscriptionId: k.subscription.id, userId: k.user.id, sourceBundleEnc: 'x', status: MigrationStatus.RUNNING },
    });
    await expect(
      zaKlienta.przyjmij({ subscriptionId: k.subscription.id, userId: k.user.id, actorUserId: k.user.id, migrationId: migracja.id, token, ip: null }),
    ).rejects.toThrow(/trwa już migracja/);
    const req = await prisma().migrationRequest.findUniqueOrThrow({ where: { id: migracja.id } });
    expect(req.status).toBe(MigrationStatus.DRAFT);
    expect(req.consentDecidedAt).toBeNull();
  });

  it('anulowanie przez obsługę czekającej prośby kasuje dane źródła i unieważnia link', async () => {
    const { k, operator } = await przygotuj();
    const { orkiestrator, zaKlienta, maile } = uslugi();
    const { migracja } = await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #9', zlecenie: zlecenie() });
    const token = tokenZMaila(maile);
    await orkiestrator.setStatusForStaff({ migrationRequestId: migracja.id, actorUserId: operator.id, status: MigrationStatus.CANCELED });
    const req = await prisma().migrationRequest.findUniqueOrThrow({ where: { id: migracja.id } });
    expect(req.sourceBundleEnc).toBe('');
    expect(req.secretsPurgedAt).not.toBeNull();
    await expect(
      zaKlienta.przyjmij({ subscriptionId: k.subscription.id, userId: k.user.id, actorUserId: k.user.id, migrationId: migracja.id, token, ip: null }),
    ).rejects.toThrow(/anulowana/);
  });
  it('operator w sesji „Zaloguj jako klient” nie zatwierdzi ani nie odrzuci zgody; subkonto też nie — tylko właściciel', async () => {
    const { k, operator } = await przygotuj();
    const { zaKlienta, maile } = uslugi();
    const { migracja } = await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #10', zlecenie: zlecenie() });
    const token = tokenZMaila(maile);
    const kontroler = new MigracjaZgodaController(zaKlienta);
    const zadanie = { ip: '203.0.113.99' } as never;
    // Dokładnie to, co JwtStrategy.validate zwraca dla tokenu impersonacji (sub = klient, impersonatedBy = operator).
    const sesjaWsparcia = { userId: k.user.id, principalUserId: k.user.id, impersonatedBy: operator.id, customerOwnerId: null };
    const subkonto = { userId: k.user.id, principalUserId: 'subkonto-1', customerOwnerId: k.user.id };

    await expect(kontroler.przyjmij(sesjaWsparcia, k.subscription.id, migracja.id, { token }, zadanie)).rejects.toMatchObject({ status: 403 });
    await expect(kontroler.odrzuc(sesjaWsparcia, k.subscription.id, migracja.id, { token }, zadanie)).rejects.toMatchObject({ status: 403 });
    await expect(kontroler.przyjmij(subkonto, k.subscription.id, migracja.id, { token }, zadanie)).rejects.toMatchObject({ status: 403 });
    await expect(kontroler.odrzuc(subkonto, k.subscription.id, migracja.id, { token }, zadanie)).rejects.toMatchObject({ status: 403 });

    const req = await prisma().migrationRequest.findUniqueOrThrow({ where: { id: migracja.id }, include: { workerJobs: true } });
    expect(req.status).toBe(MigrationStatus.DRAFT);
    expect(req.consentDecidedAt).toBeNull();
    expect(req.consentIp).toBeNull();
    expect(req.workerJobs).toHaveLength(0);
    expect(await prisma().auditLog.count({ where: { action: { in: ['MIGRATION_CONSENT_ACCEPTED', 'MIGRATION_CONSENT_REJECTED', 'MIGRATION_BUNDLE_QUEUED'] } } })).toBe(0);

    // Właściciel we własnej sesji — przechodzi.
    const wlasciciel = { userId: k.user.id, principalUserId: k.user.id, customerOwnerId: null };
    const wynik = await kontroler.przyjmij(wlasciciel, k.subscription.id, migracja.id, { token }, { ip: '198.51.100.20' } as never);
    expect(wynik.status).toBe(MigrationStatus.QUEUED);
  });

  it('podwójne „Zgadzam się” zakłada brakującą skrzynkę raz; nieudane założenie zdejmuje rezerwację i można spróbować ponownie', async () => {
    const { k, operator } = await przygotuj();
    const { zaKlienta, maile, directAdmin } = uslugi();
    const { migracja } = await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #11', zlecenie: zleceniePoczty() });
    const token = tokenZMaila(maile);
    const zgoda = () =>
      zaKlienta.przyjmij({ subscriptionId: k.subscription.id, userId: k.user.id, actorUserId: k.user.id, migrationId: migracja.id, token, ip: null });

    // Pierwsza próba: węzeł odrzuca założenie skrzynki — prośba wraca do „oczekuje”, nic w kolejce.
    directAdmin.createHostingEmailAccount.mockRejectedValueOnce(new Error('limit skrzynek'));
    await expect(zgoda()).rejects.toThrow(/Nie udało się założyć skrzynki/);
    let req = await prisma().migrationRequest.findUniqueOrThrow({ where: { id: migracja.id }, include: { workerJobs: true } });
    expect(req.status).toBe(MigrationStatus.DRAFT);
    expect(req.consentDecidedAt).toBeNull();
    expect(req.workerJobs).toHaveLength(0);
    directAdmin.createHostingEmailAccount.mockClear();

    // Dwa kliknięcia naraz (mail + baner): jedno przechodzi, drugie dostaje czytelny komunikat, skrzynka zakładana raz.
    directAdmin.createHostingEmailAccount.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { ok: true };
    });
    const wyniki = await Promise.allSettled([zgoda(), zgoda()]);
    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    const odrzucone = wyniki.find((w): w is PromiseRejectedResult => w.status === 'rejected');
    expect(String(odrzucone?.reason)).toMatch(/już rozpatrzona/);
    expect(directAdmin.createHostingEmailAccount).toHaveBeenCalledTimes(1);
    req = await prisma().migrationRequest.findUniqueOrThrow({ where: { id: migracja.id }, include: { workerJobs: true } });
    expect(req.status).toBe(MigrationStatus.QUEUED);
    expect(await prisma().auditLog.count({ where: { action: 'MIGRATION_CONSENT_ACCEPTED' } })).toBe(1);
  });

  it('zatwierdzana właśnie prośba (rezerwacja): obsługa jej nie anuluje, cron nie wygasza; porzucona rezerwacja po godzinie — tak', async () => {
    const { k, operator } = await przygotuj();
    const { orkiestrator, zaKlienta } = uslugi();
    const { migracja } = await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #12', zlecenie: zlecenie() });
    // Stan „w trakcie przyjmowania”: rezerwacja założona, termin właśnie minął.
    await prisma().migrationRequest.update({
      where: { id: migracja.id },
      data: { consentDecidedAt: new Date(), consentExpiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      orkiestrator.setStatusForStaff({ migrationRequestId: migracja.id, actorUserId: operator.id, status: MigrationStatus.CANCELED }),
    ).rejects.toThrow(/właśnie zdecydował/);
    expect(await zaKlienta.wygasPrzeterminowane()).toEqual({ wygasle: 0 });
    expect((await prisma().migrationRequest.findUniqueOrThrow({ where: { id: migracja.id } })).status).toBe(MigrationStatus.DRAFT);

    // Proces padł w trakcie — po godzinie wygaśnięcie zamyka szkic i kasuje dane źródła.
    await prisma().migrationRequest.update({ where: { id: migracja.id }, data: { consentDecidedAt: new Date(Date.now() - 2 * 3_600_000) } });
    expect(await zaKlienta.wygasPrzeterminowane()).toEqual({ wygasle: 1 });
    const req = await prisma().migrationRequest.findUniqueOrThrow({ where: { id: migracja.id } });
    expect(req.status).toBe(MigrationStatus.CANCELED);
    expect(req.sourceBundleEnc).toBe('');
  });

  it('dwa równoległe założenia dla jednej usługi: jedna prośba i jeden mail (indeks w bazie)', async () => {
    const { k, operator } = await przygotuj();
    const { zaKlienta, maile } = uslugi();
    const wyniki = await Promise.allSettled([
      zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Operator A', zlecenie: zlecenie() }),
      zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Operator B', zlecenie: zlecenie() }),
    ]);
    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    const odrzucone = wyniki.find((w): w is PromiseRejectedResult => w.status === 'rejected');
    expect(String(odrzucone?.reason)).toMatch(/czeka już migracja na zgodę/);
    expect(await prisma().migrationRequest.count({ where: { subscriptionId: k.subscription.id, status: MigrationStatus.DRAFT } })).toBe(1);
    expect(maile).toHaveLength(1);
  });

  it('przeterminowana prośba (przed przebiegiem crona) nie blokuje nowej — zostaje zamknięta i skasowana', async () => {
    const { k, operator } = await przygotuj();
    const { zaKlienta } = uslugi();
    const stara = await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #13', zlecenie: zlecenie() });
    await prisma().migrationRequest.update({ where: { id: stara.migracja.id }, data: { consentExpiresAt: new Date(Date.now() - 60_000) } });

    const nowa = await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #14', zlecenie: zlecenie() });
    expect(nowa.migracja.status).toBe(MigrationStatus.DRAFT);
    const req = await prisma().migrationRequest.findUniqueOrThrow({ where: { id: stara.migracja.id } });
    expect(req.status).toBe(MigrationStatus.CANCELED);
    expect(req.currentStep).toBe('consent-expired');
    expect(req.secretsPurgedAt).not.toBeNull();
  });

  it('mail z prośbą idzie z userId klienta (marka partnera dla klientów resellera, EmailLog przy koncie)', async () => {
    const { k, operator } = await przygotuj();
    const { zaKlienta, mailer } = uslugi();
    await zaKlienta.utworz({ subscriptionId: k.subscription.id, actorUserId: operator.id, powod: 'Zgłoszenie #15', zlecenie: zlecenie() });
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: k.user.email, userId: k.user.id }));
  });
});
