import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PartnersService } from './partners.service';
import { BankPayoutDto } from './dto/partner.dto';

/** RESELL — self-service partnera (afiliacja). */
@Controller('partners')
@UseGuards(JwtAuthGuard)
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get('me/overview')
  overview(@CurrentUser() user: { userId: string }) {
    return this.partners.getOverview(user.userId);
  }

  @Get('me/commissions')
  commissions(@CurrentUser() user: { userId: string }) {
    return this.partners.listCommissions(user.userId);
  }

  @Get('me/payouts')
  payouts(@CurrentUser() user: { userId: string }) {
    return this.partners.listMyPayouts(user.userId);
  }

  @Post('me/payouts/wallet')
  @HttpCode(200)
  payoutWallet(@CurrentUser() user: { userId: string }) {
    return this.partners.requestWalletPayout(user.userId);
  }

  @Post('me/payouts/bank')
  @HttpCode(200)
  payoutBank(@CurrentUser() user: { userId: string }, @Body() dto: BankPayoutDto) {
    return this.partners.requestBankPayout(user.userId, dto.bankAccount);
  }
}
