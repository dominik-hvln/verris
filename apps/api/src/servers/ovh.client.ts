import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

const ENDPOINTS: Record<string, string> = {
  'ovh-eu': 'https://eu.api.ovh.com/1.0',
  'ovh-ca': 'https://ca.api.ovh.com/1.0',
  'ovh-us': 'https://api.us.ovhcloud.com/1.0',
};

/**
 * Minimal signed OVH API client (v1). Auth per OVH spec:
 *   signature = "$1$" + SHA1(appSecret + "+" + consumerKey + "+" + METHOD +
 *               "+" + fullUrl + "+" + body + "+" + timestamp)
 * Uses the same credentials as the node wildcard-TLS automation
 * (OVH_APP_KEY / OVH_APP_SECRET / OVH_CONSUMER_KEY / OVH_ENDPOINT).
 */
@Injectable()
export class OvhClient {
  private readonly logger = new Logger(OvhClient.name);
  private timeDeltaSec: number | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('OVH_APP_KEY') &&
        this.config.get<string>('OVH_APP_SECRET') &&
        this.config.get<string>('OVH_CONSUMER_KEY'),
    );
  }

  private baseUrl(): string {
    const ep = this.config.get<string>('OVH_ENDPOINT') ?? 'ovh-eu';
    return ENDPOINTS[ep] ?? ENDPOINTS['ovh-eu'];
  }

  /** OVH rejects requests whose timestamp drifts > ~30s; sync once with /auth/time. */
  private async timestamp(): Promise<number> {
    if (this.timeDeltaSec === null) {
      try {
        const res = await fetch(`${this.baseUrl()}/auth/time`, { method: 'GET' });
        const serverTime = Number(await res.text());
        if (Number.isFinite(serverTime)) {
          this.timeDeltaSec = serverTime - Math.floor(Date.now() / 1000);
        } else {
          this.timeDeltaSec = 0;
        }
      } catch {
        this.timeDeltaSec = 0;
      }
    }
    return Math.floor(Date.now() / 1000) + (this.timeDeltaSec ?? 0);
  }

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const appKey = this.config.get<string>('OVH_APP_KEY')!;
    const appSecret = this.config.get<string>('OVH_APP_SECRET')!;
    const consumerKey = this.config.get<string>('OVH_CONSUMER_KEY')!;
    const url = `${this.baseUrl()}${path}`;
    const bodyStr = body === undefined ? '' : JSON.stringify(body);
    const ts = await this.timestamp();
    const toSign = [appSecret, consumerKey, method, url, bodyStr, ts].join('+');
    const signature = '$1$' + createHash('sha1').update(toSign).digest('hex');

    const res = await fetch(url, {
      method,
      headers: {
        'X-Ovh-Application': appKey,
        'X-Ovh-Consumer': consumerKey,
        'X-Ovh-Timestamp': String(ts),
        'X-Ovh-Signature': signature,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: bodyStr === '' ? undefined : bodyStr,
    });

    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        const j = JSON.parse(text);
        detail = j?.message ?? text;
      } catch {
        /* keep raw text */
      }
      throw new Error(`OVH ${method} ${path} → ${res.status}: ${detail}`);
    }
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }
}
