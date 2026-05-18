import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  MailerService,
  MAILER_PROVIDER,
  buildMailerProvider,
  type MailerConfig,
} from './mailer.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    {
      provide: MAILER_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildMailerProvider(config),
    },
    {
      provide: 'MAILER_CONFIG',
      inject: [ConfigService],
      useFactory: (config: ConfigService): MailerConfig => ({
        fromAddress:
          config.get<string>('SMTP_FROM_ADDRESS') || 'noreply@verris.pl',
        fromName: config.get<string>('SMTP_FROM_NAME') || 'Verris',
        // Suspicious-activity alerts must NOT block the auth flow if SMTP
        // is down. Ticket notifications are best-effort, too — we audit
        // every send so an admin can replay them later if needed.
        swallowErrors: true,
      }),
    },
    MailerService,
  ],
  exports: [MailerService],
})
export class MailModule {}
