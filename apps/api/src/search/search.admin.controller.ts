import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPermAny } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { SearchService, UPRAWNIENIA_WYSZUKIWARKI, type Wyszukujacy } from './search.service.js';

/**
 * ADM-4 — globalna wyszukiwarka (Cmd-K) dla admina i staffa: klienci, usługi, domeny, faktury, węzły,
 * zgłoszenia, migracje. Wejście: którekolwiek z uprawnień typów (10.10 — wcześniej całość za CUSTOMERS_VIEW,
 * więc np. operator floty nie znajdował węzła); serwis zwraca tylko typy, do których operator ma uprawnienie.
 */
@Controller('admin/search')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class SearchAdminController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @StaffPermAny(...UPRAWNIENIA_WYSZUKIWARKI)
  run(@Query('q') q: string, @CurrentUser() kto: Wyszukujacy) {
    return this.search.search(q ?? '', kto);
  }
}
