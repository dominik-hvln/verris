import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { WebAuthnService } from './webauthn/webauthn.service';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactor: TwoFactorService,
    private readonly webauthn: WebAuthnService,
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

  // ---------------------------------------------------------------------------
  // C2 — Passkeys (WebAuthn)
  // ---------------------------------------------------------------------------

  /** Status: czy passkeys są dostępne (RP skonfigurowane). */
  @Get('webauthn/status')
  webauthnStatus() {
    return { available: this.webauthn.isConfigured() };
  }

  /** Opcje rejestracji nowego passkey (zalogowany użytkownik). */
  @UseGuards(JwtAuthGuard)
  @Post('webauthn/register/options')
  @HttpCode(HttpStatus.OK)
  webauthnRegisterOptions(@CurrentUser() user: { principalUserId?: string; userId: string }) {
    return this.webauthn.registrationOptions(user.principalUserId ?? user.userId);
  }

  /** Weryfikacja i zapis nowego passkey. */
  @UseGuards(JwtAuthGuard)
  @Post('webauthn/register/verify')
  @HttpCode(HttpStatus.OK)
  webauthnRegisterVerify(
    @CurrentUser() user: { principalUserId?: string; userId: string },
    @Body() dto: { response: RegistrationResponseJSON; deviceName?: string },
  ) {
    return this.webauthn.verifyRegistration(
      user.principalUserId ?? user.userId,
      dto.response,
      dto.deviceName,
    );
  }

  /** Opcje logowania passkey — e-mail opcjonalny (discoverable credentials). */
  @RateLimit({ limit: 20, windowMs: 60 * 1000, scope: 'auth:webauthn-login' })
  @Post('webauthn/login/options')
  @HttpCode(HttpStatus.OK)
  webauthnLoginOptions(@Body() dto: { email?: string }) {
    return this.webauthn.authenticationOptions(dto.email);
  }

  /** Weryfikacja logowania passkey → wydanie JWT. */
  @RateLimit({ limit: 20, windowMs: 60 * 1000, scope: 'auth:webauthn-verify' })
  @Post('webauthn/login/verify')
  @HttpCode(HttpStatus.OK)
  async webauthnLoginVerify(
    @Body() dto: { response: AuthenticationResponseJSON },
    @Req() req: Request,
  ) {
    const { userId } = await this.webauthn.verifyAuthentication(dto.response);
    return this.authService.loginWithVerifiedUser(userId, requestContext(req), 'passkey');
  }

  /** Lista zarejestrowanych passkeys. */
  @UseGuards(JwtAuthGuard)
  @Get('webauthn/credentials')
  webauthnList(@CurrentUser() user: { principalUserId?: string; userId: string }) {
    return this.webauthn.listCredentials(user.principalUserId ?? user.userId);
  }

  /** Usunięcie passkey. */
  @UseGuards(JwtAuthGuard)
  @Post('webauthn/credentials/:id/delete')
  @HttpCode(HttpStatus.OK)
  webauthnDelete(
    @CurrentUser() user: { principalUserId?: string; userId: string },
    @Param('id') id: string,
  ) {
    return this.webauthn.deleteCredential(user.principalUserId ?? user.userId, id);
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
