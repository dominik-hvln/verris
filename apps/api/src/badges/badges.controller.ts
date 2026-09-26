import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { BadgesService } from './badges.service.js';

@Controller('services')
@UseGuards(JwtAuthGuard)
export class BadgesController {
  constructor(private readonly badges: BadgesService) {}

  @Get(':id/badges')
  panel(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.badges.panel(id, user.userId);
  }
}
