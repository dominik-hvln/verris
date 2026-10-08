import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StaffRolesService, wgrajRoleSystemowe } from './staff-roles.service.js';
import { ROLE_SYSTEMOWE } from './role-systemowe.js';

/** PB-47 — role systemowe nieedytowalne, wiele ról na operatora, suma uprawnień w /staff/me/access. */
type Rola = { id: string; name: string; description: string | null; permissions: string[]; isSystem: boolean };

function zbuduj(
  opts: {
    role?: Rola[];
    uzytkownik?: Record<string, unknown> | null;
    wierszDostepu?: unknown;
    /** Uprawnienia per konto (aktor i operator, którego dotyczy zmiana) — ma pierwszeństwo przed wierszDostepu. */
    dostep?: Record<string, string[]>;
    /** Konta operatorów per id (gdy test dotyczy kilku). */
    konta?: Record<string, Record<string, unknown>>;
  } = {},
) {
  const role = opts.role ?? [];
  const audit = { record: vi.fn(async () => undefined) };
  const prisma = {
    staffRole: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => role.find((r) => r.id === where.id) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { name: string } }) => role.find((r) => r.name === where.name) ?? null),
      findMany: vi.fn(async ({ where }: { where?: { id?: { in: string[] } } } = {}) =>
        where?.id ? role.filter((r) => where.id!.in.includes(r.id)) : role,
      ),
      create: vi.fn(async ({ data }: { data: Omit<Rola, 'id'> }) => ({ id: 'nowa', ...data })),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
    user: {
      findUnique: vi.fn(async (args: { where: { id: string }; select?: { staffRoleAssignments?: unknown } }) => {
        if (args?.select?.staffRoleAssignments) {
          const p = opts.dostep?.[args.where.id];
          if (p) return { staffRole: { id: `r-${args.where.id}`, name: `R ${args.where.id}`, permissions: p }, staffRoleAssignments: [] };
          return opts.wierszDostepu ?? null;
        }
        return opts.konta?.[args.where.id] ?? opts.uzytkownik ?? null;
      }),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'nowy', ...data })),
      update: vi.fn(async () => ({})),
      count: vi.fn(async () => 0),
    },
    staffRoleAssignment: {
      deleteMany: vi.fn((a: unknown) => ({ op: 'deleteMany', a })),
      createMany: vi.fn((a: unknown) => ({ op: 'createMany', a })),
    },
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(async (arg: unknown): Promise<unknown> => (typeof arg === 'function' ? arg(prisma) : arg)),
  };
  const mailer = { send: vi.fn(async () => ({ delivered: true })) };
  const s = new StaffRolesService(prisma as never, audit as never, mailer as never, { get: () => undefined } as never);
  return { s, prisma, audit };
}

const systemowa: Rola = { id: 'sys', name: 'L1 Konsultant', description: 'x', permissions: ['TICKETS_VIEW'], isSystem: true };
const wlasna: Rola = { id: 'own', name: 'Własna', description: null, permissions: ['BILLING_VIEW'], isSystem: false };
const ADM = { userId: 'adm', role: 'ADMIN' };

