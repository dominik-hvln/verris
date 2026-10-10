import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MigrationStatus, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { MigrationOrchestratorService } from './migration-orchestrator.service.js';
import { MigracjaZaKlientaService } from './migracja-za-klienta.service.js';
import { MigracjaZaKlientaDto, PreflightZaKlientaDto } from './dto/migration.dto.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';

class RevealSecretsDto {
  @IsOptional()
  @IsString()
  @MinLength(10, {
    message: 'Powód jest wymagany (min. 10 znaków). Zapisujemy go w audicie.',
  })
  @MaxLength(500)
  reason?: string;
}

class StatusUpdateDto {
  @IsEnum(MigrationStatus)
  status!: MigrationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class ResolveAttentionDto {
  @IsIn(['requeue', 'completed', 'failed'])
  outcome!: 'requeue' | 'completed' | 'failed';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

interface AuthedUser {
  userId: string;
  role: Role;
}

/**
 * Sprint 7 / S-05 — staff queue migracji. STAFF/ADMIN widzą listę i mogą
 * podglądać sekrety (audytowane), zmieniać status i anulować.
 */
@Controller('staff/migrations')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.STAFF, Role.ADMIN)
@StaffPerm('MIGRATIONS_MANAGE')
export class MigrationsStaffController {
  constructor(
    private readonly migrations: MigrationOrchestratorService,
    private readonly zaKlienta: MigracjaZaKlientaService,
  ) {}

  /**
   * PB-45 — migracja za klienta: obsługa wypełnia źródło (np. z danych ze zgłoszenia), klient dostaje mail
   * z prośbą o zgodę, a migracja rusza dopiero po jego „Zgadzam się”. Powód / numer zgłoszenia — do dziennika.
   */
  @Post('za-klienta')
  // Przyjęcie loguje się do starych serwerów IMAP (E-21) — limit jak przy kreatorze klienta.
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'migration:preflight' })
  async utworzZaKlienta(@CurrentUser() user: AuthedUser, @Body() dto: MigracjaZaKlientaDto) {
    const { subscriptionId, powod, ticketId, ...zlecenie } = dto;
    return this.zaKlienta.utworz({
      subscriptionId,
      actorUserId: user.userId,
      powod: powod.trim(),
      ticketId: ticketId?.trim() || null,
      zlecenie,
    });
  }

  /** PB-45 — usługa i klient do nagłówka formularza (to samo uprawnienie co założenie migracji za klienta). */
  @Get('za-klienta/usluga/:subscriptionId')
  uslugaZaKlienta(@Param('subscriptionId') subscriptionId: string) {
    return this.zaKlienta.uslugaDoFormularza(subscriptionId);
  }

  /** PB-45 — test dostępów do starego hostingu z formularza obsługi (realne logowanie, bez zapisu danych). */
  @Post('za-klienta/preflight')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'migration:preflight' })
  async testDostepowZaKlienta(@CurrentUser() user: AuthedUser, @Body() dto: PreflightZaKlientaDto) {
    const { subscriptionId, ...zlecenie } = dto;
    return this.zaKlienta.testDostepow({ subscriptionId, actorUserId: user.userId, zlecenie });
  }

  @Post(':id/reveal-secrets')
  @HttpCode(200)
  async revealSecrets(
    @Param('id') id: string,
    @CurrentUser() user: AuthedUser,
    @Body() dto: RevealSecretsDto,
  ) {
    if (!dto.reason || dto.reason.trim().length < 10) {
      throw new BadRequestException(
        'Powód odczytu sekretów jest wymagany (min. 10 znaków). Zostanie zapisany w audicie.',
      );
    }
    return this.migrations.revealSecretsForStaff({
      migrationRequestId: id,
      actorUserId: user.userId,
      actorRole: user.role,
      reason: dto.reason.trim(),
    });
  }

  @Post(':id/status')
  @HttpCode(200)
  async setStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthedUser,
    @Body() dto: StatusUpdateDto,
  ) {
    return this.migrations.setStatusForStaff({
      migrationRequestId: id,
      actorUserId: user.userId,
      status: dto.status,
      note: dto.note ?? null,
    });
  }

  /** Migrator v2 — szczegóły zlecenia z jobami, logami i payloadami (bez sekretów bundla). */
  @Get(':id/detail')
  async detail(@Param('id') id: string) {
    return this.migrations.getBundleDetailForStaff(id);
  }

  /** Migrator v2 — rozwiązanie eskalacji: wznowienie automatu / zamknięcie. */
  @Post(':id/resolve-attention')
  @HttpCode(200)
  async resolveAttention(
    @Param('id') id: string,
    @CurrentUser() user: AuthedUser,
    @Body() dto: ResolveAttentionDto,
  ) {
    return this.migrations.resolveAttentionForStaff({
      migrationRequestId: id,
      actorUserId: user.userId,
      outcome: dto.outcome,
      note: dto.note ?? null,
    });
  }

  /** Migrator v2 — ponowienie pojedynczego kroku (świeży licznik prób). */
  @Post(':id/jobs/:jobId/retry')
  @HttpCode(200)
  async retryJob(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.migrations.retryWorkerJobForStaff({
      migrationRequestId: id,
      jobId,
      actorUserId: user.userId,
    });
  }
}
