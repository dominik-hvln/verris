import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsOptional } from 'class-validator';
import { ApiTokenGuard } from '../api-tokens/api-token.guard.js';
import { ApiScope } from '../api-tokens/api-scope.decorator.js';
import { API_SCOPES } from '../api-tokens/api-scopes.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { GitDeployService } from './git-deploy.service.js';
import { UsunRekordDnsDto, UtworzRekordDnsDto } from './dto/hosting-dns.dto.js';
import { Linia } from './dto/hosting-body.dto.js';
import { UsunSkrzynkeApiDto, UtworzSkrzynkeDto, ZmienHasloSkrzynkiDto, ZmienRozmiarSkrzynkiDto } from './dto/hosting-email.dto.js';

type ApiAuth = { userId: string };
const kto = (req: Request) => (req as unknown as { apiAuth: ApiAuth }).apiAuth.userId;

class WdrozenieApiDto {
  @Linia(253) domain!: string;
  @IsOptional() @Linia(200) dir?: string;
}

/**
 * L-08 — zapis przez publiczne API (token vrs_live, własny zakres): rekordy DNS (Terraform,
 * DNS-01 dla certyfikatów), wdrożenie z Gita po pushu (CI/CD) i — od nocy 15.10 (decyzja 02.10: „po starcie”) —
 * skrzynki pocztowe (mail:read, mail:write). Te same serwisy i walidacja co panel; własność usługi i domeny
 * sprawdzają serwisy po userId z tokenu (token tworzy tylko właściciel konta).
 */
@Controller('api/v1/services')
@UseGuards(ApiTokenGuard)
export class PublicApiWriteController {
  constructor(
    private readonly directAdmin: DirectAdminService,
    private readonly gitDeploy: GitDeployService,
  ) {}

  @Get(':id/dns')
  @ApiScope(API_SCOPES.DNS_READ)
  dns(@Req() req: Request, @Param('id') id: string, @Query('domain') domain?: string) {
    return this.directAdmin.listHostingDnsRecords(id, kto(req), domain);
  }

  @Post(':id/dns')
  @HttpCode(201)
  @ApiScope(API_SCOPES.DNS_WRITE)
  @RateLimit({ limit: 120, windowMs: 60 * 60 * 1000, scope: 'api:dns-write' })
  dodajDns(@Req() req: Request, @Param('id') id: string, @Body() body: UtworzRekordDnsDto) {
    return this.directAdmin.createHostingDnsRecord(id, kto(req), body);
  }

  @Post(':id/dns/delete')
  @HttpCode(200)
  @ApiScope(API_SCOPES.DNS_WRITE)
  @RateLimit({ limit: 120, windowMs: 60 * 60 * 1000, scope: 'api:dns-write' })
  usunDns(@Req() req: Request, @Param('id') id: string, @Body() body: UsunRekordDnsDto) {
    return this.directAdmin.deleteHostingDnsRecord(id, kto(req), body);
  }

  @Get(':id/deploy')
  @ApiScope(API_SCOPES.DEPLOY_WRITE)
  wdrozenie(@Req() req: Request, @Param('id') id: string, @Query('domain') domain: string) {
    return this.gitDeploy.status(id, kto(req), domain);
  }

  @Post(':id/deploy')
  @HttpCode(202)
  @ApiScope(API_SCOPES.DEPLOY_WRITE)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'api:deploy' })
  wdroz(@Req() req: Request, @Param('id') id: string, @Body() body: WdrozenieApiDto) {
    return this.gitDeploy.zlec(id, kto(req), 'pull', body);
  }

  // ── Skrzynki pocztowe (noc 15.10) ──────────────────────────────────────────────────────────────
  @Get(':id/mailboxes')
  @ApiScope(API_SCOPES.MAIL_READ)
  skrzynki(@Req() req: Request, @Param('id') id: string) {
    return this.directAdmin.listHostingEmailAccounts(id, kto(req));
  }

  @Post(':id/mailboxes')
  @HttpCode(201)
  @ApiScope(API_SCOPES.MAIL_WRITE)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'api:mail-write' })
  zalozSkrzynke(@Req() req: Request, @Param('id') id: string, @Body() body: UtworzSkrzynkeDto) {
    return this.directAdmin.createHostingEmailAccount(id, kto(req), body);
  }

  @Post(':id/mailboxes/password')
  @HttpCode(200)
  @ApiScope(API_SCOPES.MAIL_WRITE)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'api:mail-write' })
  hasloSkrzynki(@Req() req: Request, @Param('id') id: string, @Body() body: ZmienHasloSkrzynkiDto) {
    return this.directAdmin.changeHostingEmailPassword(id, kto(req), body);
  }

  @Post(':id/mailboxes/quota')
  @HttpCode(200)
  @ApiScope(API_SCOPES.MAIL_WRITE)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'api:mail-write' })
  rozmiarSkrzynki(@Req() req: Request, @Param('id') id: string, @Body() body: ZmienRozmiarSkrzynkiDto) {
    return this.directAdmin.changeHostingEmailQuota(id, kto(req), body);
  }

  @Post(':id/mailboxes/delete')
  @HttpCode(200)
  @ApiScope(API_SCOPES.MAIL_WRITE)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'api:mail-write' })
  usunSkrzynke(@Req() req: Request, @Param('id') id: string, @Body() body: UsunSkrzynkeApiDto) {
    return this.directAdmin.deleteHostingEmailAccount(id, kto(req), body.email);
  }
}
