import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { DomainsService } from './domains.service.js';
import { CreateDomainDto } from './dto/create-domain.dto.js';
import { DomainRegistrarService } from './domain-registrar.service.js';
import { NbpFxService } from './nbp-fx.service.js';
import { parseDomainPricingConfig } from './domain-pricing.util.js';
import { REGISTRAR_TLD_CATALOG } from './registrar-tld-catalog.js';
import {
  DomainAvailabilityDto,
  DomainQuoteDto,
  DomainQuotePeriodsDto,
  DomainSearchDto,
  RegisterDomainDto,
  RegistrantDto,
  TransferDomainDto,
  TransferLockDto,
  OkresOdnowieniaDto,
} from './dto/registrar.dto.js';

/** Tożsamość z JWT: `principalUserId` = człowiek za subkontem albo impersonacją. */
type Uzytkownik = { userId: string; principalUserId?: string };

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
  async create(@CurrentUser() user: Uzytkownik, @Body() createDomainDto: CreateDomainDto) {
    return this.domainsService.create(user.userId, createDomainDto);
  }

  @Get()
  async findAll(@CurrentUser() user: Uzytkownik) {
    return this.domainsService.findAllByUser(user.userId);
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
  async waiverConsent(@CurrentUser() user: Uzytkownik) {
    return this.registrar.hasStandingWaiverConsent(user.userId);
  }

  @Post('registrar/register')
  async register(@CurrentUser() user: Uzytkownik, @Body() dto: RegisterDomainDto) {
    return this.registrar.register(user.userId, user.principalUserId ?? user.userId, dto);
  }

  @Post('registrar/transfer')
  async transfer(@CurrentUser() user: Uzytkownik, @Body() dto: TransferDomainDto) {
    return this.registrar.transfer(user.userId, user.principalUserId ?? user.userId, dto);
  }

  @Get('registrar/orders')
  async orders(@CurrentUser() user: Uzytkownik) {
    return this.registrar.orders(user.userId);
  }

  @Post(':id/registrar/renew-quote')
  async renewQuote(@CurrentUser() user: Uzytkownik, @Param('id') id: string, @Body() body: OkresOdnowieniaDto) {
    return this.registrar.renewQuote(user.userId, id, body.years ?? 1);
  }

  @Post(':id/registrar/renew')
  async renew(@CurrentUser() user: Uzytkownik, @Param('id') id: string, @Body() body: OkresOdnowieniaDto) {
    return this.registrar.renew(user.userId, user.principalUserId ?? user.userId, id, body.years ?? 1);
  }

  /** A-13 — dane abonenta (właściciela) domeny. Tylko właściciel konta — reguła w customer-permissions. */
  @Get(':id/registrar/registrant')
  async registrant(@CurrentUser() user: Uzytkownik, @Param('id') id: string) {
    return this.registrar.registrant(user.userId, id);
  }

  @Put(':id/registrar/registrant')
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'domains:registrant' })
  async updateRegistrant(@CurrentUser() user: Uzytkownik, @Param('id') id: string, @Body() dto: RegistrantDto) {
    return this.registrar.updateRegistrant(user.userId, user.principalUserId ?? user.userId, id, dto);
  }

  /** A-15 — blokada transferu. */
  @Post(':id/registrar/lock')
  async transferLock(@CurrentUser() user: Uzytkownik, @Param('id') id: string, @Body() dto: TransferLockDto) {
    return this.registrar.setTransferLock(user.userId, user.principalUserId ?? user.userId, id, dto.locked);
  }

  /** A-09 — kod transferu (authinfo) do przeniesienia domeny do innego rejestratora. */
  @Post(':id/registrar/authcode')
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, scope: 'domains:authcode' })
  async authCode(@CurrentUser() user: Uzytkownik, @Param('id') id: string) {
    return this.registrar.authCode(user.userId, user.principalUserId ?? user.userId, id);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: Uzytkownik, @Param('id') id: string) {
    return this.domainsService.findOneForOwner(id, user.userId);
  }

  @Post(':id/verify')
  async verify(@CurrentUser() user: Uzytkownik, @Param('id') id: string) {
    return this.domainsService.verifyDomain(id, user.userId);
  }

  @Post(':id/checklist')
  async runChecklist(@CurrentUser() user: Uzytkownik, @Param('id') id: string) {
    return this.domainsService.runChecklist(id, user.userId);
  }

  @Get(':id/checklist')
  async listChecklists(@CurrentUser() user: Uzytkownik, @Param('id') id: string) {
    return this.domainsService.listChecklists(id, user.userId);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: Uzytkownik, @Param('id') id: string) {
    return this.domainsService.remove(id, user.userId);
  }
}

/** A-10 — liczba lat odnowienia z body bez DTO: całkowita 1–10, inaczej 400 (wcześniej przechodziło cokolwiek). */
