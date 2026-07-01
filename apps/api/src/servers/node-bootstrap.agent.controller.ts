import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { NodeBootstrapService } from './node-bootstrap.service';
import { BootstrapTokenService } from './bootstrap-token.service';
import { buildNodeBootstrapScript } from './node-bootstrap.script';

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
  async script(@Query('token') token?: string): Promise<string> {
    if (!token) throw new BadRequestException('Brak tokenu.');
    // Waliduje token (bez konsumpcji — handshake konsumuje go w fazie AGENT).
    const found = await this.tokens.peek(token);
    const keys = await this.bootstrap.licenseKeysFor(found.server.id);
    return buildNodeBootstrapScript({
      apiBaseUrl: this.apiBaseUrl(),
      bootstrapToken: token,
      serverId: found.server.id,
      daLicenseKey: keys.daLicenseKey,
      clActivationKey: keys.clActivationKey,
      lsSerial: keys.lsSerial,
    });
  }

  /** Faza AGENT — istniejący skrypt handshake+agent LVE (reużycie, bez mocków). */
  @Get('agent-script')
  @Header('Content-Type', 'text/x-shellscript; charset=utf-8')
  async agentScript(@Query('token') token?: string): Promise<string> {
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
