import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Ip,
  Headers,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  ApplyReferralCodeDto,
  RedeemEcoPointsDto,
} from './users.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/me
   * Pobiera pełny profil zalogowanego użytkownika.
   */
  @Get('me')
  async getProfile(
    @CurrentUser() user: { userId: string; principalUserId?: string },
  ) {
    return this.usersService.getProfile(user.userId, user.principalUserId);
  }

  @Get('me/eco-ledger')
  ecoLedger(@CurrentUser() user: { userId: string }) {
    return this.usersService.listEcoLedger(user.userId);
  }

  @Get('me/eco-badge-stats')
  ecoBadgeStats(@CurrentUser() user: { userId: string }) {
    return this.usersService.getEcoBadgeStats(user.userId);
  }

  @Get('me/eco-program')
  ecoProgramOverview(@CurrentUser() user: { userId: string }) {
    return this.usersService.getEcoProgramOverview(user.userId);
  }

  @Get('me/referral-program')
  referralProgramStatus(@CurrentUser() user: { userId: string }) {
    return this.usersService.getReferralProgramStatus(user.userId);
  }

  @Post('me/referral-program/apply')
  applyReferralProgram(@CurrentUser() user: { userId: string }) {
    return this.usersService.applyReferralProgram(user.userId);
  }

  @Patch('me/referral')
  applyReferral(
    @CurrentUser() user: { userId: string },
    @Body() dto: ApplyReferralCodeDto,
  ) {
    return this.usersService.applyReferralCode(user.userId, dto);
  }

  @Patch('me/eco-redeem')
  redeemEcoPoints(
    @CurrentUser() user: { userId: string },
    @Body() dto: RedeemEcoPointsDto,
  ) {
    return this.usersService.redeemEcoPoints(user.userId, dto);
  }

  /**
   * PATCH /users/me
   * Aktualizuje dane profilowe i bilingowe.
   */
  @Patch('me')
  async updateProfile(
    @CurrentUser() user: { userId: string; principalUserId?: string },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(
      user.userId,
      dto,
      user.principalUserId,
    );
  }

  /**
   * PATCH /users/password
   * Zmienia hasło po weryfikacji starego.
   */
  @Patch('password')
  async changePassword(
    @CurrentUser() user: { userId: string; principalUserId?: string },
    @Body() dto: ChangePasswordDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.usersService.changePassword(user.principalUserId ?? user.userId, dto, {
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    });
  }
}
