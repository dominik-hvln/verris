import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { ClientWebhooksService } from './client-webhooks.service';

class NowyWebhookDto {
  @IsString() @MaxLength(500) url!: string;
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) events!: string[];
}

/** L-10 — webhooki klienta (ustawienia konta, obok tokenów API). */
@Controller('users/me/webhooks')
@UseGuards(JwtAuthGuard)
export class ClientWebhooksController {
  constructor(private readonly webhooks: ClientWebhooksService) {}

  @Get()
  lista(@CurrentUser() user: { userId: string }) {
    return this.webhooks.lista(user.userId);
  }

  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'client-webhooks:write' })
  @Post()
  dodaj(@CurrentUser() user: { userId: string }, @Body() body: NowyWebhookDto) {
    return this.webhooks.dodaj(user.userId, body);
  }

  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'client-webhooks:write' })
  @Post(':id/delete')
  usun(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.webhooks.usun(user.userId, id);
  }

  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'client-webhooks:test' })
  @Post(':id/test')
  test(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.webhooks.test(user.userId, id);
  }
}
