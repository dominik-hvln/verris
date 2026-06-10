import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { DomainsService } from './domains.service';
import { CreateDomainDto } from './dto/create-domain.dto';
import { DomainRegistrarService } from './domain-registrar.service';
import { NbpFxService } from './nbp-fx.service';
import { parseDomainPricingConfig } from './domain-pricing.util';
import { REGISTRAR_TLD_CATALOG } from '@verris/contracts';
import {
  DomainAvailabilityDto,
  DomainQuoteDto,
  DomainQuotePeriodsDto,
  DomainSearchDto,
  RegisterDomainDto,
  TransferDomainDto,
} from './dto/registrar.dto';

@Controller('domains')
@UseGuards(AuthGuard('jwt'))
export class DomainsController {
  constructor(
    private readonly domainsService: DomainsService,
    private readonly registrar: DomainRegistrarService,
    private readonly config: ConfigService,
    private readonly nbpFx: NbpFxService,
  ) {}

  @Post()
  async create(@Req() req, @Body() createDomainDto: CreateDomainDto) {
    return this.domainsService.create(req.user.userId, createDomainDto);
  }

  @Get()
  async findAll(@Req() req) {
    return this.domainsService.findAllByUser(req.user.userId);
  }

  @Post('registrar/availability')
  async availability(@Body() dto: DomainAvailabilityDto) {
    return this.registrar.availability(dto.name);
  }

  @Post('registrar/quote')
  async quote(@Body() dto: DomainQuoteDto) {
    return this.registrar.quote(dto.name, dto.years ?? 1);
  }

  @Get('registrar/tlds')
  registrarTlds() {
    return REGISTRAR_TLD_CATALOG;
  }

  @Post('registrar/search')
  async search(@Body() dto: DomainSearchDto) {
    return this.registrar.search(dto.label);
  }

  @Post('registrar/quote-periods')
  async quotePeriods(@Body() dto: DomainQuotePeriodsDto) {
    return this.registrar.quotePeriods(dto.name, dto.years);
  }

  @Get('registrar/status')
  async registrarStatus() {
    const provider = (this.config.get<string>('REGISTRAR_PROVIDER') ?? '').toLowerCase() || null;
    let configured = false;
    let apiBaseUrl: string | null = null;

    if (provider === 'openprovider') {
      configured = Boolean(
        this.config.get<string>('OPENPROVIDER_USERNAME') &&
          this.config.get<string>('OPENPROVIDER_PASSWORD') &&
          this.config.get<string>('OPENPROVIDER_OWNER_HANDLE'),
      );
      apiBaseUrl = this.config.get<string>('OPENPROVIDER_API_BASE_URL') ?? 'https://api.openprovider.eu';
    } else if (provider) {
      configured = Boolean(
        this.config.get<string>('REGISTRAR_API_BASE_URL') &&
          this.config.get<string>('REGISTRAR_API_TOKEN'),
      );
      apiBaseUrl = this.config.get<string>('REGISTRAR_API_BASE_URL') ?? null;
    }

    const pricing = parseDomainPricingConfig((key) => this.config.get<string>(key));
    const fx = await this.nbpFx.getRates();
    return {
      provider,
      configured,
      apiBaseUrl,
      environment:
        apiBaseUrl?.includes('cte.openprovider') || apiBaseUrl?.includes('api.cte.')
          ? 'sandbox'
          : provider === 'openprovider'
            ? 'production'
            : null,
      priceMarkup: pricing.markup,
      walletCurrency: pricing.walletCurrency,
      fxRates: {
        USD_PLN: fx.usdPln,
        EUR_PLN: fx.eurPln,
        source: fx.source,
        nbpTableNo: fx.nbpTableNo,
        nbpEffectiveDate: fx.nbpEffectiveDate,
        fetchedAt: fx.fetchedAt,
        envFallbackUsdPln: pricing.usdPln,
        envFallbackEurPln: pricing.eurPln,
      },
    };
  }

  @Post('registrar/register')
  async register(@Req() req, @Body() dto: RegisterDomainDto) {
    return this.registrar.register(req.user.userId, req.user.principalUserId ?? req.user.userId, dto);
  }

  @Post('registrar/transfer')
  async transfer(@Req() req, @Body() dto: TransferDomainDto) {
    return this.registrar.transfer(req.user.userId, req.user.principalUserId ?? req.user.userId, dto);
  }

  @Get('registrar/orders')
  async orders(@Req() req) {
    return this.registrar.orders(req.user.userId);
  }

  @Post(':id/registrar/renew')
  async renew(@Req() req, @Param('id') id: string, @Body() body: { years?: number }) {
    return this.registrar.renew(req.user.userId, req.user.principalUserId ?? req.user.userId, id, body.years ?? 1);
  }

  @Get(':id')
  async findOne(@Req() req, @Param('id') id: string) {
    return this.domainsService.findOne(id, req.user.userId);
  }

  @Post(':id/verify')
  async verify(@Req() req, @Param('id') id: string) {
    return this.domainsService.verifyDomain(id, req.user.userId);
  }

  @Post(':id/checklist')
  async runChecklist(@Req() req, @Param('id') id: string) {
    return this.domainsService.runChecklist(id, req.user.userId);
  }

  @Get(':id/checklist')
  async listChecklists(@Req() req, @Param('id') id: string) {
    return this.domainsService.listChecklists(id, req.user.userId);
  }

  @Delete(':id')
  async remove(@Req() req, @Param('id') id: string) {
    return this.domainsService.remove(id, req.user.userId);
  }
}


