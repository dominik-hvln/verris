import { Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResellerKlienciService } from './reseller-klienci.service';

/** O-05/O-09 — strona klienta: kto prowadzi konto i odpięcie się od partnera. */
@Controller('me/partner')
@UseGuards(JwtAuthGuard)
export class PartnerKlientaController {
  constructor(private readonly klienci: ResellerKlienciService) {}

  @Get()
  get(@CurrentUser() user: { userId: string }) {
    return this.klienci.partnerKlienta(user.userId);
  }

  @Delete()
  detach(@CurrentUser() user: { userId: string }) {
    return this.klienci.odepnijSie(user.userId);
  }
}
