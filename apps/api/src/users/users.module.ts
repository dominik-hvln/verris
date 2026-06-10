import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersController } from './users.controller';
import { UsersAdminController } from './users.admin.controller';
import { CustomerIamController } from './customer-iam.controller';
import { EcoPublicController } from './eco-public.controller';
import { UsersService } from './users.service';
import { UsersAdminService } from './users.admin.service';
import { CustomerIamService } from './customer-iam.service';
import { MailModule } from '../mail/mail.module';
import { StatusModule } from '../status/status.module';
import { DiagnosticsModule } from '../diagnostics/diagnostics.module';
import { BillingModule } from '../billing/billing.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { EcoBadgeService } from './eco-badge.service';
import { EcoModule } from '../eco/eco.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwtSecret'),
        signOptions: {
          expiresIn: (config.get<string>('jwtExpiresIn') ?? '1d') as unknown as number,
        },
      }),
    }),
    MailModule,
    StatusModule,
    DiagnosticsModule,
    BillingModule,
    PlatformSettingsModule,
    EcoModule,
  ],
  controllers: [UsersController, UsersAdminController, CustomerIamController, EcoPublicController],
  providers: [UsersService, UsersAdminService, CustomerIamService, EcoBadgeService],
  exports: [UsersService, UsersAdminService, EcoBadgeService],
})
export class UsersModule {}
