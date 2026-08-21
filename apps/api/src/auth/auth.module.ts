import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TotpService } from './totp/totp.service';
import { TwoFactorService } from './totp/two-factor.service';
import { ComplianceModule } from '../compliance/compliance.module';
import { AuditModule } from '../common/audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { LoginEventService } from './login-event.service';
import { WebAuthnService } from './webauthn/webauthn.service';
import { PasskeyPolicyService } from './passkey-policy.service';
import { CaptchaService } from './captcha.service';
import { PwnedPasswordService } from './pwned-password.service';
import { EcoModule } from '../eco/eco.module';

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
