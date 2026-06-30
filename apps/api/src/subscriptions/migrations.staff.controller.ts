import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MigrationStatus, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MigrationOrchestratorService } from './migration-orchestrator.service';

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
  constructor(private readonly migrations: MigrationOrchestratorService) {}

  @Get()
  async list(@Query('status') status?: string) {
    let parsed: MigrationStatus | undefined;
    if (status) {
      const upper = status.toUpperCase();
      if (!(upper in MigrationStatus)) {
        throw new BadRequestException(
          `Niepoprawny status migracji: "${status}". Dozwolone: ${Object.values(MigrationStatus).join(', ')}.`,
        );
      }
      parsed = upper as MigrationStatus;
    }
    return this.migrations.listAllBundlesForStaff({ status: parsed });
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
}
