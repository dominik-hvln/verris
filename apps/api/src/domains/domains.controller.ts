import { BadRequestException, Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { DomainsService } from './domains.service';
import { CreateDomainDto } from './dto/create-domain.dto';
import { DomainRegistrarService } from './domain-registrar.service';
import { NbpFxService } from './nbp-fx.service';
import { parseDomainPricingConfig } from './domain-pricing.util';
import { REGISTRAR_TLD_CATALOG } from './registrar-tld-catalog';
import {
  DomainAvailabilityDto,
  DomainQuoteDto,
  DomainQuotePeriodsDto,
  DomainSearchDto,
  RegisterDomainDto,
  RegistrantDto,
  TransferDomainDto,
  TransferLockDto,
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

  /** Czy na koncie obowiązuje już oświadczenie domenowe (Regulamin §12 ust. 8). */
  @Get('registrar/waiver-consent')
  async waiverConsent(@Req() req) {
    return this.registrar.hasStandingWaiverConsent(req.user.userId);
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

  @Post(':id/registrar/renew-quote')
  async renewQuote(@Req() req, @Param('id') id: string, @Body() body: { years?: number }) {
    return this.registrar.renewQuote(req.user.userId, id, lataOdnowienia(body?.years));
  }

  @Post(':id/registrar/renew')
  async renew(@Req() req, @Param('id') id: string, @Body() body: { years?: number }) {
    return this.registrar.renew(req.user.userId, req.user.principalUserId ?? req.user.userId, id, lataOdnowienia(body?.years));
  }

  /** A-13 — dane abonenta (właściciela) domeny. Tylko właściciel konta — reguła w customer-permissions. */
  @Get(':id/registrar/registrant')
  async registrant(@Req() req, @Param('id') id: string) {
    return this.registrar.registrant(req.user.userId, id);
  }

  @Put(':id/registrar/registrant')
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'domains:registrant' })
  async updateRegistrant(@Req() req, @Param('id') id: string, @Body() dto: RegistrantDto) {
    return this.registrar.updateRegistrant(req.user.userId, req.user.principalUserId ?? req.user.userId, id, dto);
  }

  /** A-15 — blokada transferu. */
  @Post(':id/registrar/lock')
  async transferLock(@Req() req, @Param('id') id: string, @Body() dto: TransferLockDto) {
    return this.registrar.setTransferLock(req.user.userId, req.user.principalUserId ?? req.user.userId, id, dto.locked);
  }

  /** A-09 — kod transferu (authinfo) do przeniesienia domeny do innego rejestratora. */
  @Post(':id/registrar/authcode')
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, scope: 'domains:authcode' })
  async authCode(@Req() req, @Param('id') id: string) {
    return this.registrar.authCode(req.user.userId, req.user.principalUserId ?? req.user.userId, id);
  }

  @Get(':id')
  async findOne(@Req() req, @Param('id') id: string) {
    return this.domainsService.findOneForOwner(id, req.user.userId);
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

/** A-10 — liczba lat odnowienia z body bez DTO: całkowita 1–10, inaczej 400 (wcześniej przechodziło cokolwiek). */
function lataOdnowienia(v: unknown): number {
  if (v === undefined || v === null) return 1;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 10) {
    throw new BadRequestException('Okres odnowienia: od 1 do 10 lat.');
  }
  return v;
}
