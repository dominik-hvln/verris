import { Module } from '@nestjs/common';
import { SearchService } from './search.service.js';
import { SearchAdminController } from './search.admin.controller.js';

/** ADM-4 — globalna wyszukiwarka admin/staff. */
@Module({
  controllers: [SearchAdminController],
  providers: [SearchService],
})
export class SearchModule {}
