import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StosWezlaService } from './stos-wezla.service';
import { NodeTasksService } from './node-tasks.service';
import { DOZWOLONE } from './stos-wezla';

class ManifestDto {
  @IsIn(DOZWOLONE.daKanal.map((x) => x.v))
  daKanal!: string;

  @IsOptional() @IsString() @MaxLength(40) @Matches(/^[0-9a-fA-F]*$/)
  daCommit!: string;

  @IsIn(DOZWOLONE.php1.map((x) => x.v))
  php1!: string;

  @IsIn(DOZWOLONE.mariadb.map((x) => x.v))
  mariadb!: string;

  @IsIn(DOZWOLONE.litespeedLinia.map((x) => x.v))
  litespeedLinia!: string;
}

/**
 * PB-33 — „Wersje stosu floty”: manifest w panelu (tylko admin) i wyrównanie floty falą
 * (kanarek → reszta po jednym; PHP/LiteSpeed przez CustomBuild, MariaDB krok po kroku z kopią).
 */
@Controller('admin/stack-manifest')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class StosWezlaAdminController {
  constructor(
    private readonly stos: StosWezlaService,
    private readonly tasks: NodeTasksService,
  ) {}

  @Get()
  widok() {
    return this.stos.widok();
  }

  @Put()
  async zapisz(@CurrentUser() u: { userId: string; actorUserId?: string }, @Body() dto: ManifestDto) {
    await this.stos.zapisz({ ...dto, daCommit: dto.daCommit ?? '' }, u.actorUserId ?? u.userId);
    return this.stos.widok();
  }

  @Post('align')
  wyrownaj(@CurrentUser() u: { userId: string; actorUserId?: string }) {
    return this.tasks.queueFleetUpdate(u.actorUserId ?? u.userId, { wyrownaj: true });
  }
}
