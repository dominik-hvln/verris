import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { CannedResponseService } from './canned-response.service';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService, CannedResponseService],
  exports: [TicketsService, CannedResponseService],
})
export class TicketsModule {}
