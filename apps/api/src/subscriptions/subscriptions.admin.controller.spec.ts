import { BadRequestException } from '@nestjs/common';
import { Role } from '@verris/database';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { STAFF_PERMISSIONS_ANY_KEY, STAFF_PERMISSIONS_KEY } from '../common/decorators/staff-permissions.decorator.js';
import { SubscriptionsAdminController } from './subscriptions.admin.controller.js';

describe('SubscriptionsAdminController (RBAC metadata)', () => {
  it('defaults class-level roles to ADMIN only', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SubscriptionsAdminController);
    expect(roles).toEqual([Role.ADMIN]);
  });

  it('list() allows STAFF via method override', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SubscriptionsAdminController.prototype.list);
    expect(roles?.sort()).toEqual([Role.ADMIN, Role.STAFF].sort());
  });

  it('detail() allows STAFF via method override', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SubscriptionsAdminController.prototype.detail);
    expect(roles?.sort()).toEqual([Role.ADMIN, Role.STAFF].sort());
  });

  it('F2.3: suspend() i unsuspend() — ADMIN i STAFF z SUBSCRIPTIONS_SUSPEND (nie SUBSCRIPTIONS_MANAGE z klasy)', () => {
    for (const m of [SubscriptionsAdminController.prototype.suspend, SubscriptionsAdminController.prototype.unsuspend]) {
      expect((Reflect.getMetadata(ROLES_KEY, m) as string[]).sort()).toEqual([Role.ADMIN, Role.STAFF].sort());
      expect(Reflect.getMetadata(STAFF_PERMISSIONS_KEY, m)).toEqual(['SUBSCRIPTIONS_SUSPEND']);
    }
  });
});

/** F2.3 (D2, 10.10) — zawieszenie przez pracownika: powód obowiązkowy, bez „braku płatności”, obciążenie tylko z BILLING_MANAGE. */
describe('SubscriptionsAdminController — zawieszenie przez obsługę (F2.3)', () => {
  function kontroler(uprawnienia: string[] = []) {
    const zawieszenie = { zawies: vi.fn().mockResolvedValue({ status: 'SUSPENDED' }), odwies: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) };
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ staffRole: { id: 'r', name: 'r', permissions: uprawnienia } }) } };
    const c = new (SubscriptionsAdminController as unknown as new (...a: unknown[]) => SubscriptionsAdminController)(
      null, prisma, null, null, null, null, null, null, null, null, zawieszenie,
    );
    return { c, zawieszenie };
  }
  const STAFF = { userId: 'op', role: Role.STAFF };
  const POWOD = 'Phishing potwierdzony w zgłoszeniu';

  it('STAFF bez powodu (min. 10 znaków) → 400, nic nie zawieszone', () => {
    const { c, zawieszenie } = kontroler();
    expect(() => c.suspend('s1', { reason: 'ABUSE', note: 'spam' }, STAFF)).toThrow(BadRequestException);
    expect(zawieszenie.zawies).not.toHaveBeenCalled();
  });

  it.each(['PAYMENT_FAILED', 'GRACE_EXPIRED', 'COS_INNEGO'])('STAFF z powodem %s → 400 (brak płatności zostaje dla administratora)', (reason) => {
    const { c, zawieszenie } = kontroler();
    expect(() => c.suspend('s1', { reason, note: POWOD }, STAFF)).toThrow(/administrator/);
    expect(zawieszenie.zawies).not.toHaveBeenCalled();
  });

  it('STAFF z powodem i zgłoszeniem → serwis dostaje powód, numer zgłoszenia i aktora', async () => {
    const { c, zawieszenie } = kontroler();
    await c.suspend('s1', { reason: 'ABUSE', note: POWOD, zgloszenie: '#ab12cd34' }, STAFF);
    expect(zawieszenie.zawies).toHaveBeenCalledWith({ subscriptionId: 's1', aktorUserId: 'op', aktorRola: Role.STAFF, reason: 'ABUSE', powod: POWOD, zgloszenie: '#ab12cd34' });
  });

  it('ADMIN jak dotąd: bez powodu, nieznany powód → MANUAL_ADMIN, brak płatności dozwolony', async () => {
    const { c, zawieszenie } = kontroler();
    await c.suspend('s1', { reason: 'COS_INNEGO' }, { userId: 'adm', role: Role.ADMIN });
    await c.suspend('s1', { reason: 'PAYMENT_FAILED' }, { userId: 'adm', role: Role.ADMIN });
    expect(zawieszenie.zawies.mock.calls.map((x) => (x[0] as { reason: string }).reason)).toEqual(['MANUAL_ADMIN', 'PAYMENT_FAILED']);
  });

  it('odwieszenie przez STAFF: powód obowiązkowy; obciążenie za odnowienie tylko z BILLING_MANAGE', async () => {
    const bez = kontroler(['SUBSCRIPTIONS_SUSPEND']);
    await expect(bez.c.unsuspend('s1', { note: 'krótko' }, STAFF)).rejects.toThrow(BadRequestException);
    await expect(bez.c.unsuspend('s1', { note: POWOD, chargeRenewal: true }, STAFF)).rejects.toThrow(/BILLING_MANAGE/);
    expect(bez.zawieszenie.odwies).not.toHaveBeenCalled();
    await bez.c.unsuspend('s1', { note: POWOD, zgloszenie: 'ab12cd34' }, STAFF);
    expect(bez.zawieszenie.odwies).toHaveBeenCalledWith({ subscriptionId: 's1', aktorUserId: 'op', aktorRola: Role.STAFF, powod: POWOD, zgloszenie: 'ab12cd34', chargeRenewal: undefined });
    const l4 = kontroler(['SUBSCRIPTIONS_SUSPEND', 'BILLING_MANAGE']);
    await l4.c.unsuspend('s1', { note: POWOD, chargeRenewal: true }, STAFF);
    expect(l4.zawieszenie.odwies).toHaveBeenCalledWith(expect.objectContaining({ chargeRenewal: true }));
  });
});

