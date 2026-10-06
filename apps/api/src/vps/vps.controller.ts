import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Param, Post, UseGuards,
  type CanActivate, type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { funkcjaDlaUzytkownika } from '../common/funkcje-testowe.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { VpsService } from './vps.service.js';
import { AddSshKeyDto, CreateVpsSnapshotDto, OrderVpsDto, VpsPowerDto, VpsRebuildDto } from './dto/vps.dto.js';

/**
 * VPS dla klienta tylko, gdy obejmuje go FEATURE_VPS / FEATURE_VPS_TYLKO_KONTA (domyślnie wyłączony).
 * Do 2026-10-06 VPS był ukryty wyłącznie w panelu — API przyjmowało zamówienie od każdego klienta.
 */
@Injectable()
export class VpsDostepGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const user = ctx.switchToHttp().getRequest<{ user?: { userId?: string } }>().user;
    if (await funkcjaDlaUzytkownika(this.config, this.prisma, 'FEATURE_VPS', user?.userId)) return true;
    throw new ForbiddenException('Serwery VPS nie są jeszcze dostępne na tym koncie.');
  }
}

@Controller('vps')
@UseGuards(JwtAuthGuard, VpsDostepGuard)
export class VpsController {
  constructor(private readonly vps: VpsService) {}

  @Get('availability')
  availability() {
    return { available: this.vps.isAvailable() };
  }

  @Get('plans')
  plans() {
    return this.vps.listPlans();
  }

  // --- SSH keys ---

  @Get('ssh-keys')
  sshKeys(@CurrentUser() user: { userId: string }) {
    return this.vps.listSshKeys(user.userId);
  }

  @Post('ssh-keys')
  @HttpCode(201)
  addSshKey(@CurrentUser() user: { userId: string }, @Body() dto: AddSshKeyDto) {
    return this.vps.addSshKey(user.userId, dto);
  }

  @Delete('ssh-keys/:id')
  @HttpCode(200)
  deleteSshKey(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.vps.deleteSshKey(user.userId, id);
  }

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.vps.listForUser(user.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.vps.getForUser(user.userId, id);
  }

  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, scope: 'vps:order' })
  @Post()
  @HttpCode(201)
  order(@CurrentUser() user: { userId: string }, @Body() dto: OrderVpsDto) {
    return this.vps.order(user.userId, dto);
  }

  @Post(':id/power')
  @HttpCode(200)
  power(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: VpsPowerDto,
  ) {
    return this.vps.power(user.userId, id, dto.action);
  }

  // --- Q-08 snapshoty i reinstalacja ---

  @Get(':id/snapshots')
  snapshots(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.vps.listSnapshots(user.userId, id);
  }

  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'vps:snapshot' })
  @Post(':id/snapshots')
  @HttpCode(201)
  createSnapshot(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: CreateVpsSnapshotDto,
  ) {
    return this.vps.createSnapshot(user.userId, id, dto.description);
  }

  @Delete(':id/snapshots/:snapshotId')
  @HttpCode(200)
  deleteSnapshot(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return this.vps.deleteSnapshot(user.userId, id, snapshotId);
  }

  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'vps:rebuild' })
  @Post(':id/snapshots/:snapshotId/restore')
  @HttpCode(202)
  restoreSnapshot(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return this.vps.restoreSnapshot(user.userId, id, snapshotId);
  }

  @Get(':id/images')
  osImages(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.vps.listOsImages(user.userId, id);
  }

  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'vps:rebuild' })
  @Post(':id/rebuild')
  @HttpCode(202)
  rebuild(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() dto: VpsRebuildDto) {
    return this.vps.rebuild(user.userId, id, dto.image);
  }

  @Get(':id/actions/:actionId')
  action(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('actionId') actionId: string,
  ) {
    return this.vps.actionStatus(user.userId, id, actionId);
  }

  // --- Q-07 konsola ---

  /** URL sesji jest ważny 1 minutę — limit chroni przed seryjnym wydawaniem haseł. */
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'vps:console' })
  @Post(':id/console')
  @HttpCode(201)
  console(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.vps.console(user.userId, id);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.vps.remove(user.userId, id);
  }
}
