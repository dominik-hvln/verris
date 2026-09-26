import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { SearchService } from './search.service.js';

/** ADM-4 — globalna wyszukiwarka (Cmd-K) dla admina i staffa. */
@Controller('admin/search')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class SearchAdminController {
  constructor(private readonly search: SearchService) {}

  @Get()
  run(@Query('q') q: string) {
    return this.search.search(q ?? '');
  }
}
