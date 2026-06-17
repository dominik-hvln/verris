import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { VpsService } from './vps.service';
import { AddSshKeyDto, OrderVpsDto, VpsPowerDto } from './dto/vps.dto';

@Controller('vps')
@UseGuards(JwtAuthGuard)
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

  @Delete(':id')
  @HttpCode(200)
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.vps.remove(user.userId, id);
  }
}
