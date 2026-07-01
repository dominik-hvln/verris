import { Module } from '@nestjs/common';
import { ApiTokensService } from './api-tokens.service';
import { ApiTokensController } from './api-tokens.controller';
import { PublicApiController } from './public-api.controller';
import { ApiTokenGuard } from './api-token.guard';

@Module({
  providers: [ApiTokensService, ApiTokenGuard],
  controllers: [ApiTokensController, PublicApiController],
  exports: [ApiTokensService],
})
export class ApiTokensModule {}
