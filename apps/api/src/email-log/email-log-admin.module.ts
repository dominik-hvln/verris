import { Module } from '@nestjs/common';
import { EmailLogAdminController } from './email-log.admin.controller.js';
import { EmailLogService } from './email-log.service.js';

@Module({
  controllers: [EmailLogAdminController],
  providers: [EmailLogService],
  exports: [EmailLogService],
})
export class EmailLogAdminModule {}
