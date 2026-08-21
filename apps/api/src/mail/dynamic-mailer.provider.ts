import { Injectable } from '@nestjs/common';
import { MailMessage, MailerProvider } from './mailer.interface';
import { MailSettingsService } from './mail-settings.service';

/**
 * Resolves SMTP config from platform settings (admin) + env on every send so
 * relay changes apply without API restart.
 */
@Injectable()
export class DynamicMailerProvider implements MailerProvider {
  readonly id = 'dynamic-smtp';

  constructor(private readonly mailSettings: MailSettingsService) {}

  async send(message: MailMessage): Promise<{ providerId: string; messageId: string }> {
    const provider = await this.mailSettings.resolveProvider();
    const result = await provider.send(message);
    return { providerId: provider.id, messageId: result.messageId };
  }
}
