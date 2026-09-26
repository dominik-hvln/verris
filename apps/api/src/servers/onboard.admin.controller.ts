import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { NodeTaskStatus, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { NodeTasksService } from './node-tasks.service';
import { BackupOffsiteService } from './backup-offsite.service';

class BackupOffsiteDto {
  @IsString() @MaxLength(253) @Matches(/^[a-z0-9.-]+$/i, { message: 'Host: sama nazwa, np. u123456.your-storagebox.de' })
  host!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  port!: number;

  @IsString() @MinLength(1) @MaxLength(64) @Matches(/^[a-z0-9._-]+$/i)
  user!: string;

  @IsString() @MaxLength(200) @Matches(/^[a-z0-9._/-]*$/i, { message: 'Ścieżka: litery, cyfry, . _ - /' })
  sciezka!: string;

  @Type(() => Number) @IsInt() @Min(7) @Max(365)
  retencjaDni!: number;

  @IsOptional() @IsString() @MaxLength(256)
  pass?: string;

  @IsOptional() @IsString() @MinLength(16) @MaxLength(256)
  cryptPass?: string;

  @IsOptional() @IsString() @MinLength(16) @MaxLength(256)
  cryptSalt?: string;
}

/**
 * PB-31 — automatyzacja kreatora węzła z panelu:
 *  - kopie off-site floty (raz, dla wszystkich węzłów) — tylko admin, bo to klucze do kopii wszystkich klientów;
 *  - Onboard LIVE jako zadanie agenta + jego stan (raport gotowości, ostatnie zadanie).
 */
@Controller('admin/node-onboard')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
export class OnboardAdminController {
  constructor(
    private readonly backup: BackupOffsiteService,
    private readonly tasks: NodeTasksService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('backup-offsite')
  @Roles(Role.ADMIN)
  backupPodglad() {
    return this.backup.podglad();
  }

  @Put('backup-offsite')
  @Roles(Role.ADMIN)
  backupZapisz(@CurrentUser() u: { userId: string; actorUserId?: string }, @Body() dto: BackupOffsiteDto) {
    return this.backup.zapisz(dto, u.actorUserId ?? u.userId);
  }

  @Post('server/:id/run')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('NODES_MANAGE')
  uruchom(@Param('id') id: string, @CurrentUser() u: { userId: string; actorUserId?: string }) {
    return this.tasks.queueOnboardLive(id, u.actorUserId ?? u.userId);
  }

  @Get('server/:id')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('NODES_VIEW')
  async stan(@Param('id') id: string) {
    const [srv, zadanie] = await Promise.all([
      this.prisma.server.findUnique({ where: { id }, select: { onboardVerifiedAt: true, onboardReport: true } }),
      this.prisma.nodeTask.findFirst({
        where: { serverId: id, kind: 'ONBOARD_LIVE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, createdAt: true, startedAt: true, completedAt: true, errorMessage: true },
      }),
    ]);
    return {
      zweryfikowany: srv?.onboardVerifiedAt ?? null,
      raport: srv?.onboardReport ?? null,
      zadanie: zadanie ?? null,
      trwa: zadanie ? zadanie.status === NodeTaskStatus.QUEUED || zadanie.status === NodeTaskStatus.RUNNING : false,
    };
  }
}
