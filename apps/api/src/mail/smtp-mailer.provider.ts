import { Injectable, Logger } from '@nestjs/common';
import * as net from 'net';
import * as tls from 'tls';
import * as crypto from 'crypto';
import { MailMessage, MailerProvider } from './mailer.interface';

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  secure: 'starttls' | 'tls' | 'none';
  heloName: string;
  messageIdDomain: string;
}

/**
 * E-3: minimal SMTP client supporting both authenticated TLS relays and a
 * plain localhost relay (Postfix on the panel server). Hand-written to keep
 * the dependency footprint small and the trust surface obvious.
 *
 * Two deployment modes:
 *
 *  1. **Panel-local Postfix relay** (preferred — no external dependency):
 *     - SMTP_HOST=localhost, SMTP_PORT=25, SMTP_SECURE=none, no AUTH
 *     - Postfix on the same host handles outbound queue, DKIM signing, and
 *       backoff/retry. We just hand off the message via 25/tcp.
 *
 *  2. **External SMTP relay** (Resend, Postmark, SES, etc.):
 *     - SMTP_HOST=smtp.example.com, SMTP_PORT=587, SMTP_SECURE=starttls,
 *       SMTP_USER=…, SMTP_PASS=…
 *     - Standard AUTH LOGIN over STARTTLS or TLS.
 *
 * If we ever need rich features (DKIM signing in-process, attachments,
 * OAuth2), we'll swap this out for nodemailer behind the same provider
 * interface. For DKIM, however, Postfix + opendkim is the production-grade
 * answer and lives outside the panel process.
 */
@Injectable()
export class SmtpMailerProvider implements MailerProvider {
  readonly id = 'smtp';
  private readonly logger = new Logger('Mailer:smtp');

  constructor(private readonly config: SmtpConfig) {}

  async send(message: MailMessage): Promise<{ providerId: string; messageId: string }> {
    const messageId = `<${crypto.randomUUID()}@${this.config.messageIdDomain}>`;
    const conversation = await this.deliver(message, messageId);
    if (!conversation.ok) {
      throw new Error(`SMTP delivery failed: ${conversation.error ?? 'unknown'}`);
    }
    return { providerId: this.id, messageId };
  }

