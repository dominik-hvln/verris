import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  ConfirmTwoFactorDto,
  DisableTwoFactorDto,
  LoginDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  EmailVerificationConfirmDto,
  EmailVerificationRequestDto,
  RegisterDto,
  VerifyTwoFactorDto,
} from './auth.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@verris/database';
import { TwoFactorService } from './totp/two-factor.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  // Audit F-09: strict per-route limits — registration and mail-out endpoints
  // are the main spam / enumeration vectors.
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, scope: 'auth:register' })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, requestContext(req));
  }

  @RateLimit({ limit: 10, windowMs: 60 * 1000, scope: 'auth:login', keyByBodyField: 'email' })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, requestContext(req));
  }

  @RateLimit({
    limit: 3,
    windowMs: 60 * 60 * 1000,
    scope: 'auth:pwd-reset',
    keyByBodyField: 'email',
  })
  @HttpCode(HttpStatus.OK)
  @Post('password-reset/request')
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'auth:pwd-reset-confirm' })
  @HttpCode(HttpStatus.OK)
  @Post('password-reset/confirm')
  async confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  @RateLimit({
    limit: 3,
    windowMs: 60 * 60 * 1000,
    scope: 'auth:email-verify',
    keyByBodyField: 'email',
  })
  @HttpCode(HttpStatus.OK)
  @Post('email-verification/request')
  async requestEmailVerification(@Body() dto: EmailVerificationRequestDto) {
    return this.authService.requestEmailVerification(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('email-verification/confirm')
  async confirmEmailVerification(@Body() dto: EmailVerificationConfirmDto) {
    return this.authService.confirmEmailVerification(dto);
  }

  @RateLimit({ limit: 10, windowMs: 60 * 1000, scope: 'auth:2fa' })
  @HttpCode(HttpStatus.OK)
  @Post('login/2fa')
  async loginVerifyTwoFactor(@Body() dto: VerifyTwoFactorDto, @Req() req: Request) {
    return this.authService.verifyTwoFactor(dto, requestContext(req));
  }

  // ---------------------------------------------------------------------------
  // 2FA management (E-9)
  // ---------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Get('2fa/status')
  twoFactorStatus(@CurrentUser() user: { userId: string }) {
    return this.twoFactor.getStatus(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll')
  @HttpCode(HttpStatus.OK)
  twoFactorEnroll(@CurrentUser() user: { userId: string }) {
    return this.twoFactor.startEnrollment(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/confirm')
  @HttpCode(HttpStatus.OK)
  twoFactorConfirm(
    @CurrentUser() user: { userId: string },
    @Body() dto: ConfirmTwoFactorDto,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.ip ??
      null;
    return this.twoFactor.confirmEnrollment(user.userId, dto.code, ip);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  async twoFactorDisable(
    @CurrentUser() user: { userId: string },
    @Body() dto: DisableTwoFactorDto,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.ip ??
      null;
    await this.twoFactor.disable({
      userId: user.userId,
      password: dto.password,
      code: dto.code,
      ip,
    });
    return { ok: true };
  }

  /** C3 — wyloguj wszystkie urządzenia (unieważnij wszystkie tokeny). */
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentUser() user: { userId: string; principalUserId?: string }) {
    return this.authService.logoutAllDevices(user.principalUserId ?? user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: unknown) {
    return {
      message: 'Self context successfully fetched',
      user,
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @Get('staff-only')
  getStaffInfo() {
    return {
      message: 'You have access to the staff zone.',
    };
  }
}

function requestContext(req: Request): { ip: string | null; userAgent: string | null } {
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.ip ??
    null;
  const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
  return { ip, userAgent };
}
