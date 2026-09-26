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

type ApiAuth = { userId: string };
const kto = (req: Request) => (req as unknown as { apiAuth: ApiAuth }).apiAuth.userId;

class WdrozenieApiDto {
  @Linia(253) domain!: string;
  @IsOptional() @Linia(200) dir?: string;
}

/**
 * L-08 — zapis przez publiczne API (token vrs_live, własny zakres): rekordy DNS (Terraform,
 * DNS-01 dla certyfikatów) i wdrożenie z Gita po pushu (CI/CD). Te same serwisy i walidacja co
 * panel; własność usługi i domeny sprawdzają serwisy po userId z tokenu.
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
}
