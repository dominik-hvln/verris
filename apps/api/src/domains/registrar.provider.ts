import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RegistrarAvailability {
  domain: string;
  available: boolean;
  premium?: boolean;
  priceAmount?: string | null;
  currency?: string;
}

export interface RegistrarOrderResult {
  provider: string;
  providerOrderId: string;
  externalDomainId?: string | null;
  expiresAt?: string | null;
}

export interface RegistrarProvider {
  readonly id: string;
  availability(domain: string): Promise<RegistrarAvailability>;
  register(input: { domain: string; years: number; nameservers: string[] }): Promise<RegistrarOrderResult>;
  transfer(input: { domain: string; years: number; nameservers: string[]; authCode: string }): Promise<RegistrarOrderResult>;
  renew(input: { domain: string; years: number; externalId?: string | null }): Promise<RegistrarOrderResult>;
}

@Injectable()
export class RegistrarProviderFactory {
  constructor(private readonly config: ConfigService) {}

  get(): RegistrarProvider {
    const providerId = this.config.get<string>('REGISTRAR_PROVIDER') ?? 'http';
    const baseUrl = this.config.get<string>('REGISTRAR_API_BASE_URL');
    const token = this.config.get<string>('REGISTRAR_API_TOKEN');
    if (!baseUrl || !token) {
      throw new ServiceUnavailableException('Registrar provider is not configured.');
    }
    return new HttpRegistrarProvider(providerId, baseUrl, token);
  }
}

class HttpRegistrarProvider implements RegistrarProvider {
  constructor(
    readonly id: string,
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  availability(domain: string): Promise<RegistrarAvailability> {
    return this.request(`/availability?domain=${encodeURIComponent(domain)}`, { method: 'GET' });
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
