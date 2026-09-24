import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResellerService } from './reseller.service';
import { RateLimit } from '../common/guards/rate-limit.guard';

class WniosekResellerDto {
  @IsOptional() @IsString() @MaxLength(80) brandName?: string;
}

class NowyKlientDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(80) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(80) lastName!: string;
}

class NarzutDto {
  @IsInt() @Min(0) @Max(300) markupPct!: number;
}

/** RSL — panel resellera (self-service, JWT). */
@Controller('reseller')
@UseGuards(JwtAuthGuard)
export class ResellerController {
  constructor(private readonly reseller: ResellerService) {}

  @Get('me/overview')
  overview(@CurrentUser() user: { userId: string }) {
    return this.reseller.getOverview(user.userId);
  }

  /** O-08 — wniosek o program resellerski (PENDING do akceptacji operatora). */
  @Post('me/apply')
  apply(@CurrentUser() user: { userId: string }, @Body() body: WniosekResellerDto) {
    return this.reseller.apply(user.userId, body);
  }

  /** O-06 — reseller zakłada konto swojemu klientowi (limit dzienny, mail z linkiem „ustaw hasło”). */
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'reseller:create-client' })
  @Post('me/clients')
  createClient(@CurrentUser() user: { userId: string }, @Body() body: NowyKlientDto) {
    return this.reseller.createClient(user.userId, body);
  }

  /** O-07 — własny narzut resellera. */
  @Post('me/markup')
  setMarkup(@CurrentUser() user: { userId: string }, @Body() body: NarzutDto) {
    return this.reseller.setMarkup(user.userId, body.markupPct);
  }

  @Get('me/clients')
  clients(@CurrentUser() user: { userId: string }) {
    return this.reseller.listClients(user.userId);
  }
}
