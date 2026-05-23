import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  MailerService,
  MAILER_PROVIDER,
  type MailerConfig,
} from './mailer.service';
import { DynamicMailerProvider } from './dynamic-mailer.provider';
import { MailSettingsService } from './mail-settings.service';
import { MailSettingsAdminController } from './mail-settings.admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoModule } from '../common/crypto/crypto.module';
import { AuditModule } from '../common/audit/audit.module';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule, CryptoModule, AuditModule],
  controllers: [MailSettingsAdminController],
  providers: [
    MailSettingsService,
    DynamicMailerProvider,
    {
      provide: MAILER_PROVIDER,
      useExisting: DynamicMailerProvider,
    },
    {
      provide: 'MAILER_CONFIG',
      inject: [ConfigService],
      useFactory: (config: ConfigService): MailerConfig => ({
        fromAddress:
          config.get<string>('SMTP_FROM_ADDRESS') || 'panel@verris.pl',
        fromName: config.get<string>('SMTP_FROM_NAME') || 'Verris',
        swallowErrors: true,
      }),
    },
    MailerService,
  ],
  exports: [MailerService, MailSettingsService],
})
export class MailModule {}
