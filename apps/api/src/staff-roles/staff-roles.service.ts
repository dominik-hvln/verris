import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { staffInviteTemplate } from '../mail/templates/staff-invite-notification.js';
import { ADMIN_ONLY, STAFF_PERMISSIONS, STAFF_PERMISSION_KEYS, isValidStaffPermission } from './staff-permissions.catalog.js';
import { StaffRoleActions } from '../common/audit/audit.actions.js';
import { ROLE_SYSTEMOWE } from './role-systemowe.js';
import { dostepOperatora, uprawnieniaOperatora } from './uprawnienia-operatora.js';

/** Kto zmienia role/operatorów (z JWT; przy impersonacji — principal). */
export interface AktorZmianyRol {
  userId: string;
  role: string;
}

export interface StaffRoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
}
interface RoleDelegate {
  findMany(args?: unknown): Promise<StaffRoleRow[]>;
  findUnique(args: unknown): Promise<StaffRoleRow | null>;
  findFirst(args: unknown): Promise<StaffRoleRow | null>;
  create(args: unknown): Promise<StaffRoleRow>;
  update(args: unknown): Promise<StaffRoleRow>;
  delete(args: unknown): Promise<unknown>;
}
interface UserLite {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  staffRoleId: string | null;
  loginBlocked?: boolean;
  staffRoleAssignments?: { roleId: string }[];
}

/** PB-47 — operator „należy” do roli przez staffRoleId (zgodność) albo przez przypisanie. */
const czlonkowieRoli = (roleId: string) => ({
  OR: [{ staffRoleId: roleId }, { staffRoleAssignments: { some: { roleId } } }],
});

