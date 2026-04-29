import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { MailMessage, MailerProvider } from './mailer.interface';

/**
 * Default mailer for dev / staging / unconfigured production. Writes the full
 * envelope to the API logs (which are bounded by `x-logging` in compose,
 * see F-8). Useful for debugging without leaking customer addresses to a
 * real SMTP server.
 */
@Injectable()
export class LogMailerProvider implements MailerProvider {
  readonly id = 'log';
  private readonly logger = new Logger('Mailer:log');

  async send(message: MailMessage): Promise<{ providerId: string; messageId: string }> {
    const messageId = `log-${crypto.randomUUID()}`;
    this.logger.log(
      JSON.stringify({
        messageId,
        to: message.to,
        subject: message.subject,
        tag: message.tag,
        textLen: message.text.length,
        htmlLen: message.html?.length ?? 0,
      }),
    );
    return { providerId: this.id, messageId };
  }
}
