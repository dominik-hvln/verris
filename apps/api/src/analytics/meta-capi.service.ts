import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Meta Conversions API (server-side) — wysyłka zdarzeń konwersji bezpośrednio
 * z serwera, równolegle do Pixela w przeglądarce.
 *
 * PO CO: odzyskuje zdarzenia blokowane przez adblocki/ITP i podnosi dopasowanie
 * (EMQ). Deduplikacja z Pixelem odbywa się przez IDENTYCZNY `event_id`
 * (Pixel wysyła `purchase-<transactionId>`, my wysyłamy to samo tutaj).
 *
 * ZGODA: ta metoda ZAKŁADA, że wołający już sprawdził zgodę marketingową.
 * Bramkowanie jest po stronie klienta (relay wołany tylko gdy consent.marketing).
 *
 * BEST-EFFORT: nigdy nie rzuca do wołającego — pomiar nie może wywrócić żądania.
 */
@Injectable()
export class MetaCapiService {
  private readonly logger = new Logger(MetaCapiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private cfg() {
    return {
      datasetId:
        this.config.get<string>('metaDatasetId') ||
        process.env.META_DATASET_ID ||
        process.env.META_PIXEL_ID ||
        '',
      token: this.config.get<string>('metaCapiToken') || process.env.META_CAPI_TOKEN || '',
      version: process.env.META_GRAPH_VERSION || 'v21.0',
      testCode: process.env.META_TEST_EVENT_CODE || '',
    };
  }

  /** SHA-256 (hex) po normalizacji trim+lowercase — format wymagany przez Meta. */
  private hash(value?: string | null): string | undefined {
    if (!value) return undefined;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    return createHash('sha256').update(normalized).digest('hex');
  }

  private buildUserData(m: {
    emailHash?: string;
    externalIdHash?: string;
    clientIp?: string;
    userAgent?: string;
    fbp?: string;
    fbc?: string;
  }): Record<string, unknown> {
    const ud: Record<string, unknown> = {};
    if (m.emailHash) ud.em = [m.emailHash];
    if (m.externalIdHash) ud.external_id = [m.externalIdHash];
    if (m.clientIp) ud.client_ip_address = m.clientIp;
    if (m.userAgent) ud.client_user_agent = m.userAgent;
    if (m.fbp) ud.fbp = m.fbp;
    if (m.fbc) ud.fbc = m.fbc;
    return ud;
  }

  private async post(event: Record<string, unknown>): Promise<boolean> {
    const { datasetId, token, version, testCode } = this.cfg();
    if (!datasetId || !token) {
      this.logger.debug('Meta CAPI pominięte — brak META_DATASET_ID lub META_CAPI_TOKEN.');
      return false;
    }
    try {
      const body: Record<string, unknown> = { data: [event] };
      if (testCode) body.test_event_code = testCode;
      const res = await fetch(
        `https://graph.facebook.com/${version}/${datasetId}/events?access_token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(`Meta CAPI odrzuciło zdarzenie (${res.status}): ${text.slice(0, 300)}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`Meta CAPI błąd: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Purchase — konto zalogowane, e-mail hashowany z bazy (Advanced Matching).
   */
  async sendPurchase(input: {
    eventId: string;
    userId: string;
    value: number;
    currency: string;
    contentName?: string;
    eventSourceUrl?: string;
    clientIp?: string;
    userAgent?: string;
    fbp?: string;
    fbc?: string;
  }): Promise<boolean> {
    if (!input.eventId || !Number.isFinite(input.value) || input.value <= 0) return false;

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, anonymizedAt: true },
    });
    // Nie wysyłamy danych zanonimizowanego konta (RODO — prawo do bycia zapomnianym).
    if (!user || user.anonymizedAt) return false;

    return this.post({
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: input.eventId,
      action_source: 'website',
      ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
      user_data: this.buildUserData({
        emailHash: this.hash(user.email),
        externalIdHash: this.hash(input.userId),
        clientIp: input.clientIp,
        userAgent: input.userAgent,
        fbp: input.fbp,
        fbc: input.fbc,
      }),
      custom_data: {
        currency: input.currency,
        value: input.value,
        ...(input.contentName ? { content_name: input.contentName } : {}),
      },
    });
  }

  /**
   * Lead — z verris.pl (formularze LP/kontakt). BEZ e-maila: świadomie wysyłamy
   * tylko parametry techniczne (IP/UA/fbp/fbc), żeby nie repurposować adresów
   * z formularza kontaktowego na dopasowanie reklamowe. Dedup z Pixelem przez event_id.
   */
  async sendLead(input: {
    eventId: string;
    method?: string;
    eventSourceUrl?: string;
    clientIp?: string;
    userAgent?: string;
    fbp?: string;
    fbc?: string;
  }): Promise<boolean> {
    if (!input.eventId) return false;
    return this.post({
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: input.eventId,
      action_source: 'website',
      ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
      user_data: this.buildUserData({
        clientIp: input.clientIp,
        userAgent: input.userAgent,
        fbp: input.fbp,
        fbc: input.fbc,
      }),
      ...(input.method ? { custom_data: { content_name: input.method } } : {}),
    });
  }
}
