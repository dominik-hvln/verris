import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RuntimeErrorTracker } from './runtime-error-tracker.service';

/**
 * CYBER-9 — widok błędów runtime w panelu admin/staff (odpowiednie uprawnienia).
 * Zwraca ostatnie zdarzenia z ring buffera + agregaty. Pełna historia/triage w
 * self-hosted GlitchTip (link w panelu).
 */
@Controller('admin/observability/errors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class RuntimeErrorsController {
  constructor(private readonly tracker: RuntimeErrorTracker) {}

  @Get()
  list(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 50;
    return {
      summary: this.tracker.summary(),
      recent: this.tracker.recent(Number.isFinite(n) ? n : 50),
    };
  }
}
