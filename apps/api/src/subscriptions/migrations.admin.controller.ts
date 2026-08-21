import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role, MigrationStatus } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ADM-3 — cockpit migracji (zewnętrznych) dla admin/staff. Jeden widok floty
 * zleceń migracji ze statusem, krokiem i ostatnim błędem; zarządzanie pojedynczą
 * migracją (retry/log) pozostaje na stronie subskrypcji.
 */
@Controller('admin/migrations')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('MIGRATIONS_MANAGE')
export class MigrationsAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('status') status?: string) {
    const where =
      status && (Object.values(MigrationStatus) as string[]).includes(status)
        ? { status: status as MigrationStatus }
        : {};
    const rows = await this.prisma.migrationRequest.findMany({
      where,
      // Eskalacje („Pilne”) zawsze na górze kolejki staffa.
      orderBy: [{ needsAttention: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        subscriptionId: true,
        status: true,
        currentStep: true,
        targetDomain: true,
        sourcePanelType: true,
        needsAttention: true,
        attentionReason: true,
        attentionAt: true,
        cutoverMode: true,
        cutoverAt: true,
        ticketId: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { email: true } },
        subscription: { select: { serviceTag: true, plan: { select: { name: true } } } },
        workerJobs: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            kind: true,
            status: true,
            attempts: true,
            maxAttempts: true,
            sequence: true,
            lastError: true,
          },
        },
      },
    });
    const attentionCount = await this.prisma.migrationRequest.count({
      where: { needsAttention: true },
    });
    return {
      attentionCount,
      rows: rows.map((r) => ({
        id: r.id,
        subscriptionId: r.subscriptionId,
        status: r.status,
        currentStep: r.currentStep,
        targetDomain: r.targetDomain,
        sourcePanelType: r.sourcePanelType,
        needsAttention: r.needsAttention,
        attentionReason: r.attentionReason,
        attentionAt: r.attentionAt?.toISOString() ?? null,
        cutoverMode: r.cutoverMode,
        cutoverAt: r.cutoverAt?.toISOString() ?? null,
        ticketId: r.ticketId,
        lastError: r.lastError,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        userEmail: r.user?.email ?? null,
        serviceTag: r.subscription?.serviceTag ?? null,
        planName: r.subscription?.plan?.name ?? null,
        jobs: r.workerJobs.map((j) => ({
          id: j.id,
          kind: j.kind,
          status: j.status,
          attempts: j.attempts,
          maxAttempts: j.maxAttempts,
          sequence: j.sequence,
          lastError: j.lastError,
        })),
      })),
    };
  }
}
