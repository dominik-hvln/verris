import { Global, Module } from '@nestjs/common';
import { ClientWebhooksService } from './client-webhooks.service';
import { ClientWebhooksController } from './client-webhooks.controller';

/** L-10 — globalny, bo zdarzenia emitują różne moduły (zadania węzła). */
@Global()
@Module({
  providers: [ClientWebhooksService],
  controllers: [ClientWebhooksController],
  exports: [ClientWebhooksService],
})
export class ClientWebhooksModule {}
