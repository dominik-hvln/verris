import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { NodeBootstrapService } from './node-bootstrap.service.js';
import { BootstrapTokenService } from './bootstrap-token.service.js';
import { buildNodeBootstrapScript } from './node-bootstrap.script.js';
import { stosJakoEnv } from './stos-wezla.js';
import { StosWezlaService } from './stos-wezla.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

class BootstrapReportDto {
  @IsString() @MaxLength(64)
  serverId!: string;

  @IsString() @MaxLength(32)
  phase!: string;

  @IsIn(['STARTED', 'OK', 'FAILED', 'REBOOT'])
  status!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  message?: string;
}

/**
 * NODE-2 — publiczne endpointy bootstrapu węzła (auth = token bootstrapu):
 *  - GET  /agent/nodes/bootstrap/script?token=…  → wznawialny skrypt (oneshot)
 *  - POST /agent/nodes/bootstrap/report          → raport fazy (X-Bootstrap-Token)
 */
@Controller('agent/nodes/bootstrap')
export class NodeBootstrapAgentController {
  constructor(
    private readonly bootstrap: NodeBootstrapService,
    private readonly tokens: BootstrapTokenService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly stos: StosWezlaService,
  ) {}

  private apiBaseUrl(): string {
    return (
      this.config.get<string>('PUBLIC_API_URL') ??
      this.config.get<string>('API_BASE_URL') ??
      'https://api.verris.pl'
    );
  }

  @Get('script')
  @Header('Content-Type', 'text/x-shellscript; charset=utf-8')
  async script(
    @Headers('x-bootstrap-token') headerToken?: string,
    @Query('token') queryToken?: string,
  ): Promise<string> {
    // PB-29 — token w nagłówku (query zostaje dla one-linerów wygenerowanych wcześniej).
    const token = headerToken || queryToken;
    if (!token) throw new BadRequestException('Brak tokenu.');
    // Waliduje token (bez konsumpcji — handshake konsumuje go w fazie AGENT).
    const found = await this.tokens.peek(token);
    const srv = await this.prisma.server.findUnique({ where: { id: found.server.id }, select: { hostname: true } });
    // Bez kluczy licencyjnych w treści — skrypt pobiera je osobno (POST /secrets).
    return buildNodeBootstrapScript({
      apiBaseUrl: this.apiBaseUrl(),
      bootstrapToken: token,
      serverId: found.server.id,
      stackEnv: stosJakoEnv(await this.stos.pobierz()),
      hostname: srv?.hostname ?? null,
    });
  }

  /**
   * PB-29 — klucze licencyjne dla trwającego bootstrapu: tylko POST z nagłówkiem tokenu
   * (nie w adresie, nie w treści skryptu), tylko przed handshake (token nieużyty), każdy odczyt w audycie.
   */
  @Post('secrets')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async secrets(@Headers('x-bootstrap-token') headerToken?: string): Promise<string> {
    if (!headerToken) throw new UnauthorizedException('Brak tokenu bootstrapu.');
    const found = await this.tokens.peek(headerToken);
    const keys = await this.bootstrap.licenseKeysFor(found.server.id);
    await this.audit.record({
      action: 'NODE_BOOTSTRAP_SECRETS_READ',
      details: { serverId: found.server.id, da: !!keys.daLicenseKey, cl: !!keys.clActivationKey, ls: !!keys.lsSerial },
    });
    const linia = (k: string, v: string | null) => `${k}=${(v ?? '').replace(/[\r\n'"\\]/g, '').trim()}`;
    return [
      linia('DA_LICENSE', keys.daLicenseKey),
      linia('CL_ACTIVATION_KEY', keys.clActivationKey),
      linia('LS_SERIAL', keys.lsSerial),
      '',
    ].join('\n');
  }

  /** Faza AGENT — istniejący skrypt handshake+agent LVE (reużycie, bez mocków). */
  @Get('agent-script')
  @Header('Content-Type', 'text/x-shellscript; charset=utf-8')
  async agentScript(
    @Headers('x-bootstrap-token') headerToken?: string,
    @Query('token') queryToken?: string,
  ): Promise<string> {
    const token = headerToken || queryToken;
    if (!token) throw new BadRequestException('Brak tokenu.');
    const found = await this.tokens.peek(token);
    return this.bootstrap.agentScript(found.server.id, token);
  }

  @Post('report')
  @HttpCode(204)
  async report(
    @Body() dto: BootstrapReportDto,
    @Headers('x-bootstrap-token') headerToken?: string,
  ): Promise<void> {
    if (!headerToken) throw new UnauthorizedException('Brak tokenu bootstrapu.');
    // Token → serverId (bez konsumpcji); musi zgadzać się z serverId z body.
    const serverId = await this.bootstrap.serverIdForBootstrapToken(headerToken);
    if (serverId !== dto.serverId) {
      throw new UnauthorizedException('Token nie pasuje do węzła.');
    }
    await this.bootstrap.recordReport({
      serverId,
      phase: dto.phase,
      status: dto.status,
      message: dto.message ?? null,
    });
  }
}