describe('PB-47 — StaffRolesService', () => {
  it('roli systemowej nie da się edytować ani usunąć; własną — tak', async () => {
    const { s, prisma } = zbuduj({ role: [systemowa, wlasna] });
    await expect(s.updateRole('sys', { permissions: ['BILLING_MANAGE'] }, ADM)).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.deleteRole('sys', ADM)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.staffRole.update).not.toHaveBeenCalled();
    await s.updateRole('own', { permissions: ['BILLING_MANAGE'] }, ADM);
    expect(prisma.staffRole.update).toHaveBeenCalledTimes(1);
  });

  it('klon roli systemowej to rola własna z tymi samymi uprawnieniami', async () => {
    const { s, prisma, audit } = zbuduj({ role: [systemowa] });
    await s.cloneRole('sys', {}, ADM);
    expect(prisma.staffRole.create).toHaveBeenCalledWith({
      data: { name: 'L1 Konsultant (kopia)', description: 'x', permissions: ['TICKETS_VIEW'], isSystem: false },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'STAFF_ROLE_CLONED', actorUserId: 'adm' }));
  });

  it('kolejny klon bez nazwy dostaje pierwszą wolną nazwę zamiast 409; podana zajęta nazwa — 409', async () => {
    const kopie: Rola[] = [
      { ...systemowa, id: 'k1', name: 'L1 Konsultant (kopia)', isSystem: false },
      { ...systemowa, id: 'k2', name: 'L1 Konsultant (kopia 2)', isSystem: false },
    ];
    const { s, prisma } = zbuduj({ role: [systemowa, ...kopie] });
    await s.cloneRole('sys', {}, ADM);
    expect(prisma.staffRole.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'L1 Konsultant (kopia 3)' }) });
    await expect(s.cloneRole('sys', { name: 'L1 Konsultant (kopia)' }, ADM)).rejects.toThrow(/już istnieje/);
  });

  it('ustawienie wielu ról: przypisania + staffRoleId = pierwsza rola, dziennik przed/po', async () => {
    const { s, prisma, audit } = zbuduj({
      role: [systemowa, wlasna],
      uzytkownik: { id: 'op', role: 'STAFF' },
      wierszDostepu: { staffRole: { id: 'sys', name: 'L1 Konsultant', permissions: [] }, staffRoleAssignments: [] },
    });
    await s.setOperatorRoles('op', ['own', 'sys', 'own'], ADM);
    // Wiersz operatora zablokowany w tej samej transakcji, przed odczytem stanu „przed” i zapisem.
    expect(String((prisma.$queryRaw.mock.calls[0] as unknown[])[0])).toMatch(/FOR UPDATE/);
    expect(prisma.staffRoleAssignment.deleteMany).toHaveBeenCalledWith({ where: { userId: 'op' } });
    expect(prisma.staffRoleAssignment.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'op', roleId: 'own' },
        { userId: 'op', roleId: 'sys' },
      ],
    });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'op' }, data: { staffRoleId: 'own' } });
    expect(audit.record).toHaveBeenCalledWith({
      action: 'STAFF_ROLE_ASSIGNED',
      userId: 'op',
      actorUserId: 'adm',
      details: {
        przed: [{ id: 'sys', name: 'L1 Konsultant' }],
        po: [
          { id: 'own', name: 'Własna' },
          { id: 'sys', name: 'L1 Konsultant' },
        ],
      },
    });
  });

  it('pusta lista = brak ról; nieistniejąca rola i konto ADMIN — odmowa', async () => {
    const op = zbuduj({ role: [wlasna], uzytkownik: { id: 'op', role: 'STAFF' }, wierszDostepu: null });
    await op.s.setOperatorRoles('op', [], ADM);
    expect(op.prisma.user.update).toHaveBeenCalledWith({ where: { id: 'op' }, data: { staffRoleId: null } });
    await expect(op.s.setOperatorRoles('op', ['brak'], ADM)).rejects.toBeInstanceOf(NotFoundException);
    const adm = zbuduj({ role: [wlasna], uzytkownik: { id: 'a', role: 'ADMIN' } });
    await expect(adm.s.setOperatorRoles('a', ['own'], ADM)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stare przypisanie jednej roli przechodzi przez tę samą ścieżkę', async () => {
    const { s, prisma } = zbuduj({ role: [wlasna], uzytkownik: { id: 'op', role: 'STAFF' } });
    await s.assignRole('op', 'own', ADM);
    expect(prisma.staffRoleAssignment.createMany).toHaveBeenCalledWith({ data: [{ userId: 'op', roleId: 'own' }] });
  });

  it('/staff/me/access: suma uprawnień i nazwy wszystkich ról', async () => {
    const { s } = zbuduj({
      wierszDostepu: {
        staffRole: { id: 'a', name: 'L1 Konsultant', permissions: ['TICKETS_VIEW'] },
        staffRoleAssignments: [{ role: { id: 'b', name: 'Marketing', permissions: ['PROMO_MANAGE', 'TICKETS_VIEW'] } }],
      },
    });
    const d = await s.myAccess({ role: 'STAFF', userId: 'op' });
    expect(d).toMatchObject({ isAdmin: false, roleName: 'L1 Konsultant + Marketing', roleNames: ['L1 Konsultant', 'Marketing'] });
    expect([...d.permissions].sort()).toEqual(['PROMO_MANAGE', 'TICKETS_VIEW']);
  });

  it('zmiana uprawnień roli: w dzienniku aktor oraz stan przed i po; tworzenie i usunięcie też z aktorem', async () => {
    const { s, audit } = zbuduj({ role: [wlasna] });
    await s.updateRole('own', { permissions: ['BILLING_MANAGE', 'BILLING_VIEW'] }, ADM);
    expect(audit.record).toHaveBeenCalledWith({
      action: 'STAFF_ROLE_UPDATED',
      actorUserId: 'adm',
      details: {
        roleId: 'own',
        changes: ['permissions'],
        przed: { permissions: ['BILLING_VIEW'] },
        po: { permissions: ['BILLING_MANAGE', 'BILLING_VIEW'] },
      },
    });
    await s.createRole({ name: 'Nowa', permissions: ['TICKETS_VIEW'] }, ADM);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'STAFF_ROLE_CREATED', actorUserId: 'adm' }));
    await s.deleteRole('own', ADM);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'STAFF_ROLE_DELETED', actorUserId: 'adm' }));
  });

  describe('STAFF z STAFF_MANAGE nie podnosi sobie ani innym uprawnień (eskalacja)', () => {
    const KADRY = { userId: 'kadry', role: 'STAFF' };
    const l1: Rola = { id: 'l1', name: 'L1', description: null, permissions: ['TICKETS_VIEW'], isSystem: true };
    const l4: Rola = { id: 'l4', name: 'L4', description: null, permissions: ['TICKETS_VIEW', 'BILLING_MANAGE', 'REQUESTS_APPROVE'], isSystem: true };
    const hr: Rola = { id: 'hr', name: 'Kadry', description: null, permissions: ['STAFF_MANAGE', 'TICKETS_VIEW'], isSystem: false };
    const srodowisko = (dostepCelu: string[] = []) =>
      zbuduj({
        role: [l1, l4, hr],
        konta: { kadry: { id: 'kadry', role: 'STAFF' }, op: { id: 'op', role: 'STAFF' } },
        dostep: { kadry: ['STAFF_MANAGE', 'TICKETS_VIEW'], op: dostepCelu },
      });

    it('nie zmienia własnych ról (np. dopisanie L4 do „Kadr”)', async () => {
      const { s, prisma } = srodowisko();
      await expect(s.setOperatorRoles('kadry', ['hr', 'l4'], KADRY)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(s.setOperatorRoles('kadry', ['hr'], KADRY)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('nie nadaje innemu ról z uprawnieniami, których sam nie ma, ani ADMIN_ONLY; w swoim zakresie — może', async () => {
      const { s, prisma } = srodowisko();
      await expect(s.setOperatorRoles('op', ['l4'], KADRY)).rejects.toThrow(/Akceptacja wniosków/);
      await expect(s.setOperatorRoles('op', ['hr'], KADRY)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(s.assignRole('op', 'l4', KADRY)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      await s.setOperatorRoles('op', ['l1'], KADRY);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('nie zmienia ról ani aktywności operatora z szerszymi uprawnieniami', async () => {
      const { s, prisma } = srodowisko(['BILLING_MANAGE']);
      await expect(s.setOperatorRoles('op', ['l1'], KADRY)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(s.setOperatorActive('op', false, KADRY)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rola własna: bez kluczy ADMIN_ONLY i spoza zakresu; nie edytuje, nie usuwa i nie klonuje silniejszej', async () => {
      const { s, prisma } = srodowisko();
      await expect(s.createRole({ name: 'Ustawienia', permissions: ['SETTINGS_MANAGE', 'BILLING_MANAGE'] }, KADRY)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(s.createRole({ name: 'Kadry bis', permissions: ['STAFF_MANAGE'] }, KADRY)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(s.updateRole('hr', { name: 'Kadry 2' }, KADRY)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(s.deleteRole('hr', KADRY)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(s.cloneRole('l4', {}, KADRY)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.staffRole.create).not.toHaveBeenCalled();
      expect(prisma.staffRole.update).not.toHaveBeenCalled();
      await s.createRole({ name: 'Podgląd', permissions: ['TICKETS_VIEW'] }, KADRY);
      expect(prisma.staffRole.create).toHaveBeenCalledTimes(1);
    });

    it('nowy operator tylko z rolami w zakresie zakładającego', async () => {
      const { s, prisma } = srodowisko();
      await expect(s.createOperator({ email: 'n@verris.pl', roleIds: ['l4'] }, KADRY)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
      await s.createOperator({ email: 'n@verris.pl', roleIds: ['l1'] }, KADRY);
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('ADMIN — bez ograniczeń (L4 dla operatora, rola z ustawieniami platformy)', async () => {
      const { s, prisma } = srodowisko(['BILLING_MANAGE']);
      await s.setOperatorRoles('op', ['l4'], ADM);
      await s.createRole({ name: 'Ustawienia', permissions: ['SETTINGS_MANAGE'] }, ADM);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.staffRole.create).toHaveBeenCalledTimes(1);
    });
  });

  it('wgranie ról systemowych: każda rola jednym upsertem, pominięte gdy istnieje rola własna o tej nazwie', async () => {
    const zapytania: string[] = [];
    const prisma = {
      $executeRaw: vi.fn(async (q: TemplateStringsArray, ...v: unknown[]) => {
        zapytania.push(q.join('?'));
        return v[0] === 'Marketing' ? 0 : 1;
      }),
    };
    expect(await wgrajRoleSystemowe(prisma)).toEqual(['Marketing']);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(ROLE_SYSTEMOWE.length + 1);
    expect(zapytania[0]).toMatch(/ON CONFLICT \("name"\) DO UPDATE[\s\S]*WHERE "StaffRole"\."isSystem" = true/);
  });
});
