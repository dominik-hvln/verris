import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DomainsService } from './domains.service';
import { CreateDomainDto } from './dto/create-domain.dto';

@Controller('domains')
@UseGuards(AuthGuard('jwt'))
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Post()
  async create(@Req() req, @Body() createDomainDto: CreateDomainDto) {
    return this.domainsService.create(req.user.userId, createDomainDto);
  }

  @Get()
  async findAll(@Req() req) {
    return this.domainsService.findAllByUser(req.user.userId);
  }

  @Get(':id')
  async findOne(@Req() req, @Param('id') id: string) {
    return this.domainsService.findOne(id, req.user.userId);
  }

  @Post(':id/verify')
  async verify(@Req() req, @Param('id') id: string) {
    return this.domainsService.verifyDomain(id, req.user.userId);
  }

  @Delete(':id')
  async remove(@Req() req, @Param('id') id: string) {
    return this.domainsService.remove(id, req.user.userId);
  }
}


