import { Module } from '@nestjs/common';
import { ApiTokensService } from './api-tokens.service.js';
import { ApiTokensController } from './api-tokens.controller.js';
import { PublicApiController } from './public-api.controller.js';
import { ApiTokenGuard } from './api-token.guard.js';

@Module({
  providers: [ApiTokensService, ApiTokenGuard],
  controllers: [ApiTokensController, PublicApiController],
  exports: [ApiTokensService],
})
export class ApiTokensModule {}
