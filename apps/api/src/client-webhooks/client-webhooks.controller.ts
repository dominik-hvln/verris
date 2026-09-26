import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { ClientWebhooksService } from './client-webhooks.service.js';

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
  dodaj(
    @CurrentUser() user: { userId: string; customerOwnerId?: string | null; customerPermissions?: string[] },
    @Body() body: NowyWebhookDto,
  ) {
    // Zdarzenia rozliczeń (faktura, odnowienie, zaległość) niosą kwoty — subkonto bez wglądu
    // w rozliczenia nie może ich sobie wyprowadzić webhookiem.
    if (user.customerOwnerId && !(user.customerPermissions ?? []).includes('BILLING_READ')) {
      const rozliczenia = body.events.filter((z) => z.startsWith('invoice.') || z.startsWith('subscription.'));
      if (rozliczenia.length) {
        throw new ForbiddenException(`Zdarzenia rozliczeń (${rozliczenia.join(', ')}) wymagają uprawnienia do odczytu rozliczeń.`);
      }
    }
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
