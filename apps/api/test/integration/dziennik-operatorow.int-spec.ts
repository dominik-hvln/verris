import { AuditService } from '../../src/common/audit/audit.service.js';
import { StaffRolesService } from '../../src/staff-roles/staff-roles.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * Weryfikacja 11.10 — dziennik operatorów na prawdziwej bazie:
 *  1. karta usługi odpytuje API co 5 s, póki trwa zadanie węzła — wgląd w konto (OPERATOR_ACCOUNT_VIEWED) ma się
 *     zapisać raz na otwarcie (operator + konto + szczegóły w oknie 10 min), a nowy wgląd (inna sekcja, inny operator,
 *     po oknie) — dalej jako nowy wpis;
 *  2. „Dziennik aktywności operatorów” na /operators pokazuje tylko działania ADMIN/STAFF, nie klientów.
 */
const uzytkownik = (rola: 'USER' | 'STAFF' | 'ADMIN', nazwa: string) =>
  prisma().user.create({ data: { email: `${nazwa}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.verris.pl`, passwordHash: 'x', role: rola } });

describe('weryfikacja 11.10 — dziennik operatorów', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('wgląd w konto: odpytywanie co 5 s = jeden wpis; inna sekcja, inny operator i wgląd po 10 min — nowe wpisy', async () => {
    const audit = new AuditService(prisma() as never);
    const klient = await uzytkownik('USER', 'klient');
    const op = await uzytkownik('STAFF', 'op');
    const op2 = await uzytkownik('ADMIN', 'adm');
    const wglad = (actorUserId: string, sekcja: string) =>
      audit.record({ action: 'OPERATOR_ACCOUNT_VIEWED', userId: klient.id, actorUserId, details: { subscriptionId: 's1', sekcja } });
    const wpisy = () => prisma().auditLog.findMany({ where: { action: 'OPERATOR_ACCOUNT_VIEWED', userId: klient.id }, orderBy: { createdAt: 'asc' } });

    for (let i = 0; i < 6; i++) await wglad(op.id, 'zasoby'); // 30 s odpytywania panelu „Zasoby i diagnoza 508”
    expect(await wpisy()).toHaveLength(1);

    await wglad(op.id, 'limit-wysylki'); // inna sekcja — nowy wgląd
    await wglad(op2.id, 'zasoby'); // inny operator — nowy wgląd
    expect((await wpisy()).map((w) => [w.actorUserId, (w.details as { sekcja: string }).sekcja])).toEqual([
      [op.id, 'zasoby'],
      [op.id, 'limit-wysylki'],
      [op2.id, 'zasoby'],
    ]);

    // Ten sam wgląd po upływie okna — nowy wpis.
    await prisma().auditLog.updateMany({ where: { actorUserId: op.id, userId: klient.id }, data: { createdAt: new Date(Date.now() - 11 * 60_000) } });
    await wglad(op.id, 'zasoby');
    expect((await wpisy()).filter((w) => w.actorUserId === op.id && (w.details as { sekcja: string }).sekcja === 'zasoby')).toHaveLength(2);
  });

  it('inne akcje (zmiany na koncie) zapisują się zawsze — okno dotyczy tylko wglądu', async () => {
    const audit = new AuditService(prisma() as never);
    const klient = await uzytkownik('USER', 'klient');
    const op = await uzytkownik('STAFF', 'op');
    for (let i = 0; i < 3; i++) {
      await audit.record({ action: 'OPERATOR_ACCOUNT_CHANGED', userId: klient.id, actorUserId: op.id, details: { subscriptionId: 's1', sekcja: 'php' } });
    }
    expect(await prisma().auditLog.count({ where: { action: 'OPERATOR_ACCOUNT_CHANGED', userId: klient.id } })).toBe(3);
  });

  it('dziennik aktywności operatorów: bez akcji klientów; akcja w sesji „Zaloguj jako klient” — z operatorem jako aktorem', async () => {
    const klient = await uzytkownik('USER', 'dominik');
    const op = await uzytkownik('STAFF', 'obsluga');
    const adm = await uzytkownik('ADMIN', 'admin');
    await prisma().auditLog.createMany({
      data: [
        { action: 'HOSTING_FILE_WRITTEN', userId: klient.id, actorUserId: klient.id }, // klient w swoim panelu
        { action: 'HOSTING_FILE_DELETED', userId: klient.id, actorUserId: klient.id },
        { action: 'HOSTING_MAIL_SENDING_BLOCKED', userId: klient.id, actorUserId: adm.id },
        { action: 'OPERATOR_ACCOUNT_VIEWED', userId: klient.id, actorUserId: op.id },
        { action: 'HOSTING_PHP_CHANGED', userId: klient.id, actorUserId: klient.id, impersonatedBy: op.id }, // „Zaloguj jako klient”
      ],
    });
    const svc = new StaffRolesService(prisma() as never, { record: async () => undefined } as never, {} as never, { get: () => undefined } as never);

    const wszystkie = await svc.operatorActivity({});
    expect(wszystkie.map((w) => [w.action, w.actor]).sort()).toEqual(
      [
        ['HOSTING_MAIL_SENDING_BLOCKED', adm.email],
        ['HOSTING_PHP_CHANGED', op.email],
        ['OPERATOR_ACCOUNT_VIEWED', op.email],
      ].sort(),
    );
    expect(wszystkie.every((w) => w.target === klient.email)).toBe(true);

    expect((await svc.operatorActivity({ operatorId: op.id })).map((w) => w.action).sort()).toEqual(['HOSTING_PHP_CHANGED', 'OPERATOR_ACCOUNT_VIEWED']);
    // Id klienta zamiast operatora (np. ręcznie w adresie) — pusto, nie akcje klienta.
    expect(await svc.operatorActivity({ operatorId: klient.id })).toEqual([]);
  });
});
