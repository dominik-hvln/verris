import { Module } from '@nestjs/common';
import { EmailLogAdminController } from './email-log.admin.controller';
import { EmailLogService } from './email-log.service';

@Module({
  controllers: [EmailLogAdminController],
  providers: [EmailLogService],
  exports: [EmailLogService],
})
export class EmailLogAdminModule {}
