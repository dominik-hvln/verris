import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SearchService } from './search.service';

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