  private async deliver(
    message: MailMessage,
    messageId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const socket = await this.connect();
    try {
      const send = (line: string) => writeLine(socket, line + '\r\n');
      const expect = (codes: number[]) => readReply(socket, codes);

      await expect([220]);
      const helo = this.config.heloName;
      await send(`EHLO ${helo}`);
      await expect([250]);

      if (this.config.secure === 'starttls') {
        await send('STARTTLS');
        await expect([220]);
        const upgraded = upgrade(socket, helo);
        await waitSecure(upgraded);
        await writeLine(upgraded, `EHLO ${helo}\r\n`);
        await readReply(upgraded, [250]);
        return await this.runAuthAndDataStage(upgraded, message, messageId);
      }
      // `tls` (already encrypted at connect) or `none` (localhost trusted hop).
      return await this.runAuthAndDataStage(socket, message, messageId);
    } catch (err) {
      this.logger.warn(
        `SMTP error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      socket.end();
    }
  }

  private async runAuthAndDataStage(
    socket: net.Socket | tls.TLSSocket,
    message: MailMessage,
    messageId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    // AUTH LOGIN only when credentials are configured. Localhost Postfix
    // relays accept connections from trusted networks (mynetworks) without
    // SMTP-level auth; passing AUTH LOGIN there would fail with 503 "Error:
    // authentication not enabled".
    if (this.config.username && this.config.password) {
      await writeLine(socket, 'AUTH LOGIN\r\n');
      await readReply(socket, [334]);
      await writeLine(socket, Buffer.from(this.config.username).toString('base64') + '\r\n');
      await readReply(socket, [334]);
      await writeLine(socket, Buffer.from(this.config.password).toString('base64') + '\r\n');
      await readReply(socket, [235]);
    }

    const fromAddress = message.fromAddress ?? this.config.fromAddress;
    const fromName = message.fromName ?? this.config.fromName;

    await writeLine(socket, `MAIL FROM:<${fromAddress}>\r\n`);
    await readReply(socket, [250]);
    await writeLine(socket, `RCPT TO:<${message.to}>\r\n`);
    await readReply(socket, [250, 251]);

    await writeLine(socket, 'DATA\r\n');
    await readReply(socket, [354]);

    const body = renderEmail({
      from: { address: fromAddress, name: fromName },
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
      messageId,
      listUnsubscribeUrl: message.listUnsubscribeUrl,
    });
    await writeLine(socket, body + '\r\n.\r\n');
    await readReply(socket, [250]);

    await writeLine(socket, 'QUIT\r\n');
    return { ok: true };
  }

  private connect(): Promise<net.Socket | tls.TLSSocket> {
    if (this.config.secure === 'tls') {
      return new Promise((resolve, reject) => {
        const sock = tls.connect({ host: this.config.host, port: this.config.port }, () =>
          resolve(sock),
        );
        sock.once('error', reject);
      });
    }
    return new Promise((resolve, reject) => {
      const sock = net.connect({ host: this.config.host, port: this.config.port }, () =>
        resolve(sock),
      );
      sock.once('error', reject);
    });
  }
}

// ---------------------------------------------------------------------------
// SMTP wire helpers — kept module-private; not exported.

async function writeLine(
  socket: net.Socket | tls.TLSSocket,
  data: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(data, (err) => (err ? reject(err) : resolve()));
  });
}

async function readReply(
  socket: net.Socket | tls.TLSSocket,
  expected: number[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      // SMTP lines: NNN-text (continuation) or NNN text (final).
      const lines = buffer.split(/\r\n/);
      const last = lines[lines.length - 2];
      if (!last) return; // not enough data yet
      if (/^\d{3} /.test(last)) {
        socket.off('data', onData);
        const code = parseInt(last.substring(0, 3), 10);
        if (!expected.includes(code)) {
          reject(new Error(`SMTP unexpected reply: ${last}`));
          return;
        }
        resolve(buffer);
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
  });
}

function upgrade(socket: net.Socket, host: string): tls.TLSSocket {
  return tls.connect({ socket, servername: host });
}

function waitSecure(socket: tls.TLSSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('secureConnect', () => resolve());
    socket.once('error', reject);
  });
}

interface RenderInput {
  from: { address: string; name: string };
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  messageId: string;
  /**
   * Gdy podane — dodajemy headery `List-Unsubscribe` oraz `List-Unsubscribe-Post`
   * (RFC 8058 one-click). Wymóg deliverability dla Gmail/Outlook dla maili
   * marketingowych.
   */
  listUnsubscribeUrl?: string;
}

function renderEmail(input: RenderInput): string {
  const boundary = `----=verris-${crypto.randomBytes(8).toString('hex')}`;
  const headers = [
    `From: "${input.from.name}" <${input.from.address}>`,
    `To: <${input.to}>`,
    input.replyTo ? `Reply-To: <${input.replyTo}>` : '',
    `Subject: ${encodeHeaderUtf8(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${input.messageId}`,
    input.listUnsubscribeUrl ? `List-Unsubscribe: <${input.listUnsubscribeUrl}>` : '',
    input.listUnsubscribeUrl ? `List-Unsubscribe-Post: List-Unsubscribe=One-Click` : '',
    `MIME-Version: 1.0`,
    input.html
      ? `Content-Type: multipart/alternative; boundary="${boundary}"`
      : `Content-Type: text/plain; charset=utf-8`,
  ]
    .filter(Boolean)
    .join('\r\n');

  if (!input.html) {
    return `${headers}\r\n\r\n${dotStuff(input.text)}`;
  }

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    dotStuff(input.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    dotStuff(input.html),
    `--${boundary}--`,
  ].join('\r\n');

  return `${headers}\r\n\r\n${body}`;
}

function encodeHeaderUtf8(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function dotStuff(body: string): string {
  // RFC 5321: lines starting with '.' must be doubled to '..' in DATA.
  return body.replace(/\r\n/g, '\n').replace(/^\./gm, '..').replace(/\n/g, '\r\n');
}