/**
 * PB-44 (decyzja 08.10) — pracownik obsługi na karcie usługi: zasoby, kopie z odtwarzaniem, historia migracji
 * i migracja wewnętrzna. Endpointy wpuszczają STAFF z SUBSCRIPTIONS_MANAGE (z klasy); odtworzenie na innym
 * węźle zostaje tylko dla admina.
 */
describe('SubscriptionsAdminController — obsługa (PB-44)', () => {
  const proto = SubscriptionsAdminController.prototype as unknown as Record<string, object>;
  const dlaStaff = ['usage', 'hostingBackups', 'runHostingRestore', 'hostingRestoreStatus', 'requestInternalMigration', 'migrationTimeline'];

  it.each(dlaStaff)('%s: ADMIN i STAFF, bez własnego @StaffPerm (klasa: SUBSCRIPTIONS_MANAGE; odczyty — @StaffPermAny, L1-KARTA)', (m) => {
    expect((Reflect.getMetadata(ROLES_KEY, proto[m]!) as string[]).sort()).toEqual([Role.ADMIN, Role.STAFF].sort());
    expect(Reflect.getMetadata(STAFF_PERMISSIONS_KEY, proto[m]!)).toBeUndefined();
    expect(Reflect.getMetadata(STAFF_PERMISSIONS_KEY, SubscriptionsAdminController)).toEqual(['SUBSCRIPTIONS_MANAGE']);
  });

  it.each(['runHostingRestore', 'requestInternalMigration', 'listEligiblePlans', 'previewPlanChange', 'changePlan'])(
    '%s: zapis / zmiana planu bez @StaffPermAny — zostaje za SUBSCRIPTIONS_MANAGE z klasy',
    (m) => {
      expect(Reflect.getMetadata(STAFF_PERMISSIONS_ANY_KEY, proto[m]!)).toBeUndefined();
    },
  );

  it.each(['odtworzenieNaWezle', 'odtworzenieNaWezleLista', 'odtworzenieNaWezleStart'])('%s: tylko ADMIN', (m) => {
    expect(Reflect.getMetadata(ROLES_KEY, proto[m]!)).toBeUndefined();
  });

  function kontroler() {
    const hostingRestore = { enqueue: vi.fn().mockResolvedValue({ id: 'j1' }) };
    const migrations = { requestInternalMigrationByAdmin: vi.fn().mockResolvedValue({ ok: true }) };
    const prisma = { subscription: { findUnique: vi.fn().mockResolvedValue({ userId: 'klient', user: { role: 'USER' } }) } };
    const c = new (SubscriptionsAdminController as unknown as new (...a: unknown[]) => SubscriptionsAdminController)(
      null, prisma, migrations, null, hostingRestore, null, null, null, null,
    );
    return { c, hostingRestore, migrations, prisma };
  }

  it('odtworzenie przez STAFF bez powodu → 400, nic nie zlecone', async () => {
    const { c, hostingRestore } = kontroler();
    await expect(c.runHostingRestore('s1', { backupId: 'b1', reason: ' krótki ' }, { userId: 'op', role: Role.STAFF })).rejects.toThrow(BadRequestException);
    expect(hostingRestore.enqueue).not.toHaveBeenCalled();
  });

  it('odtworzenie przez STAFF z powodem → powód idzie do serwisu (dziennik)', async () => {
    const { c, hostingRestore } = kontroler();
    await c.runHostingRestore('s1', { backupId: 'b1', reason: 'Zgłoszenie #77 — klient prosi o wczorajszą kopię' }, { userId: 'op', role: Role.STAFF });
    expect(hostingRestore.enqueue).toHaveBeenCalledWith('s1', 'op', expect.objectContaining({ backupId: 'b1', reason: 'Zgłoszenie #77 — klient prosi o wczorajszą kopię' }));
  });

  it('ADMIN może odtworzyć bez powodu (jego panel nie ma tego pola)', async () => {
    const { c, hostingRestore } = kontroler();
    await c.runHostingRestore('s1', { backupId: 'b1' }, { userId: 'adm', role: Role.ADMIN });
    expect(hostingRestore.enqueue).toHaveBeenCalled();
  });

  /**
   * Przegląd przekrojowy pakietu: lista kopii to odczyt konta klienta z węzła — jak sekcje konta z PB-42
   * (konto-klienta.admin.controller.ts, OPERATOR_ACCOUNT_VIEWED). PB-44 pokazał ją obsłudze bez wpisu w dzienniku.
   */
  it('lista kopii konta → wpis OPERATOR_ACCOUNT_VIEWED (operator = aktor, klient = właściciel), potem odczyt z węzła', async () => {
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const prisma = { subscription: { findUnique: vi.fn().mockResolvedValue({ userId: 'klient', user: { role: 'USER' } }) } };
    const directAdmin = { listHostingBackups: vi.fn().mockResolvedValue({ rows: [], fetchError: null }) };
    const c = new (SubscriptionsAdminController as unknown as new (...a: unknown[]) => SubscriptionsAdminController)(
      null, prisma, null, null, null, null, directAdmin, null, null, audit,
    );
    await c.hostingBackups('s1', { userId: 'op' });
    expect(audit.record).toHaveBeenCalledWith({
      action: 'OPERATOR_ACCOUNT_VIEWED',
      userId: 'klient',
      actorUserId: 'op',
      details: { subscriptionId: 's1', sekcja: 'kopie' },
    });
    // Weryfikacja 11.10 — panel operatora dostaje datę i rozmiar przy każdej kopii.
    expect(directAdmin.listHostingBackups).toHaveBeenCalledWith('s1', 'klient', { metadane: true });
    expect(audit.record.mock.invocationCallOrder[0]).toBeLessThan(directAdmin.listHostingBackups.mock.invocationCallOrder[0]!);
  });

  /** L1-KARTA — diagnostyka z karty usługi odpytuje węzeł: w dzienniku jak diagnostyka z rozmowy (PB-43) i lista kopii. */
  it('diagnostyka z karty → wpis OPERATOR_ACCOUNT_VIEWED (sekcja diagnostyka), potem diagnostyka', async () => {
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const prisma = { subscription: { findUnique: vi.fn().mockResolvedValue({ userId: 'klient', user: { role: 'USER' } }) } };
    const diagnostics = { forSubscription: vi.fn().mockResolvedValue({ overall: 'ok' }) };
    const c = new (SubscriptionsAdminController as unknown as new (...a: unknown[]) => SubscriptionsAdminController)(
      null, prisma, null, null, null, diagnostics, null, null, null, audit,
    );
    await expect(c.runDiagnostics('s1', { userId: 'op' })).resolves.toEqual({ overall: 'ok' });
    expect(audit.record).toHaveBeenCalledWith({
      action: 'OPERATOR_ACCOUNT_VIEWED',
      userId: 'klient',
      actorUserId: 'op',
      details: { subscriptionId: 's1', sekcja: 'diagnostyka' },
    });
    expect(audit.record.mock.invocationCallOrder[0]).toBeLessThan(diagnostics.forSubscription.mock.invocationCallOrder[0]!);
  });

  it('diagnostyka nieistniejącej usługi → 404, bez wpisu i bez odpytywania węzła', async () => {
    const audit = { record: vi.fn() };
    const prisma = { subscription: { findUnique: vi.fn().mockResolvedValue(null) } };
    const diagnostics = { forSubscription: vi.fn() };
    const c = new (SubscriptionsAdminController as unknown as new (...a: unknown[]) => SubscriptionsAdminController)(
      null, prisma, null, null, null, diagnostics, null, null, null, audit,
    );
    await expect(c.runDiagnostics('brak', { userId: 'op' })).rejects.toThrow('Usługa nie istnieje.');
    expect(audit.record).not.toHaveBeenCalled();
    expect(diagnostics.forSubscription).not.toHaveBeenCalled();
  });

  it('migracja wewnętrzna przez STAFF bez powodu → 400', async () => {
    const { c, migrations } = kontroler();
    await expect(c.requestInternalMigration('s1', { targetServerId: 'n2' }, { userId: 'op', role: Role.STAFF })).rejects.toThrow(BadRequestException);
    expect(migrations.requestInternalMigrationByAdmin).not.toHaveBeenCalled();
  });

  /** Przegląd poprawek Fali 3 (D3) — usługa konta zespołu: STAFF 403 przed węzłem i dziennikiem; ADMIN może. */
  it('usługa konta zespołu: STAFF nie odtworzy ani nie przeniesie (403), ADMIN tak', async () => {
    const { c, hostingRestore, migrations, prisma } = kontroler();
    prisma.subscription.findUnique.mockResolvedValue({ userId: 'zespol', user: { role: 'STAFF' } });
    const STAFF = { userId: 'op', role: Role.STAFF };
    await expect(c.runHostingRestore('s1', { backupId: 'b1', reason: 'Zgłoszenie #77 — prośba o kopię' }, STAFF)).rejects.toMatchObject({ status: 403 });
    await expect(c.requestInternalMigration('s1', { targetServerId: 'n2', notes: 'Rozładowanie węzła n1.' }, STAFF)).rejects.toMatchObject({ status: 403 });
    expect(hostingRestore.enqueue).not.toHaveBeenCalled();
    expect(migrations.requestInternalMigrationByAdmin).not.toHaveBeenCalled();
    await c.runHostingRestore('s1', { backupId: 'b1' }, { userId: 'adm', role: Role.ADMIN });
    expect(hostingRestore.enqueue).toHaveBeenCalled();
  });
});
