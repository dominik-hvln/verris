import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResellerService } from './reseller.service';

class WniosekResellerDto {
  @IsOptional() @IsString() @MaxLength(80) brandName?: string;
}

/** RSL — panel resellera (self-service, JWT). */
@Controller('reseller')
@UseGuards(JwtAuthGuard)
export class ResellerController {
  constructor(private readonly reseller: ResellerService) {}

  @Get('me/overview')
  overview(@CurrentUser() user: { userId: string }) {
    return this.reseller.getOverview(user.userId);
  }

  /** O-08 — wniosek o program resellerski (PENDING do akceptacji operatora). */
  @Post('me/apply')
  apply(@CurrentUser() user: { userId: string }, @Body() body: WniosekResellerDto) {
    return this.reseller.apply(user.userId, body);
  }

  @Get('me/clients')
  clients(@CurrentUser() user: { userId: string }) {
    return this.reseller.listClients(user.userId);
  }
}
