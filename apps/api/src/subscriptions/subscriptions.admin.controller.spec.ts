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

  it('suspend() has no method override — only class-level ADMIN', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SubscriptionsAdminController.prototype.suspend);
    expect(roles).toBeUndefined();
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
    const c = new (SubscriptionsAdminController as unknown as new (...a: unknown[]) => SubscriptionsAdminController)(
      null, null, migrations, null, hostingRestore, null, null, null, null,
    );
    return { c, hostingRestore, migrations };
  }

  it('odtworzenie przez STAFF bez powodu → 400, nic nie zlecone', () => {
    const { c, hostingRestore } = kontroler();
    expect(() => c.runHostingRestore('s1', { backupId: 'b1', reason: ' krótki ' }, { userId: 'op', role: Role.STAFF })).toThrow(BadRequestException);
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
    const prisma = { subscription: { findUnique: vi.fn().mockResolvedValue({ userId: 'klient' }) } };
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
    expect(directAdmin.listHostingBackups).toHaveBeenCalledWith('s1', 'klient');
    expect(audit.record.mock.invocationCallOrder[0]).toBeLessThan(directAdmin.listHostingBackups.mock.invocationCallOrder[0]!);
  });

  /** L1-KARTA — diagnostyka z karty usługi odpytuje węzeł: w dzienniku jak diagnostyka z rozmowy (PB-43) i lista kopii. */
  it('diagnostyka z karty → wpis OPERATOR_ACCOUNT_VIEWED (sekcja diagnostyka), potem diagnostyka', async () => {
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const prisma = { subscription: { findUnique: vi.fn().mockResolvedValue({ userId: 'klient' }) } };
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

  it('migracja wewnętrzna przez STAFF bez powodu → 400', () => {
    const { c, migrations } = kontroler();
    expect(() => c.requestInternalMigration('s1', { targetServerId: 'n2' }, { userId: 'op', role: Role.STAFF })).toThrow(BadRequestException);
    expect(migrations.requestInternalMigrationByAdmin).not.toHaveBeenCalled();
  });
});
