import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PodgladService } from './podglad.service.js';

/** 15.10 — adres podglądu strony przed zmianą DNS dla klienta (subkonto: SERVICES_READ jak inne trasy usług). */
@Controller('services')
@UseGuards(JwtAuthGuard)
export class PodgladKlientController {
  constructor(private readonly podglad: PodgladService) {}

  /** Adres podglądu strony konta (przed przełączeniem domeny). 404, gdy funkcja nie jest włączona. */
  @Get(':id/podglad')
  adres(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.podglad.adresDlaKlienta(id, user.userId);
  }
}
