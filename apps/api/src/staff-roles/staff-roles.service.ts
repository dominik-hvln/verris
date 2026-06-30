import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { staffInviteTemplate } from '../mail/templates/staff-invite-notification';
import { STAFF_PERMISSIONS, STAFF_PERMISSION_KEYS, isValidStaffPermission } from './staff-permissions.catalog';

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
interface UserLite { id: string; email: string; firstName: string | null; lastName: string | null; role: string; staffRoleId: string | null; loginBlocked?: boolean }
interface UserDelegate {
  findMany(args: unknown): Promise<UserLite[]>;
  findUnique(args: unknown): Promise<UserLite | null>;
  findFirst(args: unknown): Promise<UserLite | null>;
  create(args: unknown): Promise<UserLite>;
  update(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<number>;
}

@Injectable()
export class StaffRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

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
    return { permissions: STAFF_PERMISSIONS };
  }

  private sanitizePerms(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return Array.from(new Set(input.map(String).filter((p) => isValidStaffPermission(p))));
  }

  async listRoles() {
    const roles = await this.roles.findMany({ orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
    const counts = await Promise.all(
      roles.map((r) => this.users.count({ where: { staffRoleId: r.id } })),
    );
    return roles.map((r, i) => ({ ...r, memberCount: counts[i] }));
  }

  async createRole(input: { name: string; description?: string; permissions: string[] }) {
    const name = String(input.name || '').trim();
    if (name.length < 2) throw new BadRequestException('Nazwa roli jest za krótka.');
    const existing = await this.roles.findFirst({ where: { name } });
    if (existing) throw new ConflictException('Rola o tej nazwie już istnieje.');
    const role = await this.roles.create({
      data: { name, description: input.description?.trim() || null, permissions: this.sanitizePerms(input.permissions), isSystem: false },
    });
    await this.audit.record({ action: 'STAFF_ROLE_CREATED', details: { roleId: role.id, name } });
    return role;
  }

  async updateRole(id: string, input: { name?: string; description?: string; permissions?: string[] }) {
    const role = await this.roles.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rola nie istnieje.');
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
    if (input.permissions !== undefined) data.permissions = this.sanitizePerms(input.permissions);
    const updated = await this.roles.update({ where: { id }, data });
    await this.audit.record({ action: 'STAFF_ROLE_UPDATED', details: { roleId: id, changes: Object.keys(data) } });
    return updated;
  }

  async deleteRole(id: string) {
    const role = await this.roles.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rola nie istnieje.');
    if (role.isSystem) throw new BadRequestException('Rola systemowa nie może zostać usunięta (możesz ją edytować).');
    const members = await this.users.count({ where: { staffRoleId: id } });
    if (members > 0) throw new BadRequestException(`Najpierw odepnij ${members} operator(ów) od tej roli.`);
    await this.roles.delete({ where: { id } });
    await this.audit.record({ action: 'STAFF_ROLE_DELETED', details: { roleId: id, name: role.name } });
    return { ok: true as const };
  }

  async listOperators() {
    const ops = await this.users.findMany({
      where: { role: { in: ['STAFF', 'ADMIN'] }, anonymizedAt: null },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, staffRoleId: true, loginBlocked: true },
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
    });
    return ops;
  }

  async assignRole(userId: string, roleId: string | null) {
    const user = await this.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Operator nie istnieje.');
    if (user.role === 'ADMIN') throw new BadRequestException('ADMIN ma pełny dostęp — rola działowa nie ma zastosowania.');
    if (user.role !== 'STAFF') throw new BadRequestException('Rolę można przypisać tylko operatorom (STAFF).');
    if (roleId) {
      const role = await this.roles.findUnique({ where: { id: roleId } });
      if (!role) throw new NotFoundException('Wybrana rola nie istnieje.');
    }
    await this.users.update({ where: { id: userId }, data: { staffRoleId: roleId } });
    await this.audit.record({ action: 'STAFF_ROLE_ASSIGNED', details: { userId, roleId } });
    return { ok: true as const };
  }

  /** Tworzy konto operatora (STAFF) z hasłem tymczasowym i wysyła zaproszenie e-mail. */
  async createOperator(input: { email: string; firstName?: string; lastName?: string; roleId?: string | null }) {
    const email = String(input.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('Podaj prawidłowy adres e-mail.');
    const existing = await this.users.findFirst({ where: { email } });
    if (existing) throw new ConflictException('Konto z tym adresem e-mail już istnieje.');
    let roleName: string | null = null;
    if (input.roleId) {
      const role = await this.roles.findUnique({ where: { id: input.roleId } });
      if (!role) throw new NotFoundException('Wybrana rola nie istnieje.');
      roleName = role.name;
    }
    const temporaryPassword = `${randomBytes(10).toString('base64url')}Aa1!`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const user = await this.users.create({
      data: {
        email,
        passwordHash,
        role: 'STAFF',
        firstName: input.firstName?.trim() || null,
        lastName: input.lastName?.trim() || null,
        staffRoleId: input.roleId ?? null,
      },
    });
    await this.audit.record({ action: 'STAFF_OPERATOR_CREATED', details: { userId: user.id, email, roleId: input.roleId ?? null } });
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
  async setOperatorActive(userId: string, active: boolean) {
    const user = await this.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Operator nie istnieje.');
    if (user.role === 'ADMIN') throw new BadRequestException('Konta ADMIN nie można dezaktywować z tego panelu.');
    if (user.role !== 'STAFF') throw new BadRequestException('Operacja dotyczy tylko operatorów (STAFF).');
    await this.users.update({
      where: { id: userId },
      data: active ? { loginBlocked: false } : { loginBlocked: true, tokenVersion: { increment: 1 } },
    });
    await this.audit.record({ action: active ? 'STAFF_OPERATOR_ACTIVATED' : 'STAFF_OPERATOR_DEACTIVATED', details: { userId } });
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
    const u = await this.users.findUnique({
      where: { id: user.principalUserId ?? user.userId },
      select: { staffRole: { select: { name: true, permissions: true } } },
    } as unknown as never) as unknown as { staffRole: { name: string; permissions: string[] } | null } | null;
    return {
      role: 'STAFF',
      isAdmin: false,
      roleName: u?.staffRole?.name ?? null,
      permissions: u?.staffRole?.permissions ?? [],
    };
  }
}
