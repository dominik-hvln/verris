import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DomainsService } from './domains.service';
import { CreateDomainDto } from './dto/create-domain.dto';
import { DomainRegistrarService } from './domain-registrar.service';
import { DomainAvailabilityDto, RegisterDomainDto, TransferDomainDto } from './dto/registrar.dto';

@Controller('domains')
@UseGuards(AuthGuard('jwt'))
export class DomainsController {
  constructor(
    private readonly domainsService: DomainsService,
    private readonly registrar: DomainRegistrarService,
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


