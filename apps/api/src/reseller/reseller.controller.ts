import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResellerService } from './reseller.service';
import { ResellerKlienciService } from './reseller-klienci.service';
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

class MarkaDto {
  @IsString() @MinLength(1) @MaxLength(80) brandName!: string;
}

class LogoDto {
  /** Plik PNG/JPEG/WebP jako base64 (bez prefiksu data:). Limit 100 KB po zdekodowaniu — sprawdzany w serwisie. */
  @IsString() @MaxLength(140_000) base64!: string;
}

/** RSL — panel resellera (self-service, JWT). */
@Controller('reseller')
@UseGuards(JwtAuthGuard)
export class ResellerController {
  constructor(
    private readonly reseller: ResellerService,
    private readonly klienci: ResellerKlienciService,
  ) {}

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

  /** O-09 — nazwa marki widoczna dla klientów resellera. */
  @Post('me/brand')
  setBrand(@CurrentUser() user: { userId: string }, @Body() body: MarkaDto) {
    return this.reseller.setBrand(user.userId, body.brandName);
  }

  /** O-09 — logo marki (PNG/JPEG/WebP ≤ 100 KB). */
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'reseller:logo' })
  @Post('me/logo')
  setLogo(@CurrentUser() user: { userId: string }, @Body() body: LogoDto) {
    return this.reseller.setLogo(user.userId, body.base64);
  }

  @Delete('me/logo')
  deleteLogo(@CurrentUser() user: { userId: string }) {
    return this.reseller.setLogo(user.userId, null);
  }

  /** O-05 — szczegóły klienta: wyłącznie usługi i ich stan (bez salda, danych rozliczeniowych i logowania na konto). */
  @Get('me/clients/:clientId')
  client(@CurrentUser() user: { userId: string }, @Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.klienci.szczegoly(user.userId, clientId);
  }

  /** O-05 — nowy link „ustaw hasło” na adres klienta (raz na 10 min, stare linki przestają działać). */
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'reseller:password-link' })
  @Post('me/clients/:clientId/password-link')
  passwordLink(@CurrentUser() user: { userId: string }, @Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.klienci.linkHasla(user.userId, clientId);
  }

  @Post('me/clients/:clientId/service/:serviceId/suspend')
  suspend(
    @CurrentUser() user: { userId: string },
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ) {
    return this.klienci.wstrzymaj(user.userId, clientId, serviceId);
  }

  @Post('me/clients/:clientId/service/:serviceId/resume')
  resume(
    @CurrentUser() user: { userId: string },
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ) {
    return this.klienci.wznow(user.userId, clientId, serviceId);
  }

  /** O-05 — odpięcie klienta: zostaje samodzielnym klientem Verris, konto i usługi bez zmian. */
  @Delete('me/clients/:clientId')
  detach(@CurrentUser() user: { userId: string }, @Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.klienci.odepnij(user.userId, clientId);
  }
}
