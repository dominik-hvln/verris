import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RegistrarAvailability {
  domain: string;
  available: boolean;
  premium?: boolean;
  priceAmount?: string | null;
  currency?: string;
}

export interface RegistrarPrice {
  amount: string;
  currency: string;
}

export type RegistrarOperation = 'register' | 'renew' | 'transfer';

export interface RegistrarOrderResult {
  provider: string;
  providerOrderId: string;
  externalDomainId?: string | null;
  expiresAt?: string | null;
}

export interface RegistrarProvider {
  readonly id: string;
  availability(domain: string): Promise<RegistrarAvailability>;
  /** Wholesale/reseller price for an operation; used to bill the customer wallet. */
  price(input: { domain: string; years: number; operation: RegistrarOperation }): Promise<RegistrarPrice>;
  register(input: { domain: string; years: number; nameservers: string[] }): Promise<RegistrarOrderResult>;
  transfer(input: { domain: string; years: number; nameservers: string[]; authCode: string }): Promise<RegistrarOrderResult>;
  renew(input: { domain: string; years: number; externalId?: string | null }): Promise<RegistrarOrderResult>;
}

@Injectable()
export class RegistrarProviderFactory {
  constructor(private readonly config: ConfigService) {}

  get(): RegistrarProvider {
    const providerId = (this.config.get<string>('REGISTRAR_PROVIDER') ?? '').toLowerCase();

    if (providerId === 'openprovider') {
      const username = this.config.get<string>('OPENPROVIDER_USERNAME');
      const password = this.config.get<string>('OPENPROVIDER_PASSWORD');
      const ownerHandle = this.config.get<string>('OPENPROVIDER_OWNER_HANDLE');
      if (!username || !password || !ownerHandle) {
        throw new ServiceUnavailableException(
          'OpenProvider is not configured (OPENPROVIDER_USERNAME / OPENPROVIDER_PASSWORD / OPENPROVIDER_OWNER_HANDLE).',
        );
      }
      const baseUrl =
        this.config.get<string>('OPENPROVIDER_API_BASE_URL') ?? 'https://api.openprovider.eu';
      return new OpenProviderRegistrarProvider(baseUrl, username, password, ownerHandle);
    }

    const baseUrl = this.config.get<string>('REGISTRAR_API_BASE_URL');
    const token = this.config.get<string>('REGISTRAR_API_TOKEN');
    if (!providerId || !baseUrl || !token) {
      throw new ServiceUnavailableException('Registrar provider is not configured.');
    }
    return new HttpRegistrarProvider(providerId, baseUrl, token);
  }
}

/** Generic JSON registrar adapter (kept as a fallback / for self-hosted gateways). */
class HttpRegistrarProvider implements RegistrarProvider {
  constructor(
    readonly id: string,
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  availability(domain: string): Promise<RegistrarAvailability> {
    return this.request(`/availability?domain=${encodeURIComponent(domain)}`, { method: 'GET' });
  }

  async price(input: { domain: string; years: number; operation: RegistrarOperation }): Promise<RegistrarPrice> {
    return this.request(
      `/price?domain=${encodeURIComponent(input.domain)}&years=${input.years}&operation=${input.operation}`,
      { method: 'GET' },
    );
  }

  register(input: { domain: string; years: number; nameservers: string[] }): Promise<RegistrarOrderResult> {
    return this.request('/domains/register', { method: 'POST', body: JSON.stringify(input) });
  }

  transfer(input: { domain: string; years: number; nameservers: string[]; authCode: string }): Promise<RegistrarOrderResult> {
    return this.request('/domains/transfer', { method: 'POST', body: JSON.stringify(input) });
  }

  renew(input: { domain: string; years: number; externalId?: string | null }): Promise<RegistrarOrderResult> {
    return this.request('/domains/renew', { method: 'POST', body: JSON.stringify(input) });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        ...(init.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'message' in body ? String(body.message) : `Registrar API ${response.status}`;
      throw new ServiceUnavailableException(message);
    }
    return body as T;
  }
}

/**
 * OpenProvider reseller adapter (REST v1beta).
 *
 * Auth: POST /v1beta/auth/login → bearer token (cached ~50 min).
 * Availability + price: POST /v1beta/domains/check (with_price).
 * Register/Renew/Transfer: POST /v1beta/domains[...].
 *
 * Domains are registered under the platform's own reseller contact
 * (OPENPROVIDER_OWNER_HANDLE) so the customer never deals with OpenProvider —
 * full white-label.
 */
class OpenProviderRegistrarProvider implements RegistrarProvider {
  readonly id = 'openprovider';
  private readonly logger = new Logger(OpenProviderRegistrarProvider.name);
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
    private readonly ownerHandle: string,
  ) {}

  async availability(domain: string): Promise<RegistrarAvailability> {
    const { name, extension } = splitDomain(domain);
    const res = await this.request<{ data: { results: OpReachableResult[] } }>(
      '/v1beta/domains/check',
      { domains: [{ name, extension }], with_price: true },
    );
    const result = res.data?.results?.[0];
    const price = result?.price?.reseller ?? result?.price?.product;
    return {
      domain,
      available: result?.status === 'free',
      premium: Boolean(result?.is_premium),
      priceAmount: price ? String(price.price) : null,
      currency: price?.currency ?? 'EUR',
    };
  }