/** Wgrywa role systemowe z kodu. Zwraca nazwy, których nie wgrano, bo istnieje rola własna o tej nazwie. */
export async function wgrajRoleSystemowe(
  prisma: { $executeRaw(q: TemplateStringsArray, ...v: unknown[]): Promise<number> },
): Promise<string[]> {
  const pominiete: string[] = [];
  for (const r of ROLE_SYSTEMOWE) {
    const n = await prisma.$executeRaw`
      INSERT INTO "StaffRole" ("id", "name", "description", "permissions", "isSystem", "updatedAt")
      VALUES (gen_random_uuid()::text, ${r.name}, ${r.description}, ${[...r.permissions]}::text[], true, CURRENT_TIMESTAMP)
      ON CONFLICT ("name") DO UPDATE
        SET "description" = EXCLUDED."description", "permissions" = EXCLUDED."permissions", "updatedAt" = CURRENT_TIMESTAMP
        WHERE "StaffRole"."isSystem" = true`;
    if (n === 0) pominiete.push(r.name);
  }
  // Rola usunięta z kodu przestaje być systemowa — zostaje jako własna (operatorzy nie tracą dostępu).
  const nazwy = ROLE_SYSTEMOWE.map((r) => r.name);
  await prisma.$executeRaw`
    UPDATE "StaffRole" SET "isSystem" = false, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "isSystem" = true AND NOT ("name" = ANY(${nazwy}::text[]))`;
  return pominiete;
}
interface UserDelegate {
  findMany(args: unknown): Promise<UserLite[]>;
  findUnique(args: unknown): Promise<UserLite | null>;
  findFirst(args: unknown): Promise<UserLite | null>;
  create(args: unknown): Promise<UserLite>;
  update(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<number>;
}

@Injectable()
export class StaffRolesService implements OnModuleInit {
  private readonly logger = new Logger(StaffRolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * PB-47 — role systemowe wgrywane przy starcie modułu (nie migracją SQL): definicje żyją w kodzie
   * (role-systemowe.ts), więc zmiana uprawnień roli trafia do bazy przy wdrożeniu bez dopisywania migracji
   * danych, a SQL i TS nie mogą się rozjechać. Idempotentne (ON CONFLICT), bezpieczne przy kilku instancjach.
   */
  async onModuleInit(): Promise<void> {
    try {
      const pominiete = await wgrajRoleSystemowe(this.prisma as never);
      if (pominiete.length) {
        this.logger.warn(`Nie wgrano ról systemowych (istnieje rola własna o tej nazwie): ${pominiete.join(', ')}`);
      }
    } catch (e) {
      this.logger.error(`Nie udało się wgrać ról systemowych: ${(e as Error).message}`);
    }
  }

  private adminPanelUrl(): string {
    return (this.config.get<string>('adminPanelUrl') ?? process.env.ADMIN_PANEL_URL ?? 'https://admin.verris.pl').replace(/\/$/, '');
  }

  private get roles(): RoleDelegate {
    return (this.prisma as unknown as { staffRole: RoleDelegate }).staffRole;
  }
  private get users(): UserDelegate {
    return (this.prisma as unknown as { user: UserDelegate }).user;
  }

  catalog() {
    return { permissions: STAFF_PERMISSIONS, adminOnly: ADMIN_ONLY };
  }

  private sanitizePerms(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return Array.from(new Set(input.map(String).filter((p) => isValidStaffPermission(p))));
  }

  /**
   * Klucze, które aktor może nadawać i zmieniać (null = bez ograniczeń, ADMIN). STAFF z STAFF_MANAGE
   * operuje tylko w granicach własnych uprawnień i nigdy na kluczach ADMIN_ONLY — inaczej nadałby sobie
   * albo koledze wyższy szczebel (np. L4) lub założył rolę z SETTINGS_MANAGE.
   */
  private async zakresAktora(aktor: AktorZmianyRol): Promise<Set<string> | null> {
    if (aktor.role === 'ADMIN') return null;
    if (aktor.role !== 'STAFF') throw new ForbiddenException('Brak uprawnień do tej operacji.');
    const wlasne = await uprawnieniaOperatora(this.prisma, aktor.userId);
    return new Set(wlasne.filter((p) => !(ADMIN_ONLY as readonly string[]).includes(p)));
  }

  /** Odmowa, gdy któryś klucz wychodzi poza zakres aktora (z listą etykiet, żeby było wiadomo czego). */
  private wymagajZakresu(zakres: Set<string> | null, klucze: readonly string[], co: string): void {
    if (!zakres) return;
    const poza = [...new Set(klucze)].filter((k) => !zakres.has(k));
    if (!poza.length) return;
    const etykiety = poza.map((k) => STAFF_PERMISSIONS.find((p) => p.key === k)?.label ?? k);
    throw new ForbiddenException(
      `${co} — wykracza poza Twoje uprawnienia albo dotyczy uprawnień tylko dla administratora: ${etykiety.join('; ')}.`,
    );
  }

  async listRoles() {
    const roles = await this.roles.findMany({ orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
    const counts = await Promise.all(
      roles.map((r) => this.users.count({ where: czlonkowieRoli(r.id) })),
    );
    return roles.map((r, i) => ({ ...r, memberCount: counts[i] }));
  }

  async createRole(input: { name: string; description?: string; permissions: string[] }, aktor: AktorZmianyRol) {
    const name = String(input.name || '').trim();
    if (name.length < 2) throw new BadRequestException('Nazwa roli jest za krótka.');
    const permissions = this.sanitizePerms(input.permissions);
    this.wymagajZakresu(await this.zakresAktora(aktor), permissions, 'Nie możesz założyć roli z tymi uprawnieniami');
    const existing = await this.roles.findFirst({ where: { name } });
    if (existing) throw new ConflictException('Rola o tej nazwie już istnieje.');
    const role = await this.roles.create({
      data: { name, description: input.description?.trim() || null, permissions, isSystem: false },
    });
    await this.audit.record({ action: 'STAFF_ROLE_CREATED', actorUserId: aktor.userId, details: { roleId: role.id, name, permissions } });
    return role;
  }

  async updateRole(id: string, input: { name?: string; description?: string; permissions?: string[] }, aktor: AktorZmianyRol) {
    const role = await this.roles.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rola nie istnieje.');
    if (role.isSystem) {
      throw new BadRequestException('Roli systemowej nie można edytować — sklonuj ją jako własną i zmień kopię.');
    }
    const zakres = await this.zakresAktora(aktor);
    this.wymagajZakresu(zakres, role.permissions, 'Nie możesz edytować tej roli');
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (name.length < 2) throw new BadRequestException('Nazwa roli jest za krótka.');
      if (name !== role.name) {
        const dup = await this.roles.findFirst({ where: { name } });
        if (dup) throw new ConflictException('Rola o tej nazwie już istnieje.');
      }
      data.name = name;
    }
    if (input.description !== undefined) data.description = String(input.description).trim() || null;
    if (input.permissions !== undefined) {
      data.permissions = this.sanitizePerms(input.permissions);
      this.wymagajZakresu(zakres, data.permissions as string[], 'Nie możesz nadać roli tych uprawnień');
    }
    const updated = await this.roles.update({ where: { id }, data });
    // Zmiana roli zmienia uprawnienia wszystkich jej członków — w dzienniku kto i co (przed/po).
    const przed = Object.fromEntries(Object.keys(data).map((k) => [k, (role as unknown as Record<string, unknown>)[k] ?? null]));
    await this.audit.record({
      action: 'STAFF_ROLE_UPDATED',
      actorUserId: aktor.userId,
      details: { roleId: id, changes: Object.keys(data), przed, po: data } as never,
    });
    return updated;
  }

  async deleteRole(id: string, aktor: AktorZmianyRol) {
    const role = await this.roles.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rola nie istnieje.');
    if (role.isSystem) throw new BadRequestException('Rola systemowa nie może zostać usunięta (możesz ją sklonować).');
    this.wymagajZakresu(await this.zakresAktora(aktor), role.permissions, 'Nie możesz usunąć tej roli');
    const members = await this.users.count({ where: czlonkowieRoli(id) });
    if (members > 0) throw new BadRequestException(`Najpierw odepnij ${members} operator(ów) od tej roli.`);
    await this.roles.delete({ where: { id } });
    await this.audit.record({
      action: 'STAFF_ROLE_DELETED',
      actorUserId: aktor.userId,
      details: { roleId: id, name: role.name, permissions: role.permissions },
    });
    return { ok: true as const };
  }

  /** PB-47 — klon roli (zwykle systemowej) jako roli własnej, którą można edytować. */
  async cloneRole(id: string, input: { name?: string }, aktor: AktorZmianyRol) {
    const role = await this.roles.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rola nie istnieje.');
    this.wymagajZakresu(await this.zakresAktora(aktor), this.sanitizePerms(role.permissions), 'Nie możesz sklonować tej roli');
    const podana = String(input.name ?? '').trim();
    let name = podana || `${role.name} (kopia)`;
    if (name.length < 2) throw new BadRequestException('Nazwa roli jest za krótka.');
    // Bez podanej nazwy — pierwsza wolna („(kopia)”, „(kopia 2)”…), żeby kolejny klon tej samej roli nie kończył się 409.
    for (let n = 2; !podana && n <= 50 && (await this.roles.findFirst({ where: { name } })); n++) name = `${role.name} (kopia ${n})`;
    if (await this.roles.findFirst({ where: { name } })) throw new ConflictException('Rola o tej nazwie już istnieje.');
    const kopia = await this.roles.create({
      data: { name, description: role.description, permissions: this.sanitizePerms(role.permissions), isSystem: false },
    });
    await this.audit.record({
      action: StaffRoleActions.STAFF_ROLE_CLONED,
      actorUserId: aktor.userId,
      details: { zRoli: role.id, roleId: kopia.id, name },
    });
    return kopia;
  }

  async listOperators() {
    const ops = await this.users.findMany({
      where: { role: { in: ['STAFF', 'ADMIN'] }, anonymizedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        staffRoleId: true,
        loginBlocked: true,
        staffRoleAssignments: { select: { roleId: true } },
      },
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
    });
    return ops.map(({ staffRoleAssignments, ...o }) => ({
      ...o,
      roleIds: [...new Set([o.staffRoleId, ...(staffRoleAssignments ?? []).map((a) => a.roleId)].filter((x): x is string => Boolean(x)))],
    }));
  }

  /** Zgodność wstecz: jedna rola = lista z jednym elementem (null = bez ról). */
  async assignRole(userId: string, roleId: string | null, aktor: AktorZmianyRol) {
    return this.setOperatorRoles(userId, roleId ? [roleId] : [], aktor);
  }

  /**
   * PB-47 — ustawia PEŁNĄ listę ról operatora (uprawnienia = suma). staffRoleId = pierwsza rola z listy,
   * żeby kod czytający samo pole (inne gałęzie) widział spójny stan. W dzienniku: role przed i po.
   * STAFF (z STAFF_MANAGE) nie zmienia własnych ról ani ról operatora z szerszymi uprawnieniami
   * i nadaje tylko role mieszczące się w jego zakresie (zakresAktora).
   */
  async setOperatorRoles(userId: string, roleIds: string[], aktor: AktorZmianyRol) {
    const zakres = await this.zakresAktora(aktor);
    if (zakres && userId === aktor.userId) throw new ForbiddenException('Nie możesz zmieniać własnych ról — poproś administratora.');
    const user = await this.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Operator nie istnieje.');
    if (user.role === 'ADMIN') throw new BadRequestException('ADMIN ma pełny dostęp — rola działowa nie ma zastosowania.');
    if (user.role !== 'STAFF') throw new BadRequestException('Rolę można przypisać tylko operatorom (STAFF).');
    const ids = [...new Set(roleIds.map(String).filter(Boolean))];
    const role = ids.length ? await this.roles.findMany({ where: { id: { in: ids } } }) : [];
    if (role.length !== ids.length) throw new NotFoundException('Wybrana rola nie istnieje.');
    this.wymagajZakresu(zakres, role.flatMap((r) => r.permissions), 'Nie możesz nadać tych ról');
    // Blokada wiersza operatora: dwie równoczesne zmiany jego ról idą po kolei. Bez niej (READ COMMITTED)
    // deleteMany drugiej nie widzi niezatwierdzonych przypisań pierwszej i zostaje suma obu list albo P2002.
    // Stan „przed” i zakres czytamy już pod blokadą, żeby dziennik i sprawdzenie dotyczyły tego, co zastępujemy.
    const przed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const obecny = await dostepOperatora(tx, userId);
      this.wymagajZakresu(zakres, obecny.uprawnienia, 'Nie możesz zmieniać ról tego operatora');
      await tx.staffRoleAssignment.deleteMany({ where: { userId } });
      await tx.staffRoleAssignment.createMany({ data: ids.map((roleId) => ({ userId, roleId })) });
      await tx.user.update({ where: { id: userId }, data: { staffRoleId: ids[0] ?? null } });
      return obecny.role.map((r) => ({ id: r.id, name: r.name }));
    });
    const nazwa = new Map(role.map((r) => [r.id, r.name]));
    await this.audit.record({
      action: StaffRoleActions.STAFF_ROLE_ASSIGNED,
      userId,
      actorUserId: aktor.userId,
      details: { przed, po: ids.map((id) => ({ id, name: nazwa.get(id) ?? id })) },
    });
    return { ok: true as const, roleIds: ids };
  }

