import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { SearchService } from './search.service.js';

/**
 * ADM-4 — globalna wyszukiwarka (Cmd-K) dla admina i staffa. Zwraca klientów (e-mail, imię, firma,
 * wyszukiwanie po NIP), usługi i faktury — to ten sam wgląd co lista klientów, więc to samo uprawnienie.
 */
@Controller('admin/search')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('CUSTOMERS_VIEW')
export class SearchAdminController {
  constructor(private readonly search: SearchService) {}

  @Get()
  run(@Query('q') q: string) {
    return this.search.search(q ?? '');
  }
}