  async price(input: {
    domain: string;
    years: number;
    operation: RegistrarOperation;
  }): Promise<RegistrarPrice> {
    const { name, extension } = splitDomain(input.domain);
    const operation =
      input.operation === 'renew' ? 'renew' : input.operation === 'transfer' ? 'transfer' : 'create';
    const period = Math.min(10, Math.max(1, Math.trunc(input.years)));
    const qs = new URLSearchParams({
      'domain.name': name,
      'domain.extension': extension,
      operation,
      period: String(period),
    });
    const res = await this.request<{ data: { price?: { reseller?: OpPrice; product?: OpPrice } } }>(
      `/v1beta/domains/prices?${qs.toString()}`,
      null,
      'GET',
    );
    const price = res.data?.price?.reseller ?? res.data?.price?.product;
    if (!price) {
      throw new ServiceUnavailableException('OpenProvider: brak ceny dla domeny.');
    }
    return { amount: String(price.price), currency: price.currency ?? 'EUR' };
  }

  async register(input: { domain: string; years: number; nameservers: string[] }): Promise<RegistrarOrderResult> {
    const { name, extension } = splitDomain(input.domain);
    const res = await this.request<{ data: { id: number | string; expiration_date?: string } }>(
      '/v1beta/domains',
      {
        domain: { name, extension },
        period: input.years,
        name_servers: input.nameservers.map((ns) => ({ name: ns })),
        owner_handle: this.ownerHandle,
        admin_handle: this.ownerHandle,
        tech_handle: this.ownerHandle,
        billing_handle: this.ownerHandle,
        autorenew: 'off',
      },
    );
    return {
      provider: this.id,
      providerOrderId: String(res.data?.id ?? ''),
      externalDomainId: res.data?.id != null ? String(res.data.id) : null,
      expiresAt: res.data?.expiration_date ?? null,
    };
  }

  async transfer(input: { domain: string; years: number; nameservers: string[]; authCode: string }): Promise<RegistrarOrderResult> {
    const { name, extension } = splitDomain(input.domain);
    const res = await this.request<{ data: { id: number | string } }>('/v1beta/domains/transfer', {
      domain: { name, extension },
      period: input.years,
      authcode: input.authCode,
      name_servers: input.nameservers.map((ns) => ({ name: ns })),
      owner_handle: this.ownerHandle,
      admin_handle: this.ownerHandle,
      tech_handle: this.ownerHandle,
      billing_handle: this.ownerHandle,
    });
    return {
      provider: this.id,
      providerOrderId: String(res.data?.id ?? ''),
      externalDomainId: res.data?.id != null ? String(res.data.id) : null,
    };
  }

  async renew(input: { domain: string; years: number; externalId?: string | null }): Promise<RegistrarOrderResult> {
    if (!input.externalId) {
      throw new ServiceUnavailableException('OpenProvider: brak ID domeny do odnowienia.');
    }
    const res = await this.request<{ data: { expiration_date?: string } }>(
      `/v1beta/domains/${encodeURIComponent(input.externalId)}/renew`,
      { period: input.years },
    );
    return {
      provider: this.id,
      providerOrderId: input.externalId,
      externalDomainId: input.externalId,
      expiresAt: res.data?.expiration_date ?? null,
    };
  }

  private async ensureToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1beta/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    const body = (await res.json().catch(() => null)) as { data?: { token?: string }; desc?: string } | null;
    if (!res.ok || !body?.data?.token) {
      throw new ServiceUnavailableException(`OpenProvider auth failed: ${body?.desc ?? res.status}`);
    }
    this.token = body.data.token;
    this.tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    return this.token;
  }

  private async request<T>(path: string, payload: unknown, method = 'POST'): Promise<T> {
    const token = await this.ensureToken();
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${token}`,
      },
      body: method === 'GET' || payload == null ? undefined : JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => null)) as
      | { data?: T; code?: number; desc?: string }
      | null;
    if (!res.ok || (body && typeof body.code === 'number' && body.code !== 0)) {
      const msg = body?.desc ?? `OpenProvider API ${res.status}`;
      this.logger.warn(`OpenProvider ${path} failed: ${msg}`);
      throw new ServiceUnavailableException(`OpenProvider: ${msg}`);
    }
    return body as unknown as T;
  }
}

interface OpPrice {
  price: number;
  currency: string;
}

interface OpReachableResult {
  domain: string;
  status: string;
  is_premium?: boolean;
  price?: { reseller?: OpPrice; product?: OpPrice };
}

function splitDomain(domain: string): { name: string; extension: string } {
  const idx = domain.indexOf('.');
  if (idx <= 0) return { name: domain, extension: '' };
  return { name: domain.slice(0, idx), extension: domain.slice(idx + 1) };
}
