import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResellerService } from './reseller.service';

/** RSL — panel resellera (self-service, JWT). */
@Controller('reseller')
@UseGuards(JwtAuthGuard)
export class ResellerController {
  constructor(private readonly reseller: ResellerService) {}

  @Get('me/overview')
  overview(@CurrentUser() user: { userId: string }) {
    return this.reseller.getOverview(user.userId);
  }

  @Get('me/clients')
  clients(@CurrentUser() user: { userId: string }) {
    return this.reseller.listClients(user.userId);
  }
}
