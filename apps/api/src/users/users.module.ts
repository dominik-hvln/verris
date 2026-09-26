import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersController } from './users.controller.js';
import { UsersAdminController } from './users.admin.controller.js';
import { CustomerIamController } from './customer-iam.controller.js';
import { KontaController } from './konta.controller.js';
import { EcoPublicController } from './eco-public.controller.js';
import { UsersService } from './users.service.js';
import { UsersAdminService } from './users.admin.service.js';
import { CustomerIamService } from './customer-iam.service.js';
import { MailModule } from '../mail/mail.module.js';
import { StatusModule } from '../status/status.module.js';
import { DiagnosticsModule } from '../diagnostics/diagnostics.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';
import { EcoBadgeService } from './eco-badge.service.js';
import { EcoModule } from '../eco/eco.module.js';

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
  controllers: [UsersController, UsersAdminController, CustomerIamController, EcoPublicController, KontaController],
  providers: [UsersService, UsersAdminService, CustomerIamService, EcoBadgeService],
  exports: [UsersService, UsersAdminService, EcoBadgeService],
})
export class UsersModule {}
