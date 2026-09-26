import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { TotpService } from './totp/totp.service.js';
import { TwoFactorService } from './totp/two-factor.service.js';
import { ComplianceModule } from '../compliance/compliance.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { MailModule } from '../mail/mail.module.js';
import { LoginEventService } from './login-event.service.js';
import { WebAuthnService } from './webauthn/webauthn.service.js';
import { PasskeyPolicyService } from './passkey-policy.service.js';
import { CaptchaService } from './captcha.service.js';
import { PwnedPasswordService } from './pwned-password.service.js';
import { EcoModule } from '../eco/eco.module.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('jwtSecret'),
        signOptions: {
          expiresIn: (configService.get<string>('jwtExpiresIn') ?? '1d') as unknown as number,
        },
      }),
    }),
    ComplianceModule,
    AuditModule,
    MailModule,
    EcoModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    TotpService,
    TwoFactorService,
    LoginEventService,
    WebAuthnService,
    PasskeyPolicyService,
    CaptchaService,
    PwnedPasswordService,
  ],
  exports: [
    AuthService,
    TwoFactorService,
    LoginEventService,
    WebAuthnService,
    PasskeyPolicyService,
    CaptchaService,
    PwnedPasswordService,
  ],
})
export class AuthModule {}