  /** Tworzy konto operatora (STAFF) z hasłem tymczasowym i wysyła zaproszenie e-mail. */
  async createOperator(input: { email: string; firstName?: string; lastName?: string; roleId?: string | null; roleIds?: string[] }, aktor: AktorZmianyRol) {
    const zakres = await this.zakresAktora(aktor);
    const email = String(input.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('Podaj prawidłowy adres e-mail.');
    const existing = await this.users.findFirst({ where: { email } });
    if (existing) throw new ConflictException('Konto z tym adresem e-mail już istnieje.');
    // PB-47 — lista ról albo (zgodność) pojedyncza rola z formularza; sprawdzamy przed założeniem konta.
    const startowe = [...new Set(input.roleIds?.length ? input.roleIds : input.roleId ? [input.roleId] : [])];
    const roleStartowe = startowe.length ? await this.roles.findMany({ where: { id: { in: startowe } } }) : [];
    if (roleStartowe.length !== startowe.length) throw new NotFoundException('Wybrana rola nie istnieje.');
    this.wymagajZakresu(zakres, roleStartowe.flatMap((r) => r.permissions), 'Nie możesz nadać tych ról');
    const roleName = startowe.length ? startowe.map((id) => roleStartowe.find((r) => r.id === id)?.name).join(' + ') : null;
    const temporaryPassword = `${randomBytes(10).toString('base64url')}Aa1!`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const user = await this.users.create({
      data: {
        email,
        passwordHash,
        role: 'STAFF',
        firstName: input.firstName?.trim() || null,
        lastName: input.lastName?.trim() || null,
        staffRoleId: startowe[0] ?? null,
        staffRoleAssignments: { create: startowe.map((roleId) => ({ roleId })) },
      },
    });
    await this.audit.record({ action: 'STAFF_OPERATOR_CREATED', actorUserId: aktor.userId, details: { userId: user.id, email, roleIds: startowe } });
    await this.mailer
      .send({
        ...staffInviteTemplate({ to: email, firstName: input.firstName?.trim() || null, roleName, temporaryPassword, adminPanelUrl: this.adminPanelUrl() }),
        userId: user.id,
        category: 'TRANSACTIONAL',
        fromRole: 'SECURITY',
      })
      .catch(() => undefined);
    return { ok: true as const, id: user.id, email };
  }

  /** Aktywuje/dezaktywuje operatora. Dezaktywacja blokuje logowanie i wymusza wylogowanie. */
  async setOperatorActive(userId: string, active: boolean, aktor: AktorZmianyRol) {
    const zakres = await this.zakresAktora(aktor);
    const user = await this.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Operator nie istnieje.');
    if (user.role === 'ADMIN') throw new BadRequestException('Konta ADMIN nie można dezaktywować z tego panelu.');
    if (user.role !== 'STAFF') throw new BadRequestException('Operacja dotyczy tylko operatorów (STAFF).');
    if (zakres) {
      this.wymagajZakresu(zakres, await uprawnieniaOperatora(this.prisma, userId), 'Nie możesz zmieniać aktywności tego operatora');
    }
    await this.users.update({
      where: { id: userId },
      data: active ? { loginBlocked: false } : { loginBlocked: true, tokenVersion: { increment: 1 } },
    });
    await this.audit.record({ action: active ? 'STAFF_OPERATOR_ACTIVATED' : 'STAFF_OPERATOR_DEACTIVATED', actorUserId: aktor.userId, details: { userId } });
    return { ok: true as const };
  }

  /** Dziennik aktywności operatorów — ostatnie akcje wykonane przez STAFF/ADMIN. */
  async operatorActivity(opts: { operatorId?: string; limit?: number }) {
    const take = Math.min(300, Math.max(1, Math.trunc(Number(opts.limit ?? 150))));
    const where: Record<string, unknown> = opts.operatorId
      ? { actorUserId: opts.operatorId }
      : { actorUserId: { not: null } };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, action: true, createdAt: true, actorUserId: true, userId: true, ipAddress: true },
    });
    const ids = Array.from(
      new Set(rows.flatMap((r) => [r.actorUserId, r.userId]).filter((x): x is string => Boolean(x))),
    );
    const users = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u.email]));
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      createdAt: r.createdAt,
      actor: r.actorUserId ? byId.get(r.actorUserId) ?? r.actorUserId : null,
      target: r.userId ? byId.get(r.userId) ?? r.userId : null,
      ip: r.ipAddress ?? null,
    }));
  }

  /** Uprawnienia zalogowanego operatora — dla bramkowania UI. ADMIN = wszystko. */
  async myAccess(user: { role: string; principalUserId?: string; userId: string }) {
    if (user.role === 'ADMIN') {
      return { role: 'ADMIN', isAdmin: true, permissions: STAFF_PERMISSION_KEYS };
    }
    if (user.role !== 'STAFF') return { role: user.role, isAdmin: false, permissions: [] as string[] };
    // PB-47 — suma uprawnień wszystkich ról (to samo źródło co StaffPermissionsGuard).
    const { role, uprawnienia } = await dostepOperatora(this.prisma, user.principalUserId ?? user.userId);
    return {
      role: 'STAFF',
      isAdmin: false,
      roleName: role.length ? role.map((r) => r.name).join(' + ') : null,
      roleNames: role.map((r) => r.name),
      permissions: uprawnienia,
    };
  }
}
